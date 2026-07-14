/**
 * SupportCard — the AI companion's answer surface. Renders exactly one of the
 * non-redirect support phases and then lets the parent dismiss:
 *   - 'loading'  → a calm "thinking with you…" line (never a spinner)
 *   - 'reply'    → the AI-phrased supportive reply, labelled as AI
 *   - 'fallback' → the local, non-AI support line (declined / not Pro / no reply)
 *
 * The safety redirects (triage / crisis / medical / oos) are NOT rendered here —
 * the screen renders those through AnswerCard. This card is only ever the
 * non-medical companion reply, always closing with the not-medical disclaimer.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Text, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { SUPPORT_COPY } from '@/features/reassure/content/kb';
import type { SupportPhase } from '@/features/reassure/application/reassureSupport';
import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

const DISCLAIMER = 'General emotional support for tonight — not medical advice, never a diagnosis.';
const AI_NOTE = 'AI-phrased · your words were sent to Anthropic (Claude).';

type Props = {
  phase: Extract<SupportPhase, 'loading' | 'reply' | 'fallback'>;
  reply: string | null;
  surfaceMode: SurfaceMode;
  reduceMotion: boolean;
  onDismiss: () => void;
};

export function SupportCard({ phase, reply, surfaceMode, reduceMotion, onDismiss }: Props) {
  const palette = surfaces[surfaceMode];

  const [progress] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 400,
      easing: Easing.bezier(0.2, 0.8, 0.25, 1),
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion, phase]);

  const body =
    phase === 'loading' ? SUPPORT_COPY.loadingLine : phase === 'reply' && reply != null ? reply : SUPPORT_COPY.fallback;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={{
        marginTop: 14,
        borderRadius: radii.medium,
        backgroundColor: palette.card,
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
        ],
        ...shadows.card,
      }}>
      <View style={{ borderRadius: radii.medium, overflow: 'hidden' }}>
        <LinearGradient colors={[colors.sleep2, colors.sleep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View
            style={{
              paddingHorizontal: 18,
              paddingTop: 16,
              paddingBottom: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}>
            <Text
              style={{ fontFamily: fonts.displayMedium, fontSize: 17, color: colors.white, flex: 1 }}>
              A moment for you
            </Text>
            <View
              style={{
                backgroundColor: 'rgba(255,255,255,0.24)',
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: radii.pill,
              }}>
              <Text
                style={{
                  fontFamily: fonts.bodyBold,
                  fontSize: 10,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: colors.white,
                }}>
                {SUPPORT_COPY.tag}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={{ backgroundColor: palette.card, paddingHorizontal: 18, paddingBottom: 18 }}>
          <View style={{ flexDirection: 'row', gap: 11, paddingTop: 14, paddingBottom: 10 }}>
            <View style={{ width: 3, borderRadius: 2, backgroundColor: colors.sleep }} />
            <Text
              style={{
                flex: 1,
                fontFamily: phase === 'loading' ? fonts.body : fonts.bodyBold,
                fontSize: 14,
                lineHeight: 21,
                color: phase === 'loading' ? palette.inkSoft : palette.ink,
              }}>
              {body}
            </Text>
          </View>

          {phase === 'reply' ? (
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: 11.5,
                lineHeight: 16,
                color: palette.inkFaint,
                marginBottom: 4,
              }}>
              {AI_NOTE}
            </Text>
          ) : null}

          <View
            style={{
              backgroundColor: surfaceMode === 'night' ? 'rgba(255,255,255,0.06)' : colors.surfaceSoft,
              borderRadius: radii.small,
              padding: 13,
              marginTop: 6,
            }}>
            <Text
              style={{
                fontFamily: fonts.bodyBold,
                fontSize: 12.5,
                lineHeight: 19,
                color: palette.inkSoft,
              }}>
              {DISCLAIMER}
            </Text>
          </View>

          {phase !== 'loading' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              onPress={onDismiss}
              hitSlop={8}
              style={{ paddingTop: 14, alignItems: 'center' }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.sleep }}>
                {SUPPORT_COPY.dismiss}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}
