/**
 * Log — the "what happened" history screen (§4).
 *
 * Reads the SAME shared local events as Tonight (via useLocalEvents): the raw
 * `events` drive grouping + the night recap, and `fullTimeline` supplies the
 * display-ready rows so each line looks exactly like Tonight's timeline.
 *
 * Local-only: no persistence, no backend, no logging controls here (logging
 * lives on Tonight). Filters, grouping, and recap are all computed in-memory.
 */
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { TimelineItem } from '@/components/TimelineItem';
import { useLocalEvents } from '@/state/LocalEventProvider';
import type { TimelineEntry } from '@/data/mock';
import type { LogEvent, LogEventType } from '@/data/models';
import { colors, fonts, radii, shadows } from '@/theme';

/** The filter chips. "all" shows everything; the rest narrow to one kind. */
type Filter = 'all' | 'feed' | 'sleep' | 'diaper';

const FILTERS: { key: Filter; label: string; accent: string }[] = [
  { key: 'all', label: 'All', accent: colors.sleep },
  { key: 'feed', label: 'Feed', accent: colors.feed },
  { key: 'sleep', label: 'Sleep', accent: colors.sleep },
  { key: 'diaper', label: 'Diaper', accent: colors.diaper },
];

/** ---- small local time helpers (mirror mock.ts, kept local to this screen) ---- */
function intervalMinutes(startAt: string, endAt: string): number {
  return Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000));
}

function minutesToLabel(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }
  return `${mins}m`;
}

/** UTC day key (matches how mock.ts renders clock times in UTC). */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** "Today" / "Yesterday" / "Jun 15" for a day key, relative to now. */
function dayHeading(key: string, now: number): string {
  const today = new Date(now).toISOString().slice(0, 10);
  const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  const d = new Date(`${key}T00:00:00.000Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** One calm line: "3 feeds · 2 diapers · 5h 20m sleep". */
function buildRecap(events: LogEvent[]): string {
  const count = (type: LogEventType) => events.filter((e) => e.type === type).length;
  const feeds = count('feed');
  const diapers = count('diaper');

  const sleeps = events.filter((e) => e.type === 'sleep');
  const completedMin = sleeps
    .filter((e) => e.endAt)
    .reduce((sum, e) => sum + intervalMinutes(e.startAt, e.endAt as string), 0);
  const running = sleeps.some((e) => e.endAt === null);

  const sleepPart =
    completedMin > 0 ? `${minutesToLabel(completedMin)} sleep` : running ? 'sleep running' : 'no sleep yet';

  return [`${feeds} ${feeds === 1 ? 'feed' : 'feeds'}`, `${diapers} ${diapers === 1 ? 'diaper' : 'diapers'}`, sleepPart].join(
    ' · ',
  );
}

type Group = { key: string; heading: string; entries: TimelineEntry[] };

/** Group display rows by day (newest day first), preserving newest-first order. */
function groupByDay(events: LogEvent[], rows: Map<string, TimelineEntry>, now: number): Group[] {
  const ordered = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const groups: Group[] = [];
  for (const event of ordered) {
    const row = rows.get(event.id);
    if (!row) continue;
    const key = dayKey(event.createdAt);
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
}: {
  filter: (typeof FILTERS)[number];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: radii.pill,
        backgroundColor: active ? filter.accent : colors.surface,
        transform: [{ scale: pressed ? 0.96 : 1 }],
        ...shadows.card,
      })}>
      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 12.5,
          color: active ? colors.white : colors.inkSoft,
        }}>
        {filter.label}
      </Text>
    </Pressable>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.medium,
        paddingVertical: 30,
        paddingHorizontal: 20,
        alignItems: 'center',
        ...shadows.card,
      }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.ink }}>Nothing here yet</Text>
      <Text
        style={{
          fontFamily: fonts.body,
          fontSize: 13,
          lineHeight: 19,
          color: colors.inkSoft,
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

export default function LogScreen() {
  const { events, fullTimeline, resetLocalEvents } = useLocalEvents();
  const [filter, setFilter] = useState<Filter>('all');
  // Stamp "now" once (for Today/Yesterday headings) so render stays pure.
  const [now] = useState(() => Date.now());

  const recap = useMemo(() => buildRecap(events), [events]);

  const groups = useMemo(() => {
    const rows = new Map(fullTimeline.map((entry) => [entry.id, entry]));
    const visible = filter === 'all' ? events : events.filter((e) => e.type === filter);
    return groupByDay(visible, rows, now);
  }, [events, fullTimeline, filter, now]);

  return (
    <Screen>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.4, color: colors.inkFaint }}>
        HISTORY
      </Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.ink, marginTop: 6 }}>
        Night log
      </Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 4 }}>
        {recap}
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
        {FILTERS.map((f) => (
          <FilterChip key={f.key} filter={f} active={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </View>

      {groups.length > 0 ? (
        groups.map((group) => (
          <View key={group.key} style={{ marginTop: 22 }}>
            <Text
              style={{
                fontFamily: fonts.displayMedium,
                fontSize: 14.5,
                color: colors.ink,
                marginBottom: 8,
                marginLeft: 2,
              }}>
              {group.heading}
            </Text>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radii.medium,
                paddingTop: 7,
                paddingHorizontal: 16,
                paddingBottom: 7,
                ...shadows.card,
              }}>
              {group.entries.map((entry, index) => (
                <TimelineItem key={entry.id} entry={entry} isLast={index === group.entries.length - 1} />
              ))}
            </View>
          </View>
        ))
      ) : (
        <View style={{ marginTop: 22 }}>
          <EmptyState filter={filter} />
        </View>
      )}

      {/* Dev/demo-only: quietly return the local store to its seeded state before
          QA or a demo. Gated by __DEV__ so it is stripped from production bundles.
          resetLocalEvents() clears AsyncStorage, restores the seed, and dismisses
          any active toast. Prototype-only — see docs/demo-readiness.md. */}
      {__DEV__ && (
        <Pressable
          onPress={resetLocalEvents}
          accessibilityRole="button"
          accessibilityLabel="Reset demo night"
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
              color: colors.inkFaint,
            }}>
            Reset demo night
          </Text>
        </Pressable>
      )}
    </Screen>
  );
}
