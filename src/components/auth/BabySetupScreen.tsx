/**
 * BabySetupScreen — the one-time step for a signed-in caregiver with no baby yet.
 * Two calm paths, chosen with a small segmented toggle:
 *
 *   Create → set up a NEW baby (name + age in weeks) and become its first
 *            caregiver.
 *   Join   → enter an invite CODE from a caregiver who already set up the baby,
 *            and join their shared night log.
 *
 * Both collect the caregiver's display name + role (role picks the brand color).
 * Copy stays honest and private — this is about your night log and your
 * caregiver, never a social/family-management surface.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { CaregiverRole } from '@/data/models';
import { birthDateFromWeeks, parseWeeks } from '@/data/localBaby';
import { useAuth } from '@/state/AuthProvider';
import { colors, fonts, radii } from '@/theme';

import { AuthButton, AuthField, AuthLink, AuthNote, AuthShell } from './AuthShell';
import { RolePicker, colorForRole } from './RolePicker';

type Mode = 'create' | 'join';

/** Two-option segmented control (Create / Join). */
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const options: { key: Mode; label: string }[] = [
    { key: 'create', label: 'New baby' },
    { key: 'join', label: 'Join with code' },
  ];
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surfaceSoft,
        borderRadius: radii.medium,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 4,
        gap: 4,
      }}>
      {options.map((opt) => {
        const active = opt.key === mode;
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
            onPress={() => onChange(opt.key)}
            style={{
              flex: 1,
              minHeight: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radii.small,
              backgroundColor: active ? colors.surface : 'transparent',
            }}>
            <Text
              style={{
                fontFamily: fonts.bodyBold,
                fontSize: 13,
                color: active ? colors.ink : colors.inkSoft,
              }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function BabySetupScreen() {
  const { completeSetup, joinWithInvite, signOut, busy, errorMessage, clearError } = useAuth();
  const [mode, setMode] = useState<Mode>('create');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<CaregiverRole>('mom');
  // create-only
  const [babyName, setBabyName] = useState('');
  const [weeks, setWeeks] = useState('');
  // join-only
  const [code, setCode] = useState('');

  const weeksValue = parseWeeks(weeks);
  const nameOk = displayName.trim().length > 0;
  const canCreate = nameOk && babyName.trim().length > 0 && weeksValue != null && !busy;
  const canJoin = nameOk && code.trim().length >= 4 && !busy;

  const submitCreate = () => {
    if (!canCreate || weeksValue == null) return;
    void completeSetup({
      displayName,
      role,
      colorHex: colorForRole(role),
      babyName,
      birthDate: birthDateFromWeeks(weeksValue),
    });
  };

  const submitJoin = () => {
    if (!canJoin) return;
    void joinWithInvite({ displayName, role, colorHex: colorForRole(role), code });
  };

  const switchMode = (next: Mode) => {
    clearError();
    setMode(next);
  };

  return (
    <AuthShell
      eyebrow="Almost there"
      title={mode === 'create' ? 'Set up tonight' : 'Join a night log'}
      subtitle={
        mode === 'create'
          ? 'Just a few details to start your night log. You can change these later.'
          : 'Enter the code your caregiver shared to join the same baby.'
      }
      footer={<AuthLink label="Not you? Sign out" onPress={() => void signOut()} />}>
      <ModeToggle mode={mode} onChange={switchMode} />

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

      <RolePicker role={role} onChange={setRole} />

      {mode === 'create' ? (
        <>
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
        </>
      ) : (
        <AuthField
          label="Invite code"
          value={code}
          onChangeText={setCode}
          placeholder="e.g. ABCD-EFGH"
          autoCapitalize="none"
          maxLength={20}
        />
      )}

      {errorMessage != null && <AuthNote message={errorMessage} tone="error" />}

      {mode === 'create' ? (
        <AuthButton label="Start tonight" onPress={submitCreate} busy={busy} disabled={!canCreate} />
      ) : (
        <AuthButton label="Join baby" onPress={submitJoin} busy={busy} disabled={!canJoin} />
      )}
    </AuthShell>
  );
}

export default BabySetupScreen;
