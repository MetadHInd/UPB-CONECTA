import type { RateLimiterPort } from '../../../../domain/ports/out/RateLimiterPort.js';
import { readIdentityRateLimitConfig, type IdentityRateLimitConfig } from '../../../config/IdentityRateLimitConfig.js';

export class InMemoryRateLimiter implements RateLimiterPort {
  private readonly failuresByAccount = new Map<string, number[]>();
  private readonly failuresByOrigin = new Map<string, number[]>();
  private readonly globalFailures: number[] = [];

  constructor(private readonly config: IdentityRateLimitConfig = readIdentityRateLimitConfig()) {}

  checkAllowed(accountId: string, origin: string): boolean {
    const normalizedAccount = accountId.trim().toLowerCase();
    const normalizedOrigin = origin.trim().toLowerCase();

    const accountAttempts = this.filterRecent(normalizedAccount, this.failuresByAccount);
    const originAttempts = this.filterRecent(normalizedOrigin, this.failuresByOrigin);
    const globalAttempts = this.filterRecentGlobal();
    const globalLimit = Math.max(this.config.maxAttemptsPerAccount, this.config.maxAttemptsPerOrigin);

    return (
      accountAttempts.length < this.config.maxAttemptsPerAccount &&
      originAttempts.length < this.config.maxAttemptsPerOrigin &&
      globalAttempts.length < globalLimit
    );
  }

  recordFailure(accountId: string, origin: string): void {
    this.pushAttempt(accountId.trim().toLowerCase(), this.failuresByAccount);
    this.pushAttempt(origin.trim().toLowerCase(), this.failuresByOrigin);
    this.globalFailures.push(Date.now());
  }

  recordSuccess(accountId: string, origin: string): void {
    this.failuresByAccount.delete(accountId.trim().toLowerCase());
    this.failuresByOrigin.delete(origin.trim().toLowerCase());
    this.globalFailures.length = 0;
  }

  private pushAttempt(key: string, bucket: Map<string, number[]>): void {
    const now = Date.now();
    const current = bucket.get(key) ?? [];
    bucket.set(key, [...current, now]);
  }

  private filterRecent(key: string, bucket: Map<string, number[]>): number[] {
    const now = Date.now();
    const attempts = bucket.get(key) ?? [];
    const recent = attempts.filter((timestamp) => now - timestamp <= this.config.windowMs);
    if (recent.length !== attempts.length) {
      bucket.set(key, recent);
    }
    return recent;
  }

  private filterRecentGlobal(): number[] {
    const now = Date.now();
    const recent = this.globalFailures.filter((timestamp) => now - timestamp <= this.config.windowMs);
    if (recent.length !== this.globalFailures.length) {
      this.globalFailures.length = 0;
      this.globalFailures.push(...recent);
    }
    return recent;
  }
}
