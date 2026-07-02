# Canonical Logging

Status: Current production path.

Logging no longer has a normal runtime mode switch. The app should work when
`EXPO_PUBLIC_LOGGING_V2` is absent from `.env`; that value is not used to branch
product logging behavior.

## Source Of Truth

- New writes use the canonical logging-v2 `CareEvent` model through
  `LoggingProvider`.
- Canonical event types are `feed`, `sleep`, `diaper`, `pump`, and `note`.
- Spit-up is represented as a note subtype: `details.noteType === 'spit_up'`.
  Other notes use `details.noteType === 'general'`.
- Active sleep, breastfeeding, and pump sessions are persisted with timestamps.
  Timers are recomputed from `startedAt` / `endedAt`; no ticking counter is
  persisted.

## Compatibility Reads

Legacy events are not deleted. The legacy store still lives at
`lullaby/local-events/v1`, while canonical events live at
`lullaby/logging-v2/v1`.

`LegacyLoggingMapper` maps old `LogEvent` rows into `CareEvent` rows with stable
ids and `occurredAt`. Legacy note rows map to canonical notes; the old `Spit-up`
preset maps to `noteType: 'spit_up'`.

`mergeCanonicalEvents()` merges canonical rows with compatibility rows. Canonical
rows win when ids or `clientEventId`s match, so legacy read-through and a future
copy-forward migration cannot double-render the same event.

`migrateLegacyEventsToLoggingSnapshot()` is the pure idempotent migration helper
for a future persisted copy-forward migration. The current app uses read-through
compatibility, which avoids data loss while old users still have legacy rows.

## Screen Wiring

- Today/Home writes and reads canonical logging state.
- Feed/Sleep/Diaper/Pump sheets write canonical events.
- The note sheet writes canonical general/spit-up note events.
- History reads canonical full history plus compatibility rows.
- Insights reads canonical seven-day history plus compatibility rows.
- Reassure reads canonical night-window events plus compatibility rows, counts
  feed/sleep/diaper/spit-up, and ignores pump because pump is caregiver-owned.

## QA Checklist

- Fresh install: log feed, sleep, diaper, pump, note, and spit-up.
- Existing user: legacy rows still appear in History and relevant summaries.
- Restart after logging: canonical events remain present.
- Start sleep, close/reopen the app, finish sleep: Today, History, and Reassure
  agree on the same sleep session.
- Confirm Today, History, Insights, and Reassure agree for feed/diaper/spit-up.
- Confirm pump appears in History but not Reassure recap counts.
- Confirm `.env` and `.env.example` do not include `EXPO_PUBLIC_LOGGING_V2`.

