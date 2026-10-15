/** Token allowance per chat (input + output tokens, not counting prompt-cache reads). */
export const TOKEN_LIMIT = 10_000;

export const QUOTA_EXHAUSTED_MESSAGE =
  "This chat has used all 10,000 of its tokens. Start a new chat to keep going.";

export function tokensRemaining(tokensUsed: number) {
  return Math.max(0, TOKEN_LIMIT - tokensUsed);
}
