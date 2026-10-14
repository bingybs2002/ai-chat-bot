import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod";
import { MODEL, QuotaError, SYSTEM_PROMPT, describeError, getAnthropic, totalTokens } from "@/lib/ai";
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

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, tokensUsed: true },
  });
  if (!user) return jsonError(401, "Your session has expired. Please log in again.", "unauthorized");

  const remaining = tokensRemaining(user.tokensUsed);
  if (remaining <= 0) return jsonError(403, QUOTA_EXHAUSTED_MESSAGE, "quota_exhausted");

  if (conversationId) {
    const owned = await prisma.conversation.count({ where: { id: conversationId, userId: user.id } });
    if (!owned) return jsonError(404, "This conversation no longer exists.");
  }

  // Allow one reply per user at a time, so a second request (e.g. another tab) can't spend
  // the same remaining tokens. The conditional update makes taking the lock atomic; a lock
  // left behind by a crashed request expires.
  const locked = await prisma.user.updateMany({
    where: {
      id: user.id,
      tokensUsed: user.tokensUsed,
      OR: [{ generatingSince: null }, { generatingSince: { lt: new Date(Date.now() - LOCK_TTL_MS) } }],
    },
    data: { generatingSince: new Date() },
  });
  if (locked.count === 0) {
    return jsonError(409, "Another reply is still being generated. Wait for it to finish and try again.");
  }
  // Records what was actually spent and releases the lock. Must run exactly once.
  const settle = (spent: number) =>
    prisma.user.update({
      where: { id: user.id },
      data: { tokensUsed: { increment: spent }, generatingSince: null },
    });

  let conversation: { id: string };
  let history: Anthropic.MessageParam[];
  try {
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
    await settle(0);
    throw error;
  }

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

        const stream = anthropic.messages.stream(
          {
            model: MODEL,
            max_tokens: Math.min(outputBudget, 64_000),
            system: SYSTEM_PROMPT,
            messages: history,
            // Low effort keeps replies (and the thinking that counts toward the quota) lean for chat.
            output_config: { effort: "low" },
            cache_control: { type: "ephemeral" },
          },
          { signal: req.signal },
        );

        for await (const event of stream) {
          if (event.type === "message_start") {
            spent = totalTokens(event.message.usage);
          } else if (event.type === "message_delta") {
            spent = totalTokens({ ...event.usage, input_tokens: event.usage.input_tokens ?? 0 });
          } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            send({ type: "delta", text: event.delta.text });
          }
        }

        const final = await stream.finalMessage();
        spent = totalTokens(final.usage);
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
      const settled = await settle(spent);

      send({ type: "done", messageId, error, tokensRemaining: tokensRemaining(settled.tokensUsed) });
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
