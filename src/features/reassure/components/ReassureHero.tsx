/**
 * ReassureHero — the night-sky hero that hosts the voice orb. Reassure lives
 * at 2am, so its face is the night sky in BOTH surface modes (the same trick
 * OrbHero pulls with its night gradient on the day surface). Gradient reuses
 * the sky.night token — identical hexes to the demo's hero gradient.
 */
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { fonts, radii, shadows, sky } from '@/theme';

/** The demo's six scattered stars (position + size, ported verbatim). */
const STARS: { top: number; left?: number; right?: number; size: number }[] = [
  { top: 26, left: 34, size: 13 },
  { top: 52, right: 44, size: 9 },
  { top: 96, left: 52, size: 7 },
  { top: 34, right: 96, size: 10 },
  { top: 120, right: 60, size: 8 },
  { top: 74, left: 24, size: 6 },
];

const STAR_PATH = 'M12 2l2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7Z';

export function ReassureHero({ children }: { children: ReactNode }) {
  return (
    <LinearGradient
      colors={sky.night}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{
        borderRadius: radii.large,
        overflow: 'hidden',
        paddingTop: 26,
        paddingBottom: 30,
        paddingHorizontal: 20,
        marginTop: 6,
        ...shadows.card,
      }}>
      {STARS.map((star, ix) => (
        <View
          key={ix}
          pointerEvents="none"
          style={{ position: 'absolute', top: star.top, left: star.left, right: star.right }}>
          <Svg width={star.size} height={star.size} viewBox="0 0 24 24">
            <Path d={STAR_PATH} fill="rgba(255,255,255,0.9)" />
          </Svg>
        </View>
      ))}

      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <Text style={{ fontFamily: fonts.displayMedium, fontSize: 18, color: '#FFFFFF' }}>
          It’s 2am and you’re not sure.
        </Text>
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 12.5,
            color: 'rgba(255,255,255,0.82)',
            marginTop: 2,
          }}>
          That’s exactly what this is for.
        </Text>
      </View>

      <View style={{ alignItems: 'center' }}>{children}</View>

      <Text
        style={{
          textAlign: 'center',
          fontFamily: fonts.body,
          fontSize: 12,
          lineHeight: 17.5,
          color: 'rgba(255,255,255,0.85)',
          marginTop: 18,
          paddingHorizontal: 6,
        }}>
        Hands full? Just ask out loud. I only answer what’s safe to — anything urgent, I send you
        straight to your doctor.
      </Text>
    </LinearGradient>
  );
}
