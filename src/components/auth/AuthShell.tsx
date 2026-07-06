/**
 * Shared building blocks for the auth + setup surfaces.
 *
 * These screens are the ONLY full-screen surfaces outside the tab shell, so they
 * carry their own cream scaffold (the sacred background, §6) and keyboard
 * handling. Visual language matches the rest of the app: cream bg, white rounded
 * cards/inputs, warm shadow, Fredoka headline / Nunito body. Deliberately quiet
 * — never a marketing wall.
 */
import type { ReactNode, Ref } from 'react';
import { useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePressScale } from '@/lib/usePressScale';
import { colors, fonts, radii, shadows } from '@/theme';

/**
 * The cream, keyboard-aware full-screen surface shared by the auth + setup
 * screens. `OnboardingStepLayout` builds on this same scaffold instead of
 * duplicating a parallel cream background (roadmap §13).
 */
export function AuthSurface({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.cream }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  );
}

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <AuthSurface>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 22,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 11,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: colors.sleep,
          }}>
          {eyebrow}
        </Text>
        <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink, marginTop: 6 }}>
          {title}
        </Text>
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 14,
            lineHeight: 20,
            color: colors.inkSoft,
            marginTop: 4,
          }}>
          {subtitle}
        </Text>

        <View style={{ marginTop: 22, gap: 14 }}>{children}</View>

        {footer != null && <View style={{ marginTop: 18 }}>{footer}</View>}
      </ScrollView>
    </AuthSurface>
  );
}

/**
 * A labeled text input in the app's surface style.
 *
 * The keyboard/validation props (`onBlur`, `error`, `returnKeyType`,
 * `submitBehavior`, `onSubmitEditing`, `inputRef`) are all optional and
 * backward-compatible, so the setup/join screens that use this field are
 * unaffected. When `error` is set, the border turns warm (terracotta) and a
 * calm hint renders below the field.
 */
export function AuthField({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  keyboardType,
  autoCapitalize = 'none',
  secureTextEntry,
  autoComplete,
  textContentType,
  maxLength,
  error,
  returnKeyType,
  submitBehavior,
  onSubmitEditing,
  inputRef,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  autoCapitalize?: 'none' | 'words' | 'sentences';
  secureTextEntry?: boolean;
  autoComplete?: 'email' | 'password' | 'name' | 'off';
  textContentType?: 'emailAddress' | 'password' | 'name' | 'none';
  maxLength?: number;
  /** A calm validation/error hint; also warms the border when present. */
  error?: string | null;
  returnKeyType?: 'next' | 'go' | 'done' | 'send';
  submitBehavior?: 'submit' | 'blurAndSubmit';
  onSubmitEditing?: () => void;
  /** Lets a parent advance focus to this field (e.g. email → password). */
  inputRef?: Ref<TextInput>;
}) {
  const hasError = error != null && error.length > 0;
  // A calm focus ring: the indigo accent on focus, warm terracotta on error.
  // Border width stays constant across states so the field never shifts layout.
  const [focused, setFocused] = useState(false);
  const borderColor = hasError ? colors.feed : focused ? colors.sleep : colors.line;
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
        {label}
      </Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        autoComplete={autoComplete}
        textContentType={textContentType}
        maxLength={maxLength}
        returnKeyType={returnKeyType}
        submitBehavior={submitBehavior}
        onSubmitEditing={onSubmitEditing}
        style={{
          fontFamily: fonts.body,
          fontSize: 15,
          color: colors.ink,
          backgroundColor: colors.surface,
          borderRadius: radii.small,
          borderWidth: 1.5,
          borderColor,
          minHeight: 52,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      />
      {hasError && (
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 12,
            lineHeight: 16,
            color: colors.feed,
            marginTop: 6,
          }}>
          {error}
        </Text>
      )}
    </View>
  );
}

/** Primary full-width button with a busy spinner + disabled state. */
export function AuthButton({
  label,
  onPress,
  busy,
  disabled,
  accentColor = colors.sleep,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  accentColor?: string;
}) {
  const inactive = busy || disabled;
  // A disabled CTA reads as a calm, intentionally-quiet pill (soft lavender fill,
  // faint label, no lift) — never a washed-out version of the live button.
  const isDisabled = disabled && !busy;
  // Settled scale-0.96 press-down (spring, no overshoot); Reduce Motion ON → no
  // scale, opacity 0.86 press instead. Never presses while busy/disabled.
  const press = usePressScale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      onPress={onPress}
      onPressIn={inactive ? undefined : press.onPressIn}
      onPressOut={inactive ? undefined : press.onPressOut}
      disabled={inactive}
      style={({ pressed }) => ({
        borderRadius: radii.pill,
        // Reduce Motion fallback: opacity 0.86 press (no scale animation).
        opacity: !press.animate && pressed && !inactive ? 0.86 : 1,
      })}>
      {/* Solid fill lives on an inner View — paints reliably on Android. The
          scale press-down rides this inner pill (transform only → no reflow). */}
      <Animated.View
        style={{
          minHeight: 52,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDisabled ? colors.sleepTint : accentColor,
          borderRadius: radii.pill,
          paddingHorizontal: 24,
          // Lift only when the button is live, so a disabled CTA sits flat (calm).
          ...(isDisabled ? null : shadows.card),
          ...(inactive ? null : press.transformStyle),
        }}>
        {busy ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 15,
              letterSpacing: 0.2,
              color: isDisabled ? colors.inkFaint : colors.white,
            }}>
            {label}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

/**
 * Low-emphasis text link. `tone` sets the hierarchy so a column of secondary
 * actions never reads as a noisy stack of equal-weight purple links:
 *   'accent' (default) → the one meaningful secondary (indigo, bold)
 *   'quiet'            → a calm tertiary action like "Back" (soft ink, regular)
 * `align` lets a link sit inline-right (e.g. "Forgot password?") instead of centered.
 */
export function AuthLink({
  label,
  onPress,
  tone = 'accent',
  align = 'center',
}: {
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'quiet';
  align?: 'center' | 'end';
}) {
  const quiet = tone === 'quiet';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        opacity: pressed ? 0.6 : 1,
        alignSelf: align === 'end' ? 'flex-end' : 'center',
      })}>
      <Text
        style={{
          fontFamily: quiet ? fonts.body : fonts.bodyBold,
          fontSize: 13,
          color: quiet ? colors.inkSoft : colors.sleep,
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Calm inline message — error (terracotta) or neutral note (soft ink). */
export function AuthNote({ message, tone }: { message: string; tone: 'error' | 'info' }) {
  return (
    <Text
      style={{
        fontFamily: fonts.body,
        fontSize: 13,
        lineHeight: 19,
        color: tone === 'error' ? colors.feed : colors.inkSoft,
        textAlign: 'center',
      }}>
      {message}
    </Text>
  );
}
