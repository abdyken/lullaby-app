/**
 * Logging v2 — AsyncStorage I/O for the persistence port (device-only).
 *
 * The ONLY logging-v2 module that touches the device store. All shaping and
 * validation lives in `loggingPersistence.ts` (pure, Node-testable); this file
 * is the thin device wrapper, mirroring the legacy `localStorage.ts` split. Every
 * call degrades to "no saved data" instead of crashing, exactly like the legacy
 * store. NOT imported by the Node smoke test (it would pull React Native in).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { systemClock, type Clock } from '../timer/clock';
import { createLoggingRepository } from './LoggingRepositoryImpl';
import type { LoggingRepository } from './LoggingRepository';
import {
  LOGGING_STORAGE_KEY,
  createEmptyLoggingSnapshot,
  parseLoggingSnapshot,
  serializeLoggingSnapshot,
  type LoggingPersistencePort,
} from './loggingPersistence';

/** A `LoggingPersistencePort` backed by AsyncStorage under `LOGGING_STORAGE_KEY`. */
export function createAsyncStorageLoggingPersistence(): LoggingPersistencePort {
  return {
    async load() {
      try {
        const raw = await AsyncStorage.getItem(LOGGING_STORAGE_KEY);
        return parseLoggingSnapshot(raw) ?? createEmptyLoggingSnapshot();
      } catch {
        return createEmptyLoggingSnapshot();
      }
    },
    async save(snapshot) {
      try {
        await AsyncStorage.setItem(LOGGING_STORAGE_KEY, serializeLoggingSnapshot(snapshot));
      } catch {
        // best-effort local cache — losing a write is not worth crashing for
      }
    },
    async clear() {
      try {
        await AsyncStorage.removeItem(LOGGING_STORAGE_KEY);
      } catch {
        // ignore
      }
    },
  };
}

/** The production logging repository: AsyncStorage-backed, real system clock. */
export function createDeviceLoggingRepository(clock: Clock = systemClock): LoggingRepository {
  return createLoggingRepository(createAsyncStorageLoggingPersistence(), clock);
}
