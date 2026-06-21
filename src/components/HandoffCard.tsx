/**
 * HandoffCard — the P0 partner/handoff card inside Tonight (§3, §4).
 *
 * Answers two calm questions at a glance: "are both parents in the loop?" and
 * "who handled the last relevant event?". It reads the SAME local events as the
 * rest of Tonight and is purely local — it implies nothing about realtime or
 * cloud sync (the copy says "on this device"). Real partner invite + realtime
 * is P1; here we only reflect the local caregiver model.
 *
 * Visual language from the mockup's `lb-sync` card: a soft warm gradient
 * (feed-tint → diaper-tint), rounded, calm copy, caregiver chips in their own
 * colors. The chip for whoever logged the newest event is emphasized.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';

import { buildHandoffSummary, deriveHandoff } from '@/data/currentState';
import type { Caregiver, LogEvent } from '@/data/models';
import type { SyncMode, SyncStatus } from '@/sync';
import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

type Props = {
  events: LogEvent[];
  caregivers: Caregiver[];
  babyName: string;
  /** surface palette — 'day' (default) or 'night' */
  surfaceMode?: SurfaceMode;
  /**
   * Whether real caregiver sync is active. In local-only mode (the default) the
   * copy must stay explicit that the log lives "on this device" and must never
   * imply cloud/realtime sync. Only when a Supabase backend is active does the
   * card say the log is shared with caregivers.
   */
  syncMode?: SyncMode;
  /** sync status for the quiet status line (Supabase mode only) */
  syncStatus?: SyncStatus;
  /** the signed-in caregiver (Supabase) so "You" vs partner can be phrased; null = local */
  currentCaregiverId?: string | null;
  /** the "last caught up" cursor (epoch ms) driving the summary; null = never */
  since?: number | null;
  /** Frozen clock — passed so any "X ago" summary text stays put mid theme-reveal. */
  now?: number;
  /** true once the stored cursor has loaded (avoids a flash of stale summary) */
  cursorReady?: boolean;
  /** mark the handoff as seen (shown only when there are new events) */
  onMarkCaughtUp?: () => void;
};

/** Quiet one-liner for the live sync state. Null hides the line entirely. */
function syncStatusLine(status: SyncStatus | undefined): string | null {
  if (!status) return null;
  switch (status.kind) {
    case 'syncing':
      return 'Syncing…';
    case 'offline':
      // Calm + honest: in Supabase mode an unsynced change is held in memory and
      // re-pushed on the next change/reconnect — it is NOT durably "saved on this
      // device", so we promise a retry rather than persistence.
      return 'Offline · will retry';
    case 'synced':
      return 'Synced just now';
    default:
      return null;
  }
}

/** Day: the warm lb-sync gradient. Night: a calm dark navy (low-glare). */
const CARD_GRADIENT: Record<SurfaceMode, [string, string]> = {
  day: [colors.feedTint, colors.diaperTint],
  night: ['#2B2A46', '#23303F'],
};

/** Calm, non-technical sentence for who handled the last event. */
function handoffSentence(name: string, label: string): string {
  switch (label) {
    case 'feed':
      return `${name} logged the last feed`;
    case 'note':
      return `${name} logged the last note`;
    case 'diaper':
      return `${name} handled the last diaper`;
    case 'sleep':
      return `${name} handled the last sleep`;
    case 'sleep start':
      return `${name} started the current sleep`;
    default:
      return `${name} logged the last ${label}`;
  }
}

function initialFor(caregiver: Caregiver): string {
  return caregiver.displayName.trim().charAt(0).toUpperCase() || '+';
}

/** Small color chip per caregiver; the latest logger stays solid, others dim. */
function CaregiverChip({
  caregiver,
  emphasized,
  borderColor,
}: {
  caregiver: Caregiver;
  emphasized: boolean;
  borderColor: string;
}) {
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 2.5,
        borderColor,
        marginLeft: -8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: caregiver.colorHex,
        opacity: emphasized ? 1 : 0.5,
      }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: colors.white }}>
        {initialFor(caregiver)}
      </Text>
    </View>
  );
}

export function HandoffCard({
  events,
  caregivers,
  babyName,
  surfaceMode = 'day',
  syncMode = 'local-only',
  syncStatus,
  currentCaregiverId = null,
  since = null,
  now,
  cursorReady = false,
  onMarkCaughtUp,
}: Props) {
  const { caregiverId, eventLabel } = deriveHandoff(events);
  const lastCaregiver = caregiverId ? caregivers.find((c) => c.id === caregiverId) : undefined;
  const hasLog = eventLabel != null && lastCaregiver != null;
  const hasAnyEvents = events.length > 0;
  // Only claim sharing when real sync is active; otherwise stay "on this device".
  const isShared = syncMode === 'supabase';
  // Quiet status line, only in shared mode (never in the local demo).
  const statusLine = isShared ? syncStatusLine(syncStatus) : null;
  // In day the bright gradient pairs with a white chip ring; in night use the
  // card's own dark tone so the chips sit cleanly on the navy surface.
  const chipBorder = surfaceMode === 'night' ? CARD_GRADIENT.night[0] : colors.surface;
  const titleColor = surfaceMode === 'night' ? surfaces.night.ink : colors.ink;
  const eyebrowColor = surfaceMode === 'night' ? surfaces.night.inkSoft : colors.inkSoft;
  const sublineColor = surfaceMode === 'night' ? surfaces.night.inkSoft : colors.inkSoft;
  const actionColor = surfaceMode === 'night' ? surfaces.night.ink : colors.sleep;

  // The handoff summary takes the title slot once the cursor has loaded and there
  // is something to summarize. Until then (or with no events) we keep the calm
  // existing copy so nothing flashes.
  const summary = buildHandoffSummary(events, caregivers, currentCaregiverId, since ?? null, now);
  const useSummary = cursorReady && hasAnyEvents;
  const showMarkCaughtUp = useSummary && summary.hasNew && onMarkCaughtUp != null;

  const title = !hasAnyEvents
    ? 'Both caregivers are ready'
    : useSummary
      ? summary.text
      : hasLog
        ? handoffSentence(lastCaregiver.displayName, eventLabel)
        : 'Both caregivers are ready';
  const subline = hasLog
    ? isShared
      ? `${babyName}'s night log is shared with your caregivers`
      : `${babyName}'s night log is up to date on this device`
    : isShared
      ? `Tonight's log will stay in sync for your caregivers`
      : 'The first night log will appear here';

  return (
    <LinearGradient
      colors={CARD_GRADIENT[surfaceMode]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{
        borderRadius: radii.medium,
        borderWidth: surfaceMode === 'night' ? 1 : 0,
        borderColor: surfaces.night.border,
        padding: 16,
        ...shadows.card,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: eyebrowColor,
            }}>
            Handoff
          </Text>
          <Text
            style={{ fontFamily: fonts.display, fontSize: 15.5, color: titleColor, marginTop: 5 }}>
            {title}
          </Text>
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 12,
              lineHeight: 17,
              color: sublineColor,
              marginTop: 3,
            }}>
            {subline}
          </Text>
          {showMarkCaughtUp && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mark caught up"
              onPress={onMarkCaughtUp}
              hitSlop={8}
              style={({ pressed }) => ({ alignSelf: 'flex-start', marginTop: 8, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: actionColor }}>
                Mark caught up
              </Text>
            </Pressable>
          )}
          {statusLine != null && (
            <Text
              style={{
                fontFamily: fonts.bodyBold,
                fontSize: 10,
                letterSpacing: 0.4,
                color: surfaceMode === 'night' ? surfaces.night.inkFaint : colors.inkFaint,
                marginTop: 6,
              }}>
              {statusLine}
            </Text>
          )}
        </View>

        {/* Caregiver chips: paddingLeft offsets the first chip's negative margin */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8 }}>
          {caregivers.slice(0, 2).map((caregiver) => (
            <CaregiverChip
              key={caregiver.id}
              caregiver={caregiver}
              emphasized={!hasLog || caregiver.id === caregiverId}
              borderColor={chipBorder}
            />
          ))}
        </View>
      </View>
    </LinearGradient>
  );
}

export default HandoffCard;
