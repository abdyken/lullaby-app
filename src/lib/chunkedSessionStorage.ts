/**
 * Pure chunked key/value storage — the size-handling core of the secure session
 * adapter, with no native dependencies so it can be smoke-tested under tsx.
 *
 * `src/lib/secureSessionStore.ts` composes this factory with the native
 * `expo-secure-store` backend (and falls back to AsyncStorage off-native). The
 * logic lives here, split from those react-native / expo imports, because:
 *   - SecureStore caps a single value at ~2 KB on the native keystores and a
 *     Supabase session (access + refresh JWT + user) is larger, so values are
 *     split across numbered chunk keys on write and reassembled on read.
 *   - That chunk math + fault tolerance is exactly what we want under test, and
 *     the Node/tsx smoke runner can't import a module that pulls in react-native.
 *
 * Reads are fault-tolerant: a missing/partial chunk, a corrupt manifest, or any
 * backend error yields `null` (treated as "no session" → a calm re-auth), never
 * a half-decoded value.
 */

/** The async storage shape Supabase's auth client expects for `auth.storage`. */
export type AsyncKeyValueStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

/**
 * The minimal native backend the chunked store drives. Structurally a subset of
 * `expo-secure-store`'s `*Async` API, so the real module can be passed straight
 * in and an in-memory fake can stand in for tests.
 */
export type ChunkBackend = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

/**
 * Per-value chunk size. SecureStore warns/limits around 2 KB per value; we stay
 * comfortably under it to leave headroom for any multi-byte characters.
 */
export const CHUNK_SIZE = 1800;

/** Key for chunk `index` of `key`; the base key itself holds the chunk count. */
export const chunkKey = (key: string, index: number): string => `${key}.chunk.${index}`;

/** Split a value into <= CHUNK_SIZE pieces; an empty string yields one chunk. */
export function splitIntoChunks(value: string): string[] {
  if (value.length <= CHUNK_SIZE) return [value];
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

/**
 * Build a chunked {@link AsyncKeyValueStore} over `backend`. A value is stored as
 * N chunk keys plus a base "manifest" key holding the chunk count; a read that
 * hits a missing chunk or a non-numeric/empty manifest returns `null`.
 */
export function createChunkedStorage(backend: ChunkBackend): AsyncKeyValueStore {
  /** Delete the contiguous chunk keys for `key` starting at `from` (until a gap). */
  async function deleteChunksFrom(key: string, from: number): Promise<void> {
    let index = from;
    let existing = await backend.getItemAsync(chunkKey(key, index));
    while (existing != null) {
      await backend.deleteItemAsync(chunkKey(key, index));
      index += 1;
      existing = await backend.getItemAsync(chunkKey(key, index));
    }
  }

  return {
    async getItem(key) {
      try {
        const head = await backend.getItemAsync(key);
        if (head == null) return null;
        const count = Number.parseInt(head, 10);
        // A non-numeric/empty manifest means corrupt or foreign data — fail safe.
        if (!Number.isInteger(count) || count < 1) return null;
        let value = '';
        for (let i = 0; i < count; i += 1) {
          const part = await backend.getItemAsync(chunkKey(key, i));
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
        await backend.setItemAsync(chunkKey(key, i), chunks[i]);
      }
      await backend.setItemAsync(key, String(chunks.length));
      // Drop any leftover chunks from a previously-larger value.
      await deleteChunksFrom(key, chunks.length);
    },

    async removeItem(key) {
      await backend.deleteItemAsync(key);
      await deleteChunksFrom(key, 0);
    },
  };
}
