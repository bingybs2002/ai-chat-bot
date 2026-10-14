import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Smallest, cheapest current Claude model. It has no server-side refusal fallback, so
// declined messages are shown to the user as a readable error (see the chat route).
export const MODEL = "claude-haiku-5-5";

export const SYSTEM_PROMPT =
  "You are a helpful, friendly assistant in a chat app. Keep answers concise: each user has a small, fixed token allowance.";

let client: Anthropic | undefined;

// Created lazily so a missing API key surfaces as a readable chat error, not a crash at import time.
export function getAnthropic() {
  client ??= new Anthropic();
  return client;
}

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

const sumUsage = (u: Usage) =>
  u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + u.output_tokens;

/**
 * Total tokens billed for a response. When the API reports per-iteration usage, the
 * top-level numbers only cover the last iteration, so sum every iteration instead.
 */
export function totalTokens(usage: Usage & { iterations?: Usage[] | null }) {
  return usage.iterations?.length ? usage.iterations.reduce((n, it) => n + sumUsage(it), 0) : sumUsage(usage);
}

/** Thrown when the user's remaining allowance can't cover a request. */
export class QuotaError extends Error {}

/** Turns any failure while talking to the model into a message that's safe to show users. */
export function describeError(error: unknown): string {
  if (error instanceof QuotaError) return error.message;
  if (error instanceof Anthropic.APIUserAbortError) return "Response stopped.";
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return "The assistant isn't configured correctly (the AI service rejected our credentials). Please contact the site admin.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "The assistant is receiving too many requests right now. Please wait a moment and try again.";
  }
  if (error instanceof Anthropic.InternalServerError) {
    return "The AI service is temporarily unavailable or overloaded. Please try again shortly.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    return "The AI service couldn't process this message. Try rephrasing it or starting a new chat.";
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return "The AI service took too long to respond. Please try again.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the AI service. Please try again in a moment.";
  }
  if (error instanceof Anthropic.APIError) {
    return `The AI service returned an error (${error.status ?? "unknown"}). Please try again.`;
  }
  if (error instanceof Anthropic.AnthropicError) {
    // Non-HTTP SDK errors, e.g. the response stream was cut off mid-reply.
    return "The connection to the AI service was interrupted before the reply finished. Please try again.";
  }
  return "Something went wrong while generating a reply. Please try again.";
}
