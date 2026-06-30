/**
 * Minimal, PURE-JS WebCrypto polyfill for React Native (Hermes), set up before
 * the Supabase client is created.
 *
 * Supabase GoTrue uses PKCE for OAuth + email links. Building the SHA-256 PKCE
 * code challenge needs `crypto.subtle.digest`, and the verifier needs
 * `crypto.getRandomValues`. Hermes ships neither, so GoTrue logs
 *   "WebCrypto API is not supported. Code challenge method will default to use
 *    plain instead of sha256."
 * and downgrades the challenge to the weaker `plain` method.
 *
 * This polyfill is deliberately dependency-free (no NATIVE module): an earlier
 * attempt backed it with `expo-crypto`, which crashed an already-built dev client
 * with "Cannot find native module 'ExpoCrypto'" because new native modules need a
 * native rebuild. A pure-JS shim works in any existing build with no rebuild.
 *
 * It only fills gaps (never clobbers a real implementation, e.g. on web), and is
 * idempotent. NOTE: getRandomValues falls back to Math.random (Hermes has no
 * pure-JS CSPRNG) — this matches GoTrue's own no-crypto verifier entropy, so it
 * is not a regression; the win is that the challenge is now real S256, not plain.
 * A native build can later add expo-crypto / react-native-get-random-values for a
 * CSPRNG without touching callers.
 */
import { sha256Bytes } from './sha256';

type SubtleLike = { digest: (algorithm: unknown, data: BufferSource) => Promise<ArrayBuffer> };
type CryptoLike = {
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
  subtle?: SubtleLike;
};

const globalScope = globalThis as unknown as { crypto?: CryptoLike };

if (globalScope.crypto == null) {
  globalScope.crypto = {};
}

const cryptoRef = globalScope.crypto;

// Random bytes — GoTrue fills a TypedArray to generate the PKCE verifier. Must be
// present whenever `crypto` exists, or GoTrue's `crypto.getRandomValues(array)`
// call would throw.
if (typeof cryptoRef.getRandomValues !== 'function') {
  cryptoRef.getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
    if (array == null) return array;
    const view = array as ArrayBufferView;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return array;
  };
}

// SHA-256 digest — GoTrue derives the S256 code challenge from the verifier.
if (cryptoRef.subtle == null) {
  cryptoRef.subtle = {
    digest: (algorithm: unknown, data: BufferSource): Promise<ArrayBuffer> => {
      const name =
        typeof algorithm === 'string'
          ? algorithm
          : ((algorithm as { name?: string } | null)?.name ?? '');
      if (name.toUpperCase() !== 'SHA-256') {
        return Promise.reject(new Error(`Unsupported digest algorithm: ${name}`));
      }
      const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);
      return Promise.resolve(sha256Bytes(bytes).buffer as ArrayBuffer);
    },
  };
}
