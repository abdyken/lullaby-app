/**
 * AuthScreen — the calm sign-in / sign-up surface for configured builds with no
 * session. Email + password is the simplest reliable path for a native app (no
 * deep-link/OAuth redirect plumbing). One screen toggles between the two modes.
 *
 * Copy is careful: this is about your account, not partner sync. We do not
 * promise shared/realtime caregiving here — that comes after a baby is set up
 * and is still single-caregiver until the realtime + invite slices land.
 */
import { useState } from 'react';

import { useAuth } from '@/state/AuthProvider';

import { AuthButton, AuthField, AuthLink, AuthNote, AuthShell } from './AuthShell';

/** Minimal client-side gate so we don't fire obviously-invalid requests. */
function isValid(email: string, password: string): boolean {
  return email.includes('@') && email.trim().length >= 3 && password.length >= 6;
}

export function AuthScreen() {
  const { signIn, signUp, busy, errorMessage, pendingMessage, clearError } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const isSignUp = mode === 'signUp';
  const canSubmit = isValid(email, password) && !busy;

  const submit = () => {
    if (!canSubmit) return;
    if (isSignUp) void signUp(email, password);
    else void signIn(email, password);
  };

  const toggleMode = () => {
    clearError();
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
        <AuthLink
          label={isSignUp ? 'Have an account? Sign in' : 'New here? Create an account'}
          onPress={toggleMode}
        />
      }>
      <AuthField
        label="Email"
        value={email}
        onChangeText={(t) => {
          clearError();
          setEmail(t);
        }}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <AuthField
        label="Password"
        value={password}
        onChangeText={(t) => {
          clearError();
          setPassword(t);
        }}
        placeholder="At least 6 characters"
        secureTextEntry
        autoComplete="password"
        textContentType="password"
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
