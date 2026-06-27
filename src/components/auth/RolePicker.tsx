/**
 * RolePicker — the shared "You are" caregiver-role control (onboarding Phase 1A
 * foundation, roadmap §13). Extracted from `BabySetupScreen` so the live setup
 * flow and the auth setup screen pick a role through one component.
 *
 * Contrast fix (roadmap §10): the old active style painted white text on the raw
 * role color — `mom #FF9E5E` (~1.9:1) and "Other" teal `#23B79E` (~2.3:1) both
 * fail WCAG AA, worse at night. Selection is now ink-on-tint: a soft role tint
 * fill + the role color as a 2px border + ink text (high contrast, brand color
 * still present). Behavior (which role is selected) is unchanged.
 */
import { Pressable, Text, View } from 'react-native';

import type { CaregiverRole } from '@/data/models';
import { colors, fonts, radii } from '@/theme';

type RoleOption = { role: CaregiverRole; label: string; color: string; tint: string };

/** Role → brand color + soft tint (blueprint: Mom #FF9E5E / Dad #5560C6; Other = calm teal). */
export const ROLES: RoleOption[] = [
  { role: 'mom', label: 'Mom', color: colors.mom, tint: colors.feedTint },
  { role: 'dad', label: 'Dad', color: colors.dad, tint: colors.sleepTint },
  { role: 'other', label: 'Other', color: colors.diaper, tint: colors.diaperTint },
];

export function colorForRole(role: CaregiverRole): string {
  return ROLES.find((r) => r.role === role)?.color ?? colors.mom;
}

/** The shared "You are" role picker. */
export function RolePicker({ role, onChange }: { role: CaregiverRole; onChange: (r: CaregiverRole) => void }) {
  return (
    <View>
      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: colors.inkSoft,
          marginBottom: 6,
        }}>
        You are
      </Text>
      <View style={{ flexDirection: 'row', gap: 9 }}>
        {ROLES.map((opt) => {
          const active = opt.role === role;
          return (
            <Pressable
              key={opt.role}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={opt.label}
              onPress={() => onChange(opt.role)}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radii.medium,
                backgroundColor: active ? opt.tint : colors.surface,
                borderWidth: 2,
                borderColor: active ? opt.color : colors.line,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}>
              <Text
                style={{
                  fontFamily: fonts.bodyBold,
                  fontSize: 14,
                  color: active ? colors.ink : colors.inkSoft,
                }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default RolePicker;
