import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { MODEL, QuotaError, SYSTEM_PROMPT, chatRequest, describeError, getAnthropic, quotaTokens } from "@/lib/ai";
import type { ChatMessage } from "@/lib/definitions";
import { QUOTA_EXHAUSTED_MESSAGE, tokensRemaining } from "@/lib/quota";
import { conversationRepository } from "@/lib/repositories/conversation-repository";
import { messageRepository } from "@/lib/repositories/message-repository";
import { inTransaction } from "@/lib/repositories/transaction";
import { userRepository } from "@/lib/repositories/user-repository";

// Smallest output budget worth sending a request for; below this the reply would be cut off immediately.
const MIN_REPLY_TOKENS = 200;
// A reply lock older than this is assumed to belong to a request that died.
const LOCK_TTL_MS = 10 * 60 * 1000;

export function listConversations(userId: string) {
  return conversationRepository.listByUser(userId);
}

/** The user's conversation with its messages, or null if it doesn't exist or isn't theirs. */
export async function getConversation(userId: string, id: string) {
  const conversation = await conversationRepository.findWithMessages(id, userId);
  if (!conversation) return null;
  return { ...conversation, messages: conversation.messages as ChatMessage[] };
}

/**
 * Deletes all of the user's chats (and with them, their token usage) and releases the
 * "reply in progress" lock, which can otherwise stay held for up to 10 minutes after a
 * request dies mid-reply.
 */
export async function clearAllChats(userId: string) {
  await inTransaction([conversationRepository.deleteAllByUser(userId), userRepository.releaseReplyLock(userId)]);
}

export type ChatErrorCode = "busy" | "not_found" | "quota_exhausted";

/** A reply that can't be started, with a message that's safe to show users. */
export class ChatError extends Error {
  constructor(
    readonly code: ChatErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** A reply that has been started: the lock is held and the user's message is saved. */
export type ReplyTurn = {
  userId: string;
  conversationId: string;
  /** Tokens this chat had left before this turn. */
  remaining: number;
  history: Anthropic.MessageParam[];
};

export type ReplyResult = { messageId: string | null; error: string | null; tokensRemaining: number };

/**
 * Takes the user's reply lock, checks the chat's allowance, creates the chat if needed and
 * saves the user's message. Throws ChatError when the reply can't start. On success the
 * caller must pass the turn to generateReply exactly once, which releases the lock.
 */
export async function startReply(userId: string, conversationId: string | undefined, message: string): Promise<ReplyTurn> {
  // One reply per user at a time, so a second request (e.g. another tab) can't spend the
  // same remaining tokens.
  if (!(await userRepository.acquireReplyLock(userId, new Date(Date.now() - LOCK_TTL_MS)))) {
    throw new ChatError("busy", "Another reply is still being generated. Wait for it to finish and try again.");
  }

  try {
    // Each chat has its own allowance. It's read while holding the lock, so it can't be stale.
    const existing = conversationId ? await conversationRepository.findUsage(conversationId, userId) : { tokensUsed: 0 };
    if (!existing) throw new ChatError("not_found", "This conversation no longer exists.");

    const remaining = tokensRemaining(existing.tokensUsed);
    if (remaining <= 0) throw new ChatError("quota_exhausted", QUOTA_EXHAUSTED_MESSAGE);

    const conversation = conversationId
      ? await conversationRepository.touch(conversationId)
      : await conversationRepository.create(userId, message.length > 60 ? `${message.slice(0, 57)}…` : message);
    await messageRepository.create({ conversationId: conversation.id, role: "user", content: message });

    // The model's memory is the conversation so far; consecutive user turns left by failed
    // replies are merged by the API.
    const rows = await messageRepository.listForModel(conversation.id);
    const history = rows.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    return { userId, conversationId: conversation.id, remaining, history };
  } catch (error) {
    await userRepository.releaseReplyLock(userId);
    throw error;
  }
}

/**
 * Streams the model's reply to `onDelta`, saves it, records what the chat spent and releases
 * the lock. Model failures don't throw: they come back as `error`, readable by users.
 */
export async function generateReply(
  turn: ReplyTurn,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<ReplyResult> {
  let text = "";
  let spent = 0;
  let error: string | null = null;

  try {
    const anthropic = getAnthropic();

    // Measure the prompt first so input + output can never exceed what's left.
    const { input_tokens } = await anthropic.messages.countTokens({
      model: MODEL,
      system: SYSTEM_PROMPT,
      messages: turn.history,
    });
    const outputBudget = turn.remaining - input_tokens;
    if (outputBudget < MIN_REPLY_TOKENS) {
      throw new QuotaError(
        `This conversation needs about ${input_tokens.toLocaleString("en-US")} tokens of context, but you only have ${turn.remaining.toLocaleString("en-US")} left. Start a new chat to use the rest.`,
      );
    }

    const stream = anthropic.messages.stream(chatRequest(turn.history, Math.min(outputBudget, 64_000)), { signal });

    for await (const event of stream) {
      if (event.type === "message_start") {
        spent = quotaTokens(event.message.usage);
      } else if (event.type === "message_delta") {
        spent = quotaTokens({ ...event.usage, input_tokens: event.usage.input_tokens ?? 0 });
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        onDelta(event.delta.text);
      }
    }

    const final = await stream.finalMessage();
    spent = quotaTokens(final.usage);
    if (final.stop_reason === "refusal") {
      text = ""; // a declined reply's partial output isn't a real answer
      error = "The assistant declined to respond to this message. Try rephrasing it.";
    } else if (final.stop_reason === "max_tokens") {
      error =
        outputBudget <= 64_000
          ? "The reply was cut off because it reached your remaining token allowance."
          : "The reply was cut off because it got too long.";
    } else if (!text) {
      error = "The assistant returned an empty reply. Please try again.";
    }
  } catch (err) {
    if (!(err instanceof QuotaError)) console.error("[chat] model request failed:", err);
    error = describeError(err);
  }

  let messageId: string | null = null;
  try {
    const saved = await messageRepository.create({
      conversationId: turn.conversationId,
      role: "assistant",
      content: text,
      error,
      tokens: spent,
    });
    messageId = saved.id;
  } catch (err) {
    console.error("[chat] failed to save reply:", err);
    error ??= "Your reply couldn't be saved. Please try again.";
  }

  // Record what this chat actually spent and release the lock, together.
  await inTransaction([
    conversationRepository.addTokensUsed(turn.conversationId, spent),
    userRepository.releaseReplyLock(turn.userId),
  ]);

  return { messageId, error, tokensRemaining: Math.max(0, turn.remaining - spent) };
}
