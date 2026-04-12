import { Injectable } from '@nestjs/common';

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

@Injectable()
export class MemoryCacheService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  async getOrSet<T>(
    key: string,
    ttlMs: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const inflight = this.inflight.get(key);
    if (inflight) {
      return inflight as Promise<T>;
    }

    const pending = factory()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, pending);
    return pending;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number) {
    this.cache.set(key, {
      expiresAt: Date.now() + ttlMs,
      value,
    });
  }

  delete(key: string) {
    this.cache.delete(key);
    this.inflight.delete(key);
  }

  deleteByPrefix(prefix: string) {
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }

    for (const key of Array.from(this.inflight.keys())) {
      if (key.startsWith(prefix)) {
        this.inflight.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
    this.inflight.clear();
  }
}
