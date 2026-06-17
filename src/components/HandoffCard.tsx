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
import { Text, View } from 'react-native';

import { deriveHandoff } from '@/data/currentState';
import type { Caregiver, LogEvent } from '@/data/models';
import { colors, fonts, radii, shadows } from '@/theme';

type Props = {
  events: LogEvent[];
  caregivers: Caregiver[];
  babyName: string;
};

const CARD_GRADIENT: [string, string] = [colors.feedTint, colors.diaperTint];

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
function CaregiverChip({ caregiver, emphasized }: { caregiver: Caregiver; emphasized: boolean }) {
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 2.5,
        borderColor: colors.surface,
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

export function HandoffCard({ events, caregivers, babyName }: Props) {
  const { caregiverId, eventLabel } = deriveHandoff(events);
  const lastCaregiver = caregiverId ? caregivers.find((c) => c.id === caregiverId) : undefined;
  const hasLog = eventLabel != null && lastCaregiver != null;

  const title = hasLog
    ? handoffSentence(lastCaregiver.displayName, eventLabel)
    : 'Both caregivers are ready';
  const subline = hasLog
    ? `${babyName}'s night log is up to date on this device`
    : 'The first night log will appear here';

  return (
    <LinearGradient
      colors={CARD_GRADIENT}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ borderRadius: radii.medium, padding: 16, ...shadows.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: colors.inkSoft,
            }}>
            Handoff
          </Text>
          <Text
            style={{ fontFamily: fonts.display, fontSize: 15.5, color: colors.ink, marginTop: 5 }}>
            {title}
          </Text>
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 12,
              lineHeight: 17,
              color: colors.inkSoft,
              marginTop: 3,
            }}>
            {subline}
          </Text>
        </View>

        {/* Caregiver chips: paddingLeft offsets the first chip's negative margin */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8 }}>
          {caregivers.slice(0, 2).map((caregiver) => (
            <CaregiverChip
              key={caregiver.id}
              caregiver={caregiver}
              emphasized={!hasLog || caregiver.id === caregiverId}
            />
          ))}
        </View>
      </View>
    </LinearGradient>
  );
}

export default HandoffCard;
