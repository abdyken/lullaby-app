/**
 * AiConsentCard — the calm, one-time opt-in shown near the night recap when a
 * Pro/dev-entitled parent could get the AI-phrased night read but has not yet
 * decided (see application/useAiNightReadConsent.ts + application/nightRead.ts).
 *
 * It NEVER blocks anything: the local, code-computed recap read is already on
 * screen above it, and both actions dismiss the card for good. The copy is
 * deliberately honest — it says exactly what leaves the device (a small,
 * minimized summary of counts + a coarse age band), what never does (notes, the
 * words you type, your pediatrician's number), that Reassure works without it,
 * and that it is general information, not medical advice.
 *
 * Tappable surfaces live on an inner View, not the Pressable (Android Expo Go
 * background-paint gotcha).
 */
import { Pressable, Text, View } from 'react-native';

import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

type Props = {
  surfaceMode: SurfaceMode;
  /** Persist consent and let the client attempt the AI night read. */
  onGrant: () => void;
  /** Persist a decline; the local read stays and the card does not return. */
  onDecline: () => void;
};

export function AiConsentCard({ surfaceMode, onGrant, onDecline }: Props) {
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
        marginTop: 10,
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
        Optional · AI-phrased read
      </Text>
      <Text
        style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: palette.ink, marginBottom: 8 }}>
        Want an AI to phrase tonight’s recap?
      </Text>
      <Text
        style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 19.5, color: palette.inkSoft }}>
        If you turn this on, a small, minimized summary of your baby’s logs — just aggregated counts
        (feeds, diaper changes, spit-ups, longest sleep) and a coarse age band — is sent to Anthropic
        (Claude), the AI provider, to word the short read above. Your baby’s name, date of birth, your
        notes, the exact things you type or say, and your pediatrician’s number are never sent.
      </Text>
      <Text
        style={{
          fontFamily: fonts.body,
          fontSize: 13,
          lineHeight: 19.5,
          color: palette.inkSoft,
          marginTop: 10,
        }}>
        Reassure works fully without this — you’ll always see the recap and guidance without AI.
        This is general information, not medical advice, and never a diagnosis.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Turn on the AI-phrased night read"
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
              Turn on AI read
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keep the local read without AI"
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
