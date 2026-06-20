/**
 * Simple local ID generator. Combines timestamp + random to be collision-safe
 * within a single device session. Not cryptographic but sufficient for offline
 * logging IDs (clientEventId, segment ids, etc.).
 */
export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
