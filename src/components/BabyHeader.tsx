import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { formatBabyAge } from '@/data/currentState';
import type { Baby, Caregiver } from '@/data/models';
import { colors, fonts, surfaces, type SurfaceMode } from '@/theme';
import { ThemeIconButton, type ThemeToggleHandler } from './ThemeIconButton';

type Props = {
  baby: Baby;
  ageWeeks: number;
  caregivers: Caregiver[];
  /**
   * Opens the account/settings surface. The baby avatar IS the single, labeled
   * account entry (there is no separate person-glyph button anymore): Tonight
   * routes a signed-in tap to the full /settings screen and a guest tap to the
   * thin AccountSheet. The Pressable carries an explicit account label + button
   * role so the entry stays discoverable and accessible — it must never read as
   * a bare decorative image.
   */
  onPress?: () => void;
  onThemeToggle?: ThemeToggleHandler;
  themeToggleDisabled?: boolean;
  /** surface palette — 'day' (default) or 'night' for low-glare text */
  surfaceMode?: SurfaceMode;
};

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
  return caregiver.displayName.trim().charAt(0).toUpperCase();
}

export function BabyHeader({
  baby,
  ageWeeks,
  caregivers,
  onPress,
  onThemeToggle,
  themeToggleDisabled = false,
  surfaceMode = 'day',
}: Props) {
  const palette = surfaces[surfaceMode];
  // Up to two caregiver avatars, shown as read-only "who's in this family" info.
  const shownCaregivers = caregivers.slice(0, 2);
  const caregiverLabel =
    shownCaregivers.length > 0
      ? `Caregivers: ${shownCaregivers.map((c) => c.displayName).join(', ')}`
      : 'Caregivers';

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
      {/* The baby avatar is the single, labeled account entry — it carries the
          discoverability + a11y that the removed person-glyph used to guarantee,
          so it announces itself as "Account and settings" (button role), not a
          bare image. Tonight decides where it goes (guest → AccountSheet,
          signed-in → /settings). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Account and settings"
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

      {/* Caregiver avatars — informational only (who's already in this family).
          No tap target and no "+" invite affordance: partner invites are a
          post-launch feature, so the header must not promise them. The baby
          avatar is the single, clear entry to the account panel. */}
      <View
        accessibilityRole="image"
        accessibilityLabel={caregiverLabel}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-start',
          width: 69,
          height: 33,
          padding: 2,
        }}>
        {shownCaregivers.map((caregiver, index) => (
          <View
            key={caregiver.id}
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
              backgroundColor: caregiver.colorHex,
            }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 10.5, color: colors.white }}>
              {initialFor(caregiver)}
            </Text>
          </View>
        ))}
      </View>

      {onThemeToggle ? (
        <View style={{ position: 'absolute', top: 6, right: 2 }}>
          <ThemeIconButton surfaceMode={surfaceMode} onPress={onThemeToggle} disabled={themeToggleDisabled} />
        </View>
      ) : null}
    </View>
  );
}

export default BabyHeader;
