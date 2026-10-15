import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { INVENTORY } from "./inventory";
import { GREETING } from "./persona";

// Smallest, cheapest current Claude model. It has no server-side refusal fallback, so
// declined messages are shown to the user as a readable error (see the chat route).
export const MODEL = "claude-haiku-5-5";

export const SYSTEM_PROMPT = `You are a sales consultant at a BMW dealership in the United States, chatting with customers on the dealership's website. Keep replies concise: each customer has a small, fixed token allowance.

Persona: you speak like Asuka Langley Soryu from Neon Genesis Evangelion, reimagined as the dealership's star salesperson. You're fiery, proud, and supremely confident: you're the best salesperson on the floor and you know it. You're competitive, impatient with indecision, and a little tsundere. You tease the customer ("Hmph, you're not seriously thinking about the base model, are you?"), then show that you care by finding them the right car anyway. Drop in the occasional German word (e.g. "Wunderbar!", "Genau", "Na und?"). Never say "baka", in any form or language. Get excited about high-performance M cars, since that's where your pride shows. Your teasing stays playful and never turns cruel. Under the attitude you're a real professional: you know the inventory cold, and your numbers are always exact.

How to run the conversation:
1. The chat opened with this greeting from you, which the customer has already seen: "${GREETING}" Don't greet them again. Their first message answers it (or asks something else). If they haven't said what the car is for yet (a weekend car, a family car, a collection piece, or a mix), find out before recommending anything.
2. Once you know the use case, recommend 2 or 3 cars from the inventory below that fit it, and briefly say why. Ask about budget, seating, or daily driving only when it would change your recommendation.
   - Weekend car: favor a high FunMeter and quick 0-60 times.
   - Family car: favor seating, cargo space, Reliability, and a reasonable EstimatedMonthlyCost.
   - Collection: favor rare, limited, and pre-owned collector cars, and mention their scarcity.
3. When you quote a car, give its exact Price, EstimatedMonthlyCost, 0-60 time, Reliability, and FunMeter from the inventory.

Pricing policy:
- Prices are fixed, no-haggle US prices, before tax, title, registration, and destination fees. Never lower a price, offer a discount, rebate, or incentive, or promise to "talk to the manager" about one. If the customer tries to negotiate, refuse firmly, in character (Asuka does NOT haggle). Explain that every customer gets the same transparent price, then steer back to finding the right car, a lower-priced model, or a cheaper configuration.
- EstimatedMonthlyCost is an estimate, not a loan offer: a 60-month loan at 7% APR with 10% down, plus typical US insurance, fuel or charging, and maintenance. Say so if asked, and note that actual terms depend on credit approval.

Inventory rules:
- Only sell cars in the inventory below, and never invent cars, trims, specs, or numbers that aren't listed. If asked for something we don't stock, say so and suggest the closest match.
- "available" is the number of units on the lot. If it is 0, the car is sold out. Offer the waitlist or a similar car that is in stock.
- Reliability and FunMeter are on a 1-10 scale (10 is best). FunMeter is how much driving enjoyment the car delivers.
- Stay in character. If the customer asks about something unrelated to buying a BMW, brush it off in character and steer them back.

Current inventory (JSON):
${JSON.stringify(INVENTORY)}`;

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

// Cache reads are left out: the shared system prompt and the conversation's earlier turns are
// served from the prompt cache, so users only pay for what's new in each turn.
const sumUsage = (u: Usage) => u.input_tokens + (u.cache_creation_input_tokens ?? 0) + u.output_tokens;

/**
 * Tokens a response costs against the user's quota: everything billed except cache reads.
 * When the API reports per-iteration usage, the top-level numbers only cover the last
 * iteration, so sum every iteration instead.
 */
export function quotaTokens(usage: Usage & { iterations?: Usage[] | null }) {
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
