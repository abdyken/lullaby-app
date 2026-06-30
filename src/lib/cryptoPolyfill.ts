/**
 * Minimal WebCrypto polyfill for React Native (Hermes), set up before the
 * Supabase client is created.
 *
 * Supabase GoTrue uses PKCE for OAuth + email links. Building the SHA-256 PKCE
 * code challenge needs `crypto.subtle.digest`, and the verifier needs
 * `crypto.getRandomValues`. Hermes ships neither, so GoTrue logs
 *   "WebCrypto API is not supported. Code challenge method will default to use
 *    plain instead of sha256."
 * and silently downgrades the challenge to the weaker `plain` method.
 *
 * Backing both with `expo-crypto` (cryptographically secure, Expo-maintained)
 * lets GoTrue use real S256 — which removes the warning and is more secure.
 * Importing this module for its side effect is enough; it is idempotent and only
 * fills gaps (never clobbers a real implementation, e.g. on web).
 */
import * as ExpoCrypto from 'expo-crypto';

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

// Secure random — GoTrue fills a Uint32Array to generate the PKCE verifier.
if (typeof cryptoRef.getRandomValues !== 'function') {
  cryptoRef.getRandomValues = (<T extends ArrayBufferView | null>(array: T): T => {
    if (array == null) return array;
    // expo-crypto fills integer-based TypedArrays in place and returns them.
    return ExpoCrypto.getRandomValues(array as never) as unknown as T;
  });
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
      return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
    },
  };
}
