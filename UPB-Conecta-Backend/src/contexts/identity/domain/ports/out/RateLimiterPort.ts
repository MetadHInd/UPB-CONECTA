export interface RateLimiterPort {
  checkAllowed(accountId: string, origin: string): boolean;
  recordFailure(accountId: string, origin: string): void;
  recordSuccess(accountId: string, origin: string): void;
}
