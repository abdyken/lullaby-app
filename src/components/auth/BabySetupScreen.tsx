/**
 * BabySetupScreen — the one-time "get to a baby in <60s" step (blueprint §
 * Onboarding / Baby Profile Setup). Shown when a caregiver is signed in but not
 * yet linked to a baby.
 *
 * Collects only what the data model needs: the caregiver's display name + role
 * (role picks the brand color), the baby's name, and an age in weeks (simpler
 * and more reliable at 3am than a date picker — converted to a birth date).
 *
 * Copy stays honest: this sets up YOUR night log. It does not promise partner
 * sync yet — inviting a second caregiver is a later slice.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { CaregiverRole } from '@/data/models';
import { useAuth } from '@/state/AuthProvider';
import { colors, fonts, radii } from '@/theme';

import { AuthButton, AuthField, AuthLink, AuthNote, AuthShell } from './AuthShell';

/** Role → brand color (blueprint: Mom #FF9E5E / Dad #5560C6; Other = calm teal). */
const ROLES: { role: CaregiverRole; label: string; color: string }[] = [
  { role: 'mom', label: 'Mom', color: colors.mom },
  { role: 'dad', label: 'Dad', color: colors.dad },
  { role: 'other', label: 'Other', color: colors.diaper },
];

/** Convert a whole-week age into an ISO birth date (YYYY-MM-DD). */
function birthDateFromWeeks(weeks: number): string {
  const ms = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function parseWeeks(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 260) return null;
  return Math.floor(n);
}

export function BabySetupScreen() {
  const { completeSetup, signOut, busy, errorMessage } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<CaregiverRole>('mom');
  const [babyName, setBabyName] = useState('');
  const [weeks, setWeeks] = useState('');

  const weeksValue = parseWeeks(weeks);
  const canSubmit =
    displayName.trim().length > 0 && babyName.trim().length > 0 && weeksValue != null && !busy;

  const submit = () => {
    if (!canSubmit || weeksValue == null) return;
    const color = ROLES.find((r) => r.role === role)?.color ?? colors.mom;
    void completeSetup({
      displayName,
      role,
      colorHex: color,
      babyName,
      birthDate: birthDateFromWeeks(weeksValue),
    });
  };

  return (
    <AuthShell
      eyebrow="Almost there"
      title="Set up tonight"
      subtitle="Just a few details to start your night log. You can change these later."
      footer={<AuthLink label="Not you? Sign out" onPress={() => void signOut()} />}>
      <AuthField
        label="Your name"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="e.g. Mom"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={40}
      />

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
                onPress={() => setRole(opt.role)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radii.medium,
                  backgroundColor: active ? opt.color : colors.surface,
                  borderWidth: 2,
                  borderColor: active ? opt.color : colors.line,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}>
                <Text
                  style={{
                    fontFamily: fonts.bodyBold,
                    fontSize: 14,
                    color: active ? colors.white : colors.inkSoft,
                  }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <AuthField
        label="Baby's name"
        value={babyName}
        onChangeText={setBabyName}
        placeholder="e.g. Mia"
        autoCapitalize="words"
        maxLength={40}
      />
      <AuthField
        label="Age in weeks"
        value={weeks}
        onChangeText={setWeeks}
        placeholder="e.g. 7"
        keyboardType="number-pad"
        maxLength={3}
      />

      {errorMessage != null && <AuthNote message={errorMessage} tone="error" />}

      <AuthButton label="Start tonight" onPress={submit} busy={busy} disabled={!canSubmit} />
    </AuthShell>
  );
}

export default BabySetupScreen;
