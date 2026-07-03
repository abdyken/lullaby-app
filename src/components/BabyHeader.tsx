import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { formatBabyAge } from '@/data/currentState';
import type { Baby, Caregiver } from '@/data/models';
import { colors, fonts, shadows, surfaces, type SurfaceMode } from '@/theme';
import { ThemeIconButton, type ThemeToggleHandler } from './ThemeIconButton';

type Props = {
  baby: Baby;
  ageWeeks: number;
  caregivers: Caregiver[];
  onPress?: () => void;
  /**
   * Opens the account / settings surface (Tonight pushes the dedicated /settings
   * screen). Rendered as an explicit, labeled icon button in the header so the
   * entry is obvious — the app must not rely on the user discovering that
   * tapping the baby header opens the quick account sheet.
   */
  onAccount?: () => void;
  onThemeToggle?: ThemeToggleHandler;
  themeToggleDisabled?: boolean;
  /** surface palette — 'day' (default) or 'night' for low-glare text */
  surfaceMode?: SurfaceMode;
};

/** A calm person glyph for the account button (stroke style matches the theme icons). */
function AccountGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3.6} stroke={color} strokeWidth={2.1} />
      <Path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" stroke={color} strokeWidth={2.1} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * The explicit account/settings entry in the header. A glass icon button mirroring
 * ThemeIconButton's surface-aware styling, so it reads as a real, tappable
 * affordance (not part of the baby illustration). Labeled for discoverability + a11y.
 */
function AccountIconButton({ surfaceMode, onPress }: { surfaceMode: SurfaceMode; onPress: () => void }) {
  const isNight = surfaceMode === 'night';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Account and settings"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.74)',
        borderWidth: 1,
        borderColor: isNight ? 'transparent' : 'rgba(255,255,255,0.88)',
        transform: [{ scale: pressed ? 0.94 : 1 }],
        ...shadows.card,
        shadowColor: isNight ? 'rgb(0,0,0)' : shadows.card.shadowColor,
      })}>
      <AccountGlyph color={colors.sleep} />
    </Pressable>
  );
}

function BabyAvatar() {
  return (
    <Svg width={44} height={44} viewBox="0 0 50 50" fill="none">
      <Path d="M25 3c11 0 21 7 21 21 0 14-9 23-21 23S4 38 4 24C4 10 14 3 25 3Z" fill="url(#babyBg)" />
      <Path d="M19 1c2 2 2 5 0 7-3-1-5-4-4-6 1-1 3-1 4-1Z" fill="#FFB07A" />
      <Circle cx={19} cy={25} r={2.4} fill="#5A3A28" />
      <Circle cx={31} cy={25} r={2.4} fill="#5A3A28" />
      <Path d="M21 32c2 2 6 2 8 0" stroke="#5A3A28" strokeWidth={2} strokeLinecap="round" />
      <Circle cx={15} cy={30} r={2.6} fill="#FF9E7E" opacity={0.5} />
      <Circle cx={35} cy={30} r={2.6} fill="#FF9E7E" opacity={0.5} />
      <Defs>
        <LinearGradient id="babyBg" x1={4} y1={3} x2={46} y2={47}>
          <Stop stopColor="#FFD9A8" />
          <Stop offset={1} stopColor="#FF9E6B" />
        </LinearGradient>
      </Defs>
    </Svg>
  );
}

function initialFor(caregiver: Caregiver) {
  return caregiver.displayName.trim().charAt(0).toUpperCase() || '+';
}

export function BabyHeader({
  baby,
  ageWeeks,
  caregivers,
  onPress,
  onAccount,
  onThemeToggle,
  themeToggleDisabled = false,
  surfaceMode = 'day',
}: Props) {
  const stackItems = [...caregivers.slice(0, 2), undefined];
  const palette = surfaces[surfaceMode];

  return (
    <View
      style={{
        width: '100%',
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 2,
        paddingTop: 6,
        paddingRight: onThemeToggle ? 54 : 2,
        position: 'relative',
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${baby.name} profile`}
        onPress={onPress}
        hitSlop={8}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          flex: 1,
          gap: 12,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}>
        <BabyAvatar />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 18, lineHeight: 20, color: palette.ink }}>
            {baby.name}
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: palette.inkSoft, marginTop: 1 }}>
            {formatBabyAge(ageWeeks)}
          </Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Caregivers and partner handoff"
        onPress={onPress}
        hitSlop={8}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: 69,
          height: 33,
          padding: 2,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        })}>
        {stackItems.map((caregiver, index) => (
          <View
            key={caregiver?.id ?? 'invite'}
            style={{
              position: index === 0 ? 'relative' : 'absolute',
              left: index === 0 ? 0 : index * 20,
              width: 29,
              height: 29,
              borderRadius: 15,
              borderWidth: 2.5,
              borderColor: palette.bg,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: caregiver?.colorHex ?? colors.diaper,
            }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 10.5, color: colors.white }}>
              {caregiver ? initialFor(caregiver) : '+'}
            </Text>
          </View>
        ))}
      </Pressable>

      {/* Explicit, labeled account entry — sits inline left of the (absolute)
          theme toggle, inside the reserved right padding. The extra marginLeft
          keeps a clear, intentional gap from the caregiver avatar cluster so the
          person glyph doesn't crowd the "+" invite chip. */}
      {onAccount ? (
        <View style={{ marginLeft: 8 }}>
          <AccountIconButton surfaceMode={surfaceMode} onPress={onAccount} />
        </View>
      ) : null}

      {onThemeToggle ? (
        <View style={{ position: 'absolute', top: 6, right: 2 }}>
          <ThemeIconButton surfaceMode={surfaceMode} onPress={onThemeToggle} disabled={themeToggleDisabled} />
        </View>
      ) : null}
    </View>
  );
}

export default BabyHeader;
