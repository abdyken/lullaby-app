/**
 * SupportConsentCard — the one-time, HONEST opt-in for the AI support companion.
 *
 * Unlike the night-read consent (which sends only minimized numeric tallies),
 * this path sends the parent's OWN WORDS to Anthropic, so the copy says exactly
 * that — plainly, before the first real AI call. It never blocks anything: a
 * decline keeps the local support line, and both actions dismiss the card.
 *
 * Tappable surfaces live on an inner View, not the Pressable (Android Expo Go
 * background-paint gotcha). Opacity-first press to match the rest of the surface.
 */
import { Pressable, Text, View } from 'react-native';

import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

type Props = {
  surfaceMode: SurfaceMode;
  /** Persist consent and let the client send this ask to the companion. */
  onGrant: () => void;
  /** Persist a decline; the local support line stays and the card does not return. */
  onDecline: () => void;
};

export function SupportConsentCard({ surfaceMode, onGrant, onDecline }: Props) {
  const palette = surfaces[surfaceMode];
  const night = surfaceMode === 'night';

  return (
    <View
      style={{
        backgroundColor: palette.card,
        borderRadius: radii.medium,
        borderWidth: night ? 1 : 0,
        borderColor: palette.border,
        padding: 16,
        marginTop: 14,
        ...shadows.card,
      }}>
      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 10.5,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: colors.sleep,
          marginBottom: 6,
        }}>
        Optional · AI companion
      </Text>
      <Text
        style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: palette.ink, marginBottom: 8 }}>
        Want a private AI companion to reply?
      </Text>
      <Text
        style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 19.5, color: palette.inkSoft }}>
        If you turn this on, the words you type or say here are sent to Anthropic (Claude), the AI
        provider, to write a warm, supportive reply. It’s meant for how you’re feeling and coping —
        not for medical questions. Please don’t include your baby’s name or any health details.
      </Text>
      <Text
        style={{
          fontFamily: fonts.body,
          fontSize: 13,
          lineHeight: 19.5,
          color: palette.inkSoft,
          marginTop: 10,
        }}>
        Reassure works fully without this. This is general emotional support, not medical advice or a
        diagnosis — for anything about the baby, or if something feels urgent, please contact your
        doctor.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Turn on the AI support companion"
          onPress={onGrant}
          style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1 })}>
          <View
            style={{
              backgroundColor: colors.sleep,
              borderRadius: radii.pill,
              paddingHorizontal: 18,
              paddingVertical: 10,
            }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.white }}>
              Turn on companion
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keep support without AI"
          onPress={onDecline}
          style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1 })}>
          <View
            style={{
              backgroundColor: night ? 'rgba(255,255,255,0.08)' : colors.surface,
              borderWidth: 1.5,
              borderColor: palette.line,
              borderRadius: radii.pill,
              paddingHorizontal: 18,
              paddingVertical: 10,
            }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.sleep }}>
              Not now
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
