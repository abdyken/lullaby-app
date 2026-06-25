/**
 * Log — the "what happened" history screen (§4).
 *
 * Reads the SAME shared local events as Tonight (via useLocalEvents): the raw
 * `events` drive grouping + the night recap, and `fullTimeline` supplies the
 * display-ready rows so each line looks exactly like Tonight's timeline.
 *
 * Local-only: no persistence, no backend, no logging controls here (logging
 * lives on Tonight). Filtering remains wired in-memory but is hidden for the
 * current small demo timeline.
 */
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { TimelineItem } from '@/components/TimelineItem';
import { isLoggingV2Enabled } from '@/features/logging';
import type { CareEvent } from '@/features/logging/domain/types';
import { buildV2HistoryTimeline } from '@/features/logging/state/historyTimeline';
import { useLogging } from '@/features/logging/state/LoggingProvider';
import { useLocalEvents } from '@/state/LocalEventProvider';
import { useAuth } from '@/state/AuthProvider';
import { useTheme } from '@/state/ThemeProvider';
import { caregivers as seedCaregivers, type TimelineEntry } from '@/data/mock';
import type { LogEvent } from '@/data/models';
import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

const SHOW_HISTORY_FILTERS = false;
const SHOW_DEMO_RESET = false;

/** The filter chips. "all" shows everything; the rest narrow to one kind. */
type Filter = 'all' | 'feed' | 'sleep' | 'diaper';

const FILTERS: { key: Filter; label: string; accent: string }[] = [
  { key: 'all', label: 'All', accent: colors.sleep },
  { key: 'feed', label: 'Feed', accent: colors.feed },
  { key: 'sleep', label: 'Sleep', accent: colors.sleep },
  { key: 'diaper', label: 'Diaper', accent: colors.diaper },
];

/** UTC day key (matches how mock.ts renders clock times in UTC). */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** "Tuesday, June 16" for a day key. */
function calendarDayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Today · Tuesday, June 16" / "Yesterday · Monday, June 15" for a day key. */
function dayHeading(key: string, now: number): string {
  const today = new Date(now).toISOString().slice(0, 10);
  const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
  const label = calendarDayLabel(key);
  if (key === today) return `Today · ${label}`;
  if (key === yesterday) return `Yesterday · ${label}`;
  return label;
}

type Group = { key: string; heading: string; entries: TimelineEntry[] };
type HistorySourceEvent = {
  id: string;
  kind: LogEvent['type'] | CareEvent['type'];
  occurredAt: string;
};

/** Group display rows by day (newest day first), preserving newest-first order. */
function groupByDay(events: HistorySourceEvent[], rows: Map<string, TimelineEntry>, now: number): Group[] {
  const ordered = [...events].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  const groups: Group[] = [];
  for (const event of ordered) {
    const row = rows.get(event.id);
    if (!row) continue;
    const key = dayKey(event.occurredAt);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, heading: dayHeading(key, now), entries: [] };
      groups.push(group);
    }
    group.entries.push(row);
  }
  return groups;
}

function FilterChip({
  filter,
  active,
  onPress,
  surfaceMode,
}: {
  filter: (typeof FILTERS)[number];
  active: boolean;
  onPress: () => void;
  surfaceMode: SurfaceMode;
}) {
  const palette = surfaces[surfaceMode];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: radii.pill,
        backgroundColor: active ? filter.accent : palette.card,
        transform: [{ scale: pressed ? 0.96 : 1 }],
        ...shadows.card,
      })}>
      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 12.5,
          color: active ? colors.white : palette.inkSoft,
        }}>
        {filter.label}
      </Text>
    </Pressable>
  );
}

function EmptyState({ filter, surfaceMode }: { filter: Filter; surfaceMode: SurfaceMode }) {
  const palette = surfaces[surfaceMode];

  return (
    <View
      style={{
        backgroundColor: palette.card,
        borderRadius: radii.medium,
        borderWidth: surfaceMode === 'night' ? 1 : 0,
        borderColor: palette.border,
        paddingVertical: 30,
        paddingHorizontal: 20,
        alignItems: 'center',
        ...shadows.card,
      }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 17, color: palette.ink }}>Nothing here yet</Text>
      <Text
        style={{
          fontFamily: fonts.body,
          fontSize: 13,
          lineHeight: 19,
          color: palette.inkSoft,
          textAlign: 'center',
          marginTop: 6,
        }}>
        {filter === 'all'
          ? 'New logs from Tonight will appear here.'
          : `No ${filter} logs yet. New ${filter} logs from Tonight will appear here.`}
      </Text>
    </View>
  );
}

function legacyHistorySource(event: LogEvent): HistorySourceEvent {
  return { id: event.id, kind: event.type, occurredAt: event.createdAt };
}

function v2HistorySource(event: CareEvent): HistorySourceEvent {
  return { id: event.id, kind: event.type, occurredAt: event.occurredAt };
}

function filterHistoryEvents(events: HistorySourceEvent[], filter: Filter): HistorySourceEvent[] {
  return filter === 'all' ? events : events.filter((event) => event.kind === filter);
}

export default function LogScreen() {
  const { events, fullTimeline, resetLocalEvents } = useLocalEvents();
  const logging = useLogging();
  const { caregivers: remoteCaregivers, caregiver: ownCaregiver } = useAuth();
  const { mode } = useTheme();
  const palette = surfaces[mode];
  const [filter, setFilter] = useState<Filter>('all');
  // Stamp "now" once (for Today/Yesterday headings) so render stays pure.
  const [now] = useState(() => Date.now());
  const loggingV2 = isLoggingV2Enabled();
  const v2Caregivers = useMemo(
    () => (remoteCaregivers.length > 0 ? remoteCaregivers : ownCaregiver ? [ownCaregiver] : seedCaregivers),
    [remoteCaregivers, ownCaregiver],
  );

  const v2Timeline = useMemo(
    () => buildV2HistoryTimeline(logging.todayEvents, v2Caregivers, now),
    [logging.todayEvents, v2Caregivers, now],
  );

  const groups = useMemo(() => {
    const timeline = loggingV2 ? v2Timeline : fullTimeline;
    const sourceEvents = loggingV2 ? logging.todayEvents.map(v2HistorySource) : events.map(legacyHistorySource);
    const rows = new Map(timeline.map((entry) => [entry.id, entry]));
    return groupByDay(filterHistoryEvents(sourceEvents, filter), rows, now);
  }, [events, fullTimeline, filter, logging.todayEvents, loggingV2, now, v2Timeline]);

  return (
    <Screen surfaceMode={mode}>
      <Text style={{ fontFamily: fonts.display, fontSize: 30, color: palette.ink }}>
        Timeline
      </Text>

      {SHOW_HISTORY_FILTERS ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
          {FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              filter={f}
              active={filter === f.key}
              surfaceMode={mode}
              onPress={() => setFilter(f.key)}
            />
          ))}
        </View>
      ) : null}

      {groups.length > 0 ? (
        groups.map((group) => (
          <View key={group.key} style={{ marginTop: 22 }}>
            <Text
              style={{
                fontFamily: fonts.displayMedium,
                fontSize: 14.5,
                color: palette.ink,
                marginBottom: 8,
                marginLeft: 2,
              }}>
              {group.heading}
            </Text>
            <View
              style={{
                backgroundColor: palette.card,
                borderRadius: radii.medium,
                borderWidth: mode === 'night' ? 1 : 0,
                borderColor: palette.border,
                paddingTop: 7,
                paddingHorizontal: 16,
                paddingBottom: 7,
                ...shadows.card,
              }}>
              {group.entries.map((entry, index) => (
                <TimelineItem
                  key={entry.id}
                  entry={entry}
                  isLast={index === group.entries.length - 1}
                  surfaceMode={mode}
                />
              ))}
            </View>
          </View>
        ))
      ) : (
        <View style={{ marginTop: 22 }}>
          <EmptyState filter={filter} surfaceMode={mode} />
        </View>
      )}

      {/* Dev/demo-only: quietly return the local store to its seeded state before
          QA or a demo. Gated by __DEV__ so it is stripped from production bundles.
          resetLocalEvents() clears AsyncStorage, restores the seed, and dismisses
          any active toast. Prototype-only — see docs/demo-readiness.md. */}
      {__DEV__ && SHOW_DEMO_RESET && (
        <Pressable
          onPress={resetLocalEvents}
          accessibilityRole="button"
          accessibilityLabel="Reset demo data"
          hitSlop={8}
          style={({ pressed }) => ({
            marginTop: 28,
            alignSelf: 'center',
            paddingVertical: 8,
            paddingHorizontal: 14,
            borderRadius: radii.pill,
            opacity: pressed ? 0.45 : 1,
          })}>
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 12,
              letterSpacing: 0.3,
              color: palette.inkFaint,
            }}>
            Reset demo data
          </Text>
        </Pressable>
      )}
    </Screen>
  );
}
