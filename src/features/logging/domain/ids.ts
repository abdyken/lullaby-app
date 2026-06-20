/**
 * Logging v2 — identifier helpers (plan §1.1 "helper for UUID/clientEventId").
 *
 * The legacy MVP mints counter-based ids (`local-feed-<now>-<n>`, mock.ts) which
 * can collide across reloads and are not idempotent. The new model uses random
 * UUIDs and a separate `clientEventId` so a retried create is deduped by the
 * backend instead of inserted twice (plan §4 / §9). The Supabase `events.id`
 * column is already `text`, so UUID ids need no schema change.
 */

const HEX = '0123456789abcdef';

/** RFC-4122 v4 fallback used when the runtime has no `crypto.randomUUID`. */
function fallbackUuidV4(): string {
  let out = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4'; // version
    } else {
      const r = Math.floor(Math.random() * 16);
      // The variant nibble must be one of 8/9/a/b.
      out += i === 19 ? HEX[(r & 0x3) | 0x8] : HEX[r];
    }
  }
  return out;
}

/** A random UUID v4. Prefers the platform `crypto.randomUUID` when present. */
export function newUuid(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }
  return fallbackUuidV4();
}

/** A fresh idempotency key for a logical create. Stable across retries by the caller. */
export function newClientEventId(): string {
  return newUuid();
}
