interface RateLimitEntry {
  attempts: number[];
  windowMs: number;
}

export class AuthRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();
  private nextSweepAt = 0;

  consume(scope: string, key: string, limit: number, windowMs: number): number | undefined {
    const now = Date.now();
    this.sweep(now);
    const entryKey = `${scope}:${key}`;
    const attempts = this.entries.get(entryKey)?.attempts.filter((attempt) => attempt > now - windowMs) ?? [];
    if (attempts.length >= limit) {
      return Math.max(1, Math.ceil((attempts[0]! + windowMs - now) / 1_000));
    }
    attempts.push(now);
    this.entries.set(entryKey, { attempts, windowMs });
    return undefined;
  }

  reset(scope: string, key: string): void {
    this.entries.delete(`${scope}:${key}`);
  }

  private sweep(now: number): void {
    if (now < this.nextSweepAt) {
      return;
    }
    this.nextSweepAt = now + 60_000;
    for (const [key, entry] of this.entries) {
      if (entry.attempts.every((attempt) => attempt <= now - entry.windowMs)) {
        this.entries.delete(key);
      }
    }
  }
}
