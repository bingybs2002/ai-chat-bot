import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { MODEL, QuotaError, SYSTEM_PROMPT, chatRequest, describeError, getAnthropic, quotaTokens } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { QUOTA_EXHAUSTED_MESSAGE, tokensRemaining } from "@/lib/quota";
import { getSession } from "@/lib/session";

// Smallest output budget worth sending a request for; below this the reply would be cut off immediately.
const MIN_REPLY_TOKENS = 200;
// A reply lock older than this is assumed to belong to a request that died.
const LOCK_TTL_MS = 10 * 60 * 1000;

const BodySchema = z.object({
  conversationId: z.string().min(1).optional(),
  message: z.string().trim().min(1, { error: "Message can't be empty." }).max(8000, {
    error: "Message is too long (8,000 characters max).",
  }),
});

/**
 * Events streamed back to the client, one JSON object per line:
 *   { type: "conversation", id }        - the conversation this turn belongs to
 *   { type: "delta", text }             - a chunk of the assistant's reply
 *   { type: "done", messageId, error, tokensRemaining }
 */
export type ChatStreamEvent =
  | { type: "conversation"; id: string }
  | { type: "delta"; text: string }
  | { type: "done"; messageId: string | null; error: string | null; tokensRemaining: number };

const jsonError = (status: number, error: string, code?: string) =>
  Response.json({ error, code }, { status });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return jsonError(401, "Your session has expired. Please log in again.", "unauthorized");

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const { conversationId, message } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true } });
  if (!user) return jsonError(401, "Your session has expired. Please log in again.", "unauthorized");

  // Allow one reply per user at a time, so a second request (e.g. another tab) can't spend
  // the same remaining tokens. The conditional update makes taking the lock atomic; a lock
  // left behind by a crashed request expires.
  const locked = await prisma.user.updateMany({
    where: {
      id: user.id,
      OR: [{ generatingSince: null }, { generatingSince: { lt: new Date(Date.now() - LOCK_TTL_MS) } }],
    },
    data: { generatingSince: new Date() },
  });
  if (locked.count === 0) {
    return jsonError(409, "Another reply is still being generated. Wait for it to finish and try again.");
  }
  const unlock = () => prisma.user.update({ where: { id: user.id }, data: { generatingSince: null } });

  let conversation: { id: string };
  let remaining: number;
  let history: Anthropic.MessageParam[];
  try {
    // Each chat has its own allowance. It's read while holding the lock, so it can't be stale.
    const existing = conversationId
      ? await prisma.conversation.findFirst({
          where: { id: conversationId, userId: user.id },
          select: { tokensUsed: true },
        })
      : { tokensUsed: 0 };
    if (!existing) {
      await unlock();
      return jsonError(404, "This conversation no longer exists.");
    }
    remaining = tokensRemaining(existing.tokensUsed);
    if (remaining <= 0) {
      await unlock();
      return jsonError(403, QUOTA_EXHAUSTED_MESSAGE, "quota_exhausted");
    }

    conversation = conversationId
      ? await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
      : await prisma.conversation.create({
          data: { userId: user.id, title: message.length > 60 ? `${message.slice(0, 57)}…` : message },
        });
    await prisma.message.create({ data: { conversationId: conversation.id, role: "user", content: message } });

    // The model's memory is the conversation so far. Failed assistant turns are shown in the UI
    // but left out here; consecutive user turns that result are merged by the API.
    const rows = await prisma.message.findMany({
      where: { conversationId: conversation.id, error: null },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    });
    history = rows.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  } catch (error) {
    await unlock();
    throw error;
  }
  // Records what this chat actually spent and releases the lock. Must run exactly once.
  // updateMany, so a chat deleted mid-reply doesn't keep the lock held.
  const settle = (spent: number) =>
    prisma.$transaction([
      prisma.conversation.updateMany({ where: { id: conversation.id }, data: { tokensUsed: { increment: spent } } }),
      unlock(),
    ]);

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // Client disconnected; keep going so the turn is still saved.
        }
      };
      send({ type: "conversation", id: conversation.id });

      let text = "";
      let spent = 0;
      let error: string | null = null;

      try {
        const anthropic = getAnthropic();

        // Measure the prompt first so input + output can never exceed what's left.
        const { input_tokens } = await anthropic.messages.countTokens({
          model: MODEL,
          system: SYSTEM_PROMPT,
          messages: history,
        });
        const outputBudget = remaining - input_tokens;
        if (outputBudget < MIN_REPLY_TOKENS) {
          throw new QuotaError(
            `This conversation needs about ${input_tokens.toLocaleString("en-US")} tokens of context, but you only have ${remaining.toLocaleString("en-US")} left. Start a new chat to use the rest.`,
          );
        }

        const stream = anthropic.messages.stream(chatRequest(history, Math.min(outputBudget, 64_000)), {
          signal: req.signal,
        });

        for await (const event of stream) {
          if (event.type === "message_start") {
            spent = quotaTokens(event.message.usage);
          } else if (event.type === "message_delta") {
            spent = quotaTokens({ ...event.usage, input_tokens: event.usage.input_tokens ?? 0 });
          } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            send({ type: "delta", text: event.delta.text });
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
        const saved = await prisma.message.create({
          data: { conversationId: conversation.id, role: "assistant", content: text, error, tokens: spent },
          select: { id: true },
        });
        messageId = saved.id;
      } catch (err) {
        console.error("[chat] failed to save reply:", err);
        error ??= "Your reply couldn't be saved. Please try again.";
      }
      await settle(spent);

      send({ type: "done", messageId, error, tokensRemaining: Math.max(0, remaining - spent) });
      try {
        controller.close();
      } catch {}
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
