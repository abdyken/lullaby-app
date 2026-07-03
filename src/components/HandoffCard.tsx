/**
 * HandoffCard — the calm local log card inside Tonight (§3, §4).
 *
 * Reads the SAME local events as the rest of Tonight and keeps the public copy
 * explicit that the log is saved on this device.
 *
 * Visual language from the mockup's warm card: a soft gradient (feed-tint →
 * diaper-tint), rounded, calm copy, caregiver chips in their own colors. The
 * chip for whoever logged the newest event is emphasized.
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

/** Day: the warm local-log gradient. Night: a calm dark navy (low-glare). */
const CARD_GRADIENT: Record<SurfaceMode, [string, string]> = {
  day: [colors.feedTint, colors.diaperTint],
  night: ['#2B2A46', '#23303F'],
};

/** Calm, non-technical sentence for the latest local event. */
function localLogSentence(label: string): string {
  switch (label) {
    case 'feed':
      return 'Latest feed saved';
    case 'note':
      return 'Latest note saved';
    case 'diaper':
      return 'Latest diaper saved';
    case 'sleep':
      return 'Latest sleep saved';
    case 'sleep start':
      return 'Current sleep saved';
    default:
      return 'Latest log saved';
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
  surfaceMode = 'day',
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
  const statusLine = 'Updated just now.';
  // In day the bright gradient pairs with a white chip ring; in night use the
  // card's own dark tone so the chips sit cleanly on the navy surface.
  const chipBorder = surfaceMode === 'night' ? CARD_GRADIENT.night[0] : colors.surface;
  const titleColor = surfaceMode === 'night' ? surfaces.night.ink : colors.ink;
  const eyebrowColor = surfaceMode === 'night' ? surfaces.night.inkSoft : colors.inkSoft;
  const sublineColor = surfaceMode === 'night' ? surfaces.night.inkSoft : colors.inkSoft;
  const statusColor = surfaceMode === 'night' ? surfaces.night.inkFaint : colors.inkFaint;
  const actionColor = surfaceMode === 'night' ? surfaces.night.ink : colors.sleep;

  // The handoff summary takes the title slot once the cursor has loaded and there
  // is something to summarize. Until then (or with no events) we keep the calm
  // existing copy so nothing flashes.
  const summary = buildHandoffSummary(events, caregivers, currentCaregiverId, since ?? null, now);
  const useSummary = cursorReady && hasAnyEvents;
  const showMarkCaughtUp = useSummary && summary.hasNew && onMarkCaughtUp != null;

  const readyTitle = 'Your night log is ready';

  const title = !hasAnyEvents
    ? readyTitle
    : hasLog
      ? localLogSentence(eventLabel)
      : readyTitle;
  const subline = 'Tonight’s log is saved on this device.';

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
            Tonight
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
              accessibilityLabel="Mark reviewed"
              onPress={onMarkCaughtUp}
              hitSlop={8}
              style={({ pressed }) => ({ alignSelf: 'flex-start', marginTop: 8, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: actionColor }}>
                Mark reviewed
              </Text>
            </Pressable>
          )}
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 10,
              letterSpacing: 0.4,
              color: statusColor,
              marginTop: 6,
            }}>
            {statusLine}
          </Text>
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
