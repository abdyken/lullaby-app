import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Orb } from '@/components/Orb';
import type { OrbCoreKind, OrbStateIconKind } from '@/components/Orb';
import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import type { AccentState, SurfaceMode } from '@/theme';
import { colors, fonts, getAccentForState, radii, shadows, sky } from '@/theme';

// The orb itself (body + breathe + ring + core) now lives in `<Orb>`; re-export
// its types + breathe driver here so existing `@/components/OrbHero` consumers
// (e.g. currentState.ts, the theme-reveal overlay) keep their import paths.
export type { OrbSky, OrbCoreKind, OrbStateIconKind } from '@/components/Orb';
export { useOrbBreathe } from '@/components/Orb';

export type OrbHeroProps = {
  state: AccentState;
  skyTone: 'day' | 'night' | 'dusk';
  eyebrow: string;
  timerText: string;
  title: string;
  description: string;
  actionLabel: string;
  progress: number;
  coreKind?: OrbCoreKind;
  stateIcon?: OrbStateIconKind;
  onActionPress?: () => void;
  /** Kept for callers that render the hero inside the day/night theme reveal. */
  surfaceMode?: SurfaceMode;
  /**
   * Optional shared breathe driver. Pass the value from `useOrbBreathe()` so a
   * second (theme-reveal overlay) copy of the orb breathes in perfect phase with
   * the base — otherwise each copy runs its own loop and the orb edge appears to
   * jump where the reveal circle crosses it. Omit it for a standalone orb.
   */
  breathe?: Animated.Value;
};

const FILL = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };

function SkyDecor({ nightOpacity }: { nightOpacity: number }) {
  const cloudOpacity = 1 - nightOpacity;
  const starOpacity = nightOpacity;
  const stars: { top: number; left?: number; right?: number; size: number }[] = [
    { top: 19, left: 30, size: 13 },
    { top: 46, right: 36, size: 9 },
    { top: 82, left: 54, size: 7 },
    { top: 26, right: 72, size: 10 },
  ];

  return (
    <>
      <Animated.View
        style={{
          position: 'absolute',
          top: 22,
          left: 22,
          width: 54,
          height: 20,
          borderRadius: 40,
          backgroundColor: 'rgba(255,255,255,0.7)',
          opacity: cloudOpacity,
        }}
      />
      <Animated.View
        style={{
          position: 'absolute',
          top: 27,
          left: 38,
          width: 26,
          height: 12,
          borderRadius: 40,
          backgroundColor: 'rgba(255,255,255,0.55)',
          opacity: cloudOpacity,
        }}
      />
      <Animated.View
        style={{
          position: 'absolute',
          top: 56,
          right: 26,
          width: 38,
          height: 14,
          borderRadius: 40,
          backgroundColor: 'rgba(255,255,255,0.7)',
          opacity: cloudOpacity,
        }}
      />
      {stars.map((star, index) => (
        <Animated.View
          key={index}
          style={{ position: 'absolute', top: star.top, left: star.left, right: star.right, opacity: starOpacity }}>
          <Svg width={star.size} height={star.size} viewBox="0 0 24 24">
            <Path d="M12 2l2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7Z" fill="rgba(255,255,255,0.9)" />
          </Svg>
        </Animated.View>
      ))}
    </>
  );
}

export function OrbHero({
  state,
  skyTone,
  eyebrow,
  timerText,
  title,
  description,
  actionLabel,
  progress,
  coreKind = 'timer',
  stateIcon,
  onActionPress,
  breathe,
}: OrbHeroProps) {
  const accent = getAccentForState(state);
  const actionColor = actionLabel === 'Start sleep' ? colors.feed : accent.color;
  const nightOpacity = skyTone === 'night' ? 1 : 0;
  const dayOpacity = 1 - nightOpacity;
  const dayOrbTone = skyTone === 'dusk' ? 'dusk' : 'day';

  return (
    <View style={{ gap: 11 }}>
      <View
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: radii.large,
          paddingTop: 18,
          paddingHorizontal: 18,
          paddingBottom: 20,
          ...shadows.card,
        }}>
        <Animated.View pointerEvents="none" style={[FILL, { opacity: dayOpacity }]}>
          <LinearGradient
            colors={sky[dayOrbTone]}
            start={{ x: 0.08, y: 0 }}
            end={{ x: 0.92, y: 1 }}
            style={FILL}
          />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[FILL, { opacity: nightOpacity }]}>
          <LinearGradient colors={sky.night} start={{ x: 0.08, y: 0 }} end={{ x: 0.92, y: 1 }} style={FILL} />
        </Animated.View>
        <SkyDecor nightOpacity={nightOpacity} />

        <View style={{ position: 'relative', zIndex: 2, alignItems: 'center' }}>
          <Orb
            state={state}
            skyTone={skyTone}
            eyebrow={eyebrow}
            timerText={timerText}
            progress={progress}
            coreKind={coreKind}
            stateIcon={stateIcon}
            breathe={breathe}
          />

          <View
            style={{
              maxWidth: '100%',
              marginTop: 8,
              marginBottom: 14,
              borderRadius: radii.pill,
              paddingVertical: 9,
              paddingHorizontal: 16,
              backgroundColor: skyTone === 'night' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.78)',
              borderWidth: 1,
              borderColor: skyTone === 'night' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.52)',
            }}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={{
                fontFamily: fonts.bodyBold,
                fontSize: 12.5,
                color: skyTone === 'night' ? colors.white : colors.ink,
                textAlign: 'center',
              }}>
              {description || title}
            </Text>
          </View>

          <PrimaryActionButton
            label={actionLabel}
            accentColor={actionColor}
            animateColor={false}
            pressOpacity={0.97}
            pressScale={0.98}
            onPress={onActionPress}
          />
        </View>
      </View>
    </View>
  );
}

export default OrbHero;
