/**
 * AuthScreen — the calm sign-in / sign-up surface for configured builds with no
 * session. Email + password is the simplest reliable path for a native app (no
 * deep-link/OAuth redirect plumbing). One screen toggles between the two modes.
 *
 * Copy is careful: this is about your account, not partner sync. We do not
 * promise shared/realtime caregiving here — that comes after a baby is set up
 * and is still single-caregiver until the realtime + invite slices land.
 *
 * Hardened UX: client-side validation hints surface only after a field is left
 * (never mid-keystroke), the primary button reflects a clear disabled state
 * until the form is valid, the keyboard advances email → password → submit, and
 * raw Supabase errors are mapped to calm copy upstream in AuthProvider.
 */
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { useAuth } from '@/state/AuthProvider';

import { AuthButton, AuthField, AuthLink, AuthNote, AuthShell } from './AuthShell';

/** Lenient shape check — local@domain.tld — enough to catch the common typo. */
const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** Calm, parent-facing reason the email isn't ready yet (null = fine). */
function emailIssue(email: string): string | null {
  const trimmed = email.trim();
  if (trimmed.length === 0) return 'Please add your email address.';
  if (!EMAIL_RE.test(trimmed)) return "That doesn't look like an email — please check it.";
  return null;
}

/** Same, for the password. We only enforce the length rule for *new* passwords;
 *  on sign-in the server is the source of truth, so we never second-guess an
 *  existing one beyond "it's there". */
function passwordIssue(password: string, isSignUp: boolean): string | null {
  if (password.length === 0) return 'Please add your password.';
  if (isSignUp && password.length < 6) return 'Use at least 6 characters.';
  return null;
}

export function AuthScreen({
  /** Which mode to open in. Lets the account-entry surface jump straight to sign-up. */
  initialMode = 'signIn',
  /** When provided, render a "Back to options" link (returns to the entry surface). */
  onBack,
}: {
  initialMode?: 'signIn' | 'signUp';
  onBack?: () => void;
} = {}) {
  const { signIn, signUp, busy, errorMessage, pendingMessage, clearError } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Surface a field's validation hint only once the parent has left it (or tried
  // to submit) — never yell mid-keystroke on a first, still-empty field.
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });
  const passwordRef = useRef<TextInput>(null);

  const isSignUp = mode === 'signUp';
  const rawEmailIssue = emailIssue(email);
  const rawPasswordIssue = passwordIssue(password, isSignUp);
  const emailError = touched.email ? rawEmailIssue : null;
  const passwordError = touched.password ? rawPasswordIssue : null;
  const canSubmit = rawEmailIssue == null && rawPasswordIssue == null && !busy;

  const markTouched = (field: 'email' | 'password') =>
    setTouched((s) => (s[field] ? s : { ...s, [field]: true }));

  const submit = () => {
    if (!canSubmit) {
      // Reveal whatever still needs fixing instead of failing silently — the
      // keyboard "go" key can reach here while the form is incomplete.
      setTouched({ email: true, password: true });
      return;
    }
    if (isSignUp) void signUp(email, password);
    else void signIn(email, password);
  };

  const toggleMode = () => {
    clearError();
    setTouched({ email: false, password: false });
    setMode((m) => (m === 'signIn' ? 'signUp' : 'signIn'));
  };

  return (
    <AuthShell
      eyebrow="Lullaby"
      title={isSignUp ? 'Create your account' : 'Welcome back'}
      subtitle={
        isSignUp
          ? 'Set up an account to keep your night log safe across devices.'
          : 'Sign in to pick up your night log where you left off.'
      }
      footer={
        <View style={{ gap: 12 }}>
          <AuthLink
            label={isSignUp ? 'Have an account? Sign in' : 'New here? Create an account'}
            onPress={toggleMode}
          />
          {onBack != null && (
            <AuthLink
              label="Back to options"
              onPress={() => {
                clearError();
                onBack();
              }}
            />
          )}
        </View>
      }>
      <AuthField
        label="Email"
        value={email}
        onChangeText={(t) => {
          clearError();
          setEmail(t);
        }}
        onBlur={() => markTouched('email')}
        error={emailError}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <AuthField
        label="Password"
        inputRef={passwordRef}
        value={password}
        onChangeText={(t) => {
          clearError();
          setPassword(t);
        }}
        onBlur={() => markTouched('password')}
        error={passwordError}
        placeholder={isSignUp ? 'At least 6 characters' : 'Your password'}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />

      {errorMessage != null && <AuthNote message={errorMessage} tone="error" />}
      {pendingMessage != null && <AuthNote message={pendingMessage} tone="info" />}

      <AuthButton
        label={isSignUp ? 'Create account' : 'Sign in'}
        onPress={submit}
        busy={busy}
        disabled={!canSubmit}
      />
    </AuthShell>
  );
}

export default AuthScreen;
