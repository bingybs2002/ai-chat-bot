import * as z from "zod";
import { getUser } from "@/lib/dal";
import { ChatError, type ChatErrorCode, type ReplyTurn, generateReply, startReply } from "@/lib/services/chat-service";

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

const STATUS: Record<ChatErrorCode, number> = { busy: 409, not_found: 404, quota_exhausted: 403 };

const jsonError = (status: number, error: string, code?: string) =>
  Response.json({ error, code }, { status });

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return jsonError(401, "Your session has expired. Please log in again.", "unauthorized");

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const { conversationId, message } = parsed.data;

  let turn: ReplyTurn;
  try {
    turn = await startReply(user.id, conversationId, message);
  } catch (error) {
    if (!(error instanceof ChatError)) throw error;
    // The client only acts on quota_exhausted; the other codes are just shown as the message.
    return jsonError(STATUS[error.code], error.message, error.code === "quota_exhausted" ? error.code : undefined);
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

      send({ type: "conversation", id: turn.conversationId });
      const result = await generateReply(turn, (text) => send({ type: "delta", text }), req.signal);
      send({ type: "done", ...result });
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
