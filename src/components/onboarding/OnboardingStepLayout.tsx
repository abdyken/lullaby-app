/**
 * OnboardingStepLayout — the per-step scaffold for the personalized setup flow
 * (onboarding Phase 1A foundation, roadmap §10/§13).
 *
 * Built on the shared `AuthSurface` (the auth/setup cream + keyboard-aware
 * scaffold) rather than a parallel cream background. The orb sits in a fixed top
 * header zone and the primary CTA is pinned to the bottom, with the step content
 * scrolling between them — so the keyboard can never cover the action (§10
 * choreography #2) and the orb stays put as the parent moves between steps.
 *
 * This slice only lands the layout; the live flow wires it to `<Orb>` +
 * `useOnboardingFlow` in the next slice. Step-change a11y (setAccessibilityFocus)
 * and Dynamic Type are roadmap §10 polish, deferred to a later Phase 1A slice.
 */
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthSurface } from '@/components/auth/AuthShell';
import { colors, fonts, surfaces, type SurfaceMode } from '@/theme';

export function OnboardingStepLayout({
  orb,
  eyebrow,
  title,
  subtitle,
  children,
  cta,
  secondaryCta,
  mode = 'day',
}: {
  /** The shared `<Orb>` protagonist, pinned in the top header zone. */
  orb?: ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Step content (fields / choices) — scrolls between the orb and the CTA. */
  children?: ReactNode;
  /** Primary action, pinned to the bottom so the keyboard never covers it. */
  cta: ReactNode;
  /** Optional low-emphasis action under the CTA (e.g. "Skip for now"). */
  secondaryCta?: ReactNode;
  /**
   * Resolved surface for the scaffold. Night paints the low-glare navy bg + ink
   * (roadmap §10 night-safety) so a 3am first frame isn't a cream/white shock.
   * Defaults to 'day', which is byte-identical to the original cream scaffold.
   */
  mode?: SurfaceMode;
}) {
  const insets = useSafeAreaInsets();
  const surface = surfaces[mode];
  return (
    <AuthSurface>
      <View
        style={{
          flex: 1,
          backgroundColor: surface.bg,
          paddingHorizontal: 22,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 18,
        }}>
        {orb != null && <View style={{ alignItems: 'center', marginBottom: 18 }}>{orb}</View>}

        {eyebrow != null && (
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 11,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: colors.sleep,
            }}>
            {eyebrow}
          </Text>
        )}
        <Text style={{ fontFamily: fonts.display, fontSize: 28, color: surface.ink, marginTop: 6 }}>
          {title}
        </Text>
        {subtitle != null && (
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 14,
              lineHeight: 20,
              color: surface.inkSoft,
              marginTop: 4,
            }}>
            {subtitle}
          </Text>
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 22, gap: 14 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>

        <View style={{ gap: 12, paddingTop: 16 }}>
          {cta}
          {secondaryCta != null && <View style={{ alignItems: 'center' }}>{secondaryCta}</View>}
        </View>
      </View>
    </AuthSurface>
  );
}

export default OnboardingStepLayout;
