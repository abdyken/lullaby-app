/**
 * ForgotPasswordScreen — a calm "email me a reset link" surface, reached from the
 * sign-in form via "Forgot password?". It calls Supabase `resetPasswordForEmail`
 * through `useAuth().resetPassword` and, on success, swaps to a reassuring
 * "check your inbox" confirmation.
 *
 * The success copy deliberately does NOT confirm whether an account exists for
 * the address — Supabase returns success either way (anti-enumeration), and a
 * tired parent gets the same calm next step regardless. Errors (offline, rate
 * limit) surface through the shared `errorMessage`, mapped to calm copy upstream.
 *
 * Tapping the link lands the caregiver back in the app via the deep-link
 * foundation (src/lib/authLinking.ts); the dedicated "set a new password" screen
 * is a documented follow-up (see supabase/README.md).
 */
import { useState } from 'react';

import { useAuth } from '@/state/AuthProvider';

import { AuthButton, AuthField, AuthLink, AuthNote, AuthShell } from './AuthShell';

/** Lenient shape check — local@domain.tld — matching the sign-in field's rule. */
const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** Calm, parent-facing reason the email isn't ready yet (null = fine). */
function emailIssue(email: string): string | null {
  const trimmed = email.trim();
  if (trimmed.length === 0) return 'Please add your email address.';
  if (!EMAIL_RE.test(trimmed)) return "That doesn't look like an email — please check it.";
  return null;
}

export function ForgotPasswordScreen({
  onBack,
  initialEmail = '',
}: {
  /** Return to the sign-in form. */
  onBack: () => void;
  /** Prefill from whatever the caregiver already typed on the sign-in screen. */
  initialEmail?: string;
}) {
  const { resetPassword, busy, errorMessage, clearError } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);

  const rawEmailIssue = emailIssue(email);
  const emailError = touched ? rawEmailIssue : null;
  const canSubmit = rawEmailIssue == null && !busy;

  const submit = async () => {
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    const ok = await resetPassword(email);
    if (ok) setSent(true);
  };

  const back = () => {
    clearError();
    onBack();
  };

  if (sent) {
    return (
      <AuthShell
        eyebrow="Lullaby"
        title="Check your inbox"
        subtitle="If an account exists for that email, we've sent a link to set a new password. It can take a minute to arrive."
        footer={<AuthLink label="Back to sign in" onPress={back} />}>
        <AuthNote
          tone="info"
          message="Didn't get it? Check your spam folder, or go back and try again."
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Lullaby"
      title="Reset your password"
      subtitle="Enter your account email and we'll send a link to set a new password."
      footer={<AuthLink label="Back to sign in" onPress={back} />}>
      <AuthField
        label="Email"
        value={email}
        onChangeText={(t) => {
          clearError();
          setEmail(t);
        }}
        onBlur={() => setTouched(true)}
        error={emailError}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />

      {errorMessage != null && <AuthNote message={errorMessage} tone="error" />}

      <AuthButton
        label="Send reset link"
        onPress={() => void submit()}
        busy={busy}
        disabled={!canSubmit}
      />
    </AuthShell>
  );
}

export default ForgotPasswordScreen;
