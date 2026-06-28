/**
 * Secure, chunked session storage for the Supabase auth client.
 *
 * Supabase persists the auth session (access + refresh JWTs + the user object)
 * through whatever `auth.storage` adapter it is handed. Lullaby previously gave
 * it AsyncStorage, which keeps those tokens in plaintext on disk. This adapter
 * moves the session into the device keystore (iOS Keychain / Android Keystore)
 * via `expo-secure-store` instead.
 *
 * The chunk/reassembly logic lives in the dependency-free `./chunkedSessionStorage`
 * so it can be smoke-tested under the Node/tsx runner; here we only wire that
 * factory to the two native concerns it can't own:
 *   1. Size limit — handled by the chunked factory (SecureStore caps a single
 *      value at ~2 KB and a Supabase session is larger).
 *   2. Native-only — SecureStore is unavailable on web (and other non-native
 *      targets). There we fall back to AsyncStorage, which keeps web/dev builds
 *      working exactly as before (web is not the secure target).
 *
 * Reads stay fault-tolerant: a missing/partial chunk or any storage error yields
 * `null` (treated as "no session" → a calm re-auth), never a half-decoded value.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { createChunkedStorage, type AsyncKeyValueStore } from './chunkedSessionStorage';

/**
 * The shape Supabase's auth client expects for `auth.storage` (structurally
 * identical to supabase-js's `SupportedStorage`) — re-exported so callers keep a
 * stable name regardless of where the implementation lives.
 */
export type SecureSessionStorage = AsyncKeyValueStore;

/** SecureStore is backed by the native keystores (iOS/Android) only. */
const canUseSecureStore = Platform.OS === 'ios' || Platform.OS === 'android';

/** Chunked SecureStore adapter — the native, secure path. */
const secureStorage: SecureSessionStorage = createChunkedStorage({
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
});

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
