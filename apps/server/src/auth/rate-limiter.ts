interface RateLimitEntry {
  attempts: number[];
}

export class AuthRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  consume(scope: string, key: string, limit: number, windowMs: number): number | undefined {
    const now = Date.now();
    const entryKey = `${scope}:${key}`;
    const attempts = this.entries.get(entryKey)?.attempts.filter((attempt) => attempt > now - windowMs) ?? [];
    if (attempts.length >= limit) {
      return Math.max(1, Math.ceil((attempts[0]! + windowMs - now) / 1_000));
    }
    attempts.push(now);
    this.entries.set(entryKey, { attempts });
    return undefined;
  }

  reset(scope: string, key: string): void {
    this.entries.delete(`${scope}:${key}`);
  }
}
