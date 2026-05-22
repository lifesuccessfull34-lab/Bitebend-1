import { randomUUID } from "crypto";

interface CachedBill {
  png: Buffer;
  expiresAt: number;
}

const cache = new Map<string, CachedBill>();

const TTL_MS = 30 * 60 * 1000; // 30 minutes

function purgeExpired() {
  const now = Date.now();
  for (const [key, val] of cache) {
    if (val.expiresAt < now) cache.delete(key);
  }
}

export function storeBill(png: Buffer): string {
  purgeExpired();
  const token = randomUUID();
  cache.set(token, { png, expiresAt: Date.now() + TTL_MS });
  return token;
}

export function getBillByToken(token: string): Buffer | null {
  const entry = cache.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(token);
    return null;
  }
  return entry.png;
}
