/**
 * Secure, chunked session storage for the Supabase auth client.
 *
 * Supabase persists the auth session (access + refresh JWTs + the user object)
 * through whatever `auth.storage` adapter it is handed. Lullaby previously gave
 * it AsyncStorage, which keeps those tokens in plaintext on disk. This adapter
 * moves the session into the device keystore (iOS Keychain / Android Keystore)
 * via `expo-secure-store` instead.
 *
 * Two wrinkles SecureStore forces us to handle:
 *   1. Size limit — a single SecureStore value is capped at ~2 KB on the native
 *      keystores, and a Supabase session is larger. So values are split across
 *      numbered chunk keys on write and reassembled on read.
 *   2. Native-only — SecureStore is unavailable on web (and other non-native
 *      targets). There we fall back to AsyncStorage, which keeps web/dev builds
 *      working exactly as before (web is not the secure target).
 *
 * Reads are fault-tolerant: a missing/partial chunk or any storage error yields
 * `null` (treated as "no session" → a calm re-auth), never a half-decoded value.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The shape Supabase's auth client expects for `auth.storage`. Declared locally
 * (structurally identical to supabase-js's `SupportedStorage`) so this module
 * owns no `@supabase/*` type surface beyond what it actually needs.
 */
export type SecureSessionStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

/**
 * Per-value chunk size. SecureStore warns/limits around 2 KB per value; we stay
 * comfortably under it to leave headroom for any multi-byte characters.
 */
const CHUNK_SIZE = 1800;

/** SecureStore is backed by the native keystores (iOS/Android) only. */
const canUseSecureStore = Platform.OS === 'ios' || Platform.OS === 'android';

/** Key for chunk `index` of `key`; the base key itself holds the chunk count. */
const chunkKey = (key: string, index: number): string => `${key}.chunk.${index}`;

/** Split a value into <= CHUNK_SIZE pieces; an empty string yields one chunk. */
function splitIntoChunks(value: string): string[] {
  if (value.length <= CHUNK_SIZE) return [value];
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

/** Delete the contiguous chunk keys for `key` starting at `from` (until a gap). */
async function deleteChunksFrom(key: string, from: number): Promise<void> {
  let index = from;
  let existing = await SecureStore.getItemAsync(chunkKey(key, index));
  while (existing != null) {
    await SecureStore.deleteItemAsync(chunkKey(key, index));
    index += 1;
    existing = await SecureStore.getItemAsync(chunkKey(key, index));
  }
}

const secureStorage: SecureSessionStorage = {
  async getItem(key) {
    try {
      const head = await SecureStore.getItemAsync(key);
      if (head == null) return null;
      const count = Number.parseInt(head, 10);
      // A non-numeric/empty manifest means corrupt or foreign data — fail safe.
      if (!Number.isInteger(count) || count < 1) return null;
      let value = '';
      for (let i = 0; i < count; i += 1) {
        const part = await SecureStore.getItemAsync(chunkKey(key, i));
        if (part == null) return null; // partial write → no usable session
        value += part;
      }
      return value;
    } catch {
      return null; // never let a storage read crash auth bootstrap
    }
  },

  async setItem(key, value) {
    const chunks = splitIntoChunks(value);
    // Write the chunks first, then the count, so a crash mid-write never leaves
    // the count pointing past chunks that don't exist yet.
    for (let i = 0; i < chunks.length; i += 1) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
    }
    await SecureStore.setItemAsync(key, String(chunks.length));
    // Drop any leftover chunks from a previously-larger value.
    await deleteChunksFrom(key, chunks.length);
  },

  async removeItem(key) {
    await SecureStore.deleteItemAsync(key);
    await deleteChunksFrom(key, 0);
  },
};

/** Web/dev fallback: AsyncStorage (localStorage-backed) — no chunking needed. */
const fallbackStorage: SecureSessionStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

/**
 * The session storage adapter for `supabase.auth.storage`: chunked SecureStore
 * on native, AsyncStorage everywhere else.
 */
export const secureSessionStorage: SecureSessionStorage = canUseSecureStore
  ? secureStorage
  : fallbackStorage;
