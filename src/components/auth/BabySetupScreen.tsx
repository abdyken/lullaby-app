/**
 * BabySetupScreen — the one-time step for a signed-in caregiver with no baby yet.
 *
 *   Create → set up a NEW baby (name + age in weeks) and become its first
 *            caregiver.
 *
 * Collects the caregiver's display name + role (role picks the brand color).
 * Copy stays honest and private — this is about your night log and your
 * caregiver, never a social/family-management surface.
 *
 * NOTE: the "Join with code" caregiver-invite path is intentionally hidden for
 * this release. The invite CREATION UI (InviteCaregiverSheet) is not mounted
 * anywhere yet, so a user can never obtain a code — leaving "Join with code" a
 * dead end (App Store 2.1 risk). The join wiring (AuthProvider.joinWithInvite,
 * acceptInvite, the invite RPCs/migrations) is left fully intact for a future
 * release; only this UI entry point is removed so the path isn't reachable.
 */
import { useEffect, useState } from 'react';

import { loadOnboardingDraft } from '@/components/onboarding/onboardingStorage';
import type { CaregiverRole } from '@/data/models';
import { birthDateFromWeeks, parseWeeks, weeksFromBirthDate } from '@/data/localBaby';
import { useAuth } from '@/state/AuthProvider';

import { AuthButton, AuthField, AuthLink, AuthNote, AuthShell } from './AuthShell';
import { RolePicker, colorForRole } from './RolePicker';

export function BabySetupScreen() {
  const { completeSetup, signOut, busy, errorMessage, appleDisplayName, caregiver } = useAuth();
  // Prefill "Your name" for a signed-in Apple caregiver: on their first Sign in with
  // Apple we captured the real name (appleDisplayName), and a returning Apple/account
  // user already has it on their profile (caregiver.displayName). Prefilled but fully
  // editable — never a blocker. A fresh email sign-up has neither, so it stays empty
  // and the email/local path is unchanged. Lazy initializer (not an effect) so it
  // never clobbers typing and stays clear of the no-setState-in-effect rule; both
  // sources are already resolved by the time this one-time screen mounts.
  const [displayName, setDisplayName] = useState(() => appleDisplayName ?? caregiver?.displayName ?? '');
  const [role, setRole] = useState<CaregiverRole>('mom');
  const [babyName, setBabyName] = useState('');
  const [weeks, setWeeks] = useState('');

  // Prefill the baby fields from the onboarding draft so a caregiver who just
  // signed in never re-enters what onboarding already collected (name + age). Only
  // fills still-empty fields (functional updater), so it never clobbers typing; the
  // caregiver still confirms their own name + role, which onboarding never asked
  // for. setState only runs inside the async callback, so the React Compiler's
  // no-setState-in-effect rule holds.
  useEffect(() => {
    let active = true;
    loadOnboardingDraft()
      .then((draft) => {
        if (!active || draft == null) return;
        if (draft.babyName != null && draft.babyName.length > 0) {
          setBabyName((cur) => (cur.length > 0 ? cur : draft.babyName ?? ''));
        }
        const draftWeeks = weeksFromBirthDate(draft.birthDate);
        if (draftWeeks != null) {
          setWeeks((cur) => (cur.length > 0 ? cur : String(draftWeeks)));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const weeksValue = parseWeeks(weeks);
  const nameOk = displayName.trim().length > 0;
  const canCreate = nameOk && babyName.trim().length > 0 && weeksValue != null && !busy;

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

      <RolePicker role={role} onChange={setRole} />

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

      <AuthButton label="Start tonight" onPress={submitCreate} busy={busy} disabled={!canCreate} />
    </AuthShell>
  );
}

export default BabySetupScreen;
