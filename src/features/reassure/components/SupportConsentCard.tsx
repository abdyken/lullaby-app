/**
 * SupportConsentCard — the BLOCKING, one-time opt-in for the AI support companion.
 *
 * This path sends the parent's OWN WORDS to Anthropic, so it is a required step
 * before the first real AI call: the companion reply cannot be produced until the
 * parent explicitly agrees here. A decline keeps the local, non-AI support line;
 * there is no dismiss-and-proceed affordance, so no message is ever sent without
 * an affirmative tap. The same decision can be revoked later in
 * Settings → Privacy & data.
 *
 * Tappable surfaces live on an inner View, not the Pressable (Android Expo Go
 * background-paint gotcha). Opacity-first press to match the rest of the surface.
 */
import { Pressable, Text, View } from 'react-native';

import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

/**
 * The device speech-recognition provider named in the disclosure. Held as a
 * single constant so it is trivial to extend to "Apple or Google" once Android
 * voice ships — do not hardcode it inside the copy below. iOS-only today.
 */
const SPEECH_PROVIDER = 'Apple';

/**
 * The review-facing disclosure copy, verbatim. Kept as string constants (not
 * inline JSX text) so the exact wording — apostrophes included — is preserved
 * and lint-clean, and so it is easy to find for future localization.
 */
const COPY = {
  eyebrow: 'AI companion',
  title: 'Use the AI companion?',
  body: [
    "The AI companion sends the words you type or say here to Anthropic (Claude), a third-party AI provider, through Lullaby's secure backend, so it can write a supportive reply. This is for how you're feeling and coping — not for medical questions, and it's never a diagnosis.",
    "Please don't include your baby's name or health details, as your message is sent as written.",
    `If you use the microphone to speak your question, the audio is transcribed by your device's speech recognition service (${SPEECH_PROVIDER}) before the text is sent to the AI. This is handled by ${SPEECH_PROVIDER} under its own privacy terms.`,
    "Lullaby also keeps a short record for safety and quality: a preview of your message (up to 80 characters), its length, and the AI's reply, stored securely in our backend for a limited time. Your full message is not stored on your device or in your logs.",
    'Reassure works fully without AI. You can turn this off anytime in Settings → Privacy & data.',
  ],
  primary: 'I agree — send to AI',
  secondary: 'Not now',
} as const;

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
        {COPY.eyebrow}
      </Text>
      <Text
        style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: palette.ink, marginBottom: 8 }}>
        {COPY.title}
      </Text>
      {COPY.body.map((paragraph, index) => (
        <Text
          key={index}
          style={{
            fontFamily: fonts.body,
            fontSize: 13,
            lineHeight: 19.5,
            color: palette.inkSoft,
            marginTop: index === 0 ? 0 : 10,
          }}>
          {paragraph}
        </Text>
      ))}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="I agree — send my message to the AI companion"
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
              {COPY.primary}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not now — keep support without AI"
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
              {COPY.secondary}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
