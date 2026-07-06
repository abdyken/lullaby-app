/**
 * Log — the "what happened" history screen (§4).
 *
 * Reads canonical logging history from LoggingProvider. Legacy data is folded in
 * by the provider's compatibility adapter, so old rows and new v2 rows render in
 * one timeline.
 *
 * Filtering remains wired in-memory but is hidden for the current small demo
 * timeline.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { InteractionManager, Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { TimelineItem } from '@/components/TimelineItem';
import type { CareEvent } from '@/features/logging/domain/types';
import { buildV2HistoryTimeline } from '@/features/logging/state/historyTimeline';
import { useLogging } from '@/features/logging/state/LoggingProvider';
import { useLocalEvents } from '@/state/LocalEventProvider';
import { useAuth } from '@/state/AuthProvider';
import { useTheme } from '@/state/ThemeProvider';
import { caregivers as seedCaregivers, type TimelineEntry } from '@/data/mock';
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
  kind: CareEvent['type'];
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

function v2HistorySource(event: CareEvent): HistorySourceEvent {
  return { id: event.id, kind: event.type, occurredAt: event.occurredAt };
}

function filterHistoryEvents(events: HistorySourceEvent[], filter: Filter): HistorySourceEvent[] {
  return filter === 'all' ? events : events.filter((event) => event.kind === filter);
}

export default function LogScreen() {
  const { resetLocalEvents } = useLocalEvents();
  const { loadAllEvents } = useLogging();
  const { caregivers: activeCaregivers, caregiver: ownCaregiver } = useAuth();
  const { mode } = useTheme();
  const palette = surfaces[mode];
  const [filter, setFilter] = useState<Filter>('all');
  const [historyEvents, setHistoryEvents] = useState<CareEvent[]>([]);
  // Stamp "now" once (for Today/Yesterday headings) so render stays pure.
  const [now] = useState(() => Date.now());
  // Active caregivers come from AuthProvider (real ones in Supabase mode, the
  // seed Mom/Dad in local-only mode); the direct seed import stays only as the
  // ultimate fallback for a transient empty read.
  const v2Caregivers = useMemo(
    () => (activeCaregivers.length > 0 ? activeCaregivers : ownCaregiver ? [ownCaregiver] : seedCaregivers),
    [activeCaregivers, ownCaregiver],
  );

  const v2Timeline = useMemo(
    () => buildV2HistoryTimeline(historyEvents, v2Caregivers, now),
    [historyEvents, v2Caregivers, now],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // Defer the full-history AsyncStorage read off the tab-switch frame: let
      // the switch commit/paint first, THEN load a beat later
      // (runAfterInteractions). Same read, same result — only the timing moves,
      // so the first focus on this tab no longer hitches. Cancel the pending
      // task on blur (plus the `cancelled` guard) so there's no
      // setState-after-blur.
      const task = InteractionManager.runAfterInteractions(() => {
        void loadAllEvents().then((events) => {
          if (!cancelled) setHistoryEvents(events);
        });
      });
      return () => {
        cancelled = true;
        task.cancel();
      };
    }, [loadAllEvents]),
  );

  const groups = useMemo(() => {
    const sourceEvents = historyEvents.map(v2HistorySource);
    const rows = new Map(v2Timeline.map((entry) => [entry.id, entry]));
    return groupByDay(filterHistoryEvents(sourceEvents, filter), rows, now);
  }, [filter, historyEvents, now, v2Timeline]);

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
          any active toast. Prototype-only — see docs/plans/demo-readiness.md. */}
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
