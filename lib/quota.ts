/** Lifetime token allowance per account (input + output tokens, as billed by the API). */
export const TOKEN_LIMIT = 10_000;

export const QUOTA_EXHAUSTED_MESSAGE =
  "You've used all 10,000 tokens available to this account. To keep chatting, create a new account.";

export function tokensRemaining(tokensUsed: number) {
  return Math.max(0, TOKEN_LIMIT - tokensUsed);
}
