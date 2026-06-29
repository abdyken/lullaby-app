/**
 * Shared building blocks for the auth + setup surfaces.
 *
 * These screens are the ONLY full-screen surfaces outside the tab shell, so they
 * carry their own cream scaffold (the sacred background, §6) and keyboard
 * handling. Visual language matches the rest of the app: cream bg, white rounded
 * cards/inputs, warm shadow, Fredoka headline / Nunito body. Deliberately quiet
 * — never a marketing wall.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

/** A labeled text input in the app's surface style. */
export function AuthField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = 'none',
  secureTextEntry,
  autoComplete,
  textContentType,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  autoCapitalize?: 'none' | 'words' | 'sentences';
  secureTextEntry?: boolean;
  autoComplete?: 'email' | 'password' | 'name' | 'off';
  textContentType?: 'emailAddress' | 'password' | 'name' | 'none';
  maxLength?: number;
}) {
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
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        autoComplete={autoComplete}
        textContentType={textContentType}
        maxLength={maxLength}
        style={{
          fontFamily: fonts.body,
          fontSize: 15,
          color: colors.ink,
          backgroundColor: colors.surface,
          borderRadius: radii.small,
          borderWidth: 1,
          borderColor: colors.line,
          paddingHorizontal: 14,
          paddingVertical: 13,
        }}
      />
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => ({
        borderRadius: radii.pill,
        transform: [{ scale: pressed && !inactive ? 0.98 : 1 }],
      })}>
      {/* Solid fill lives on an inner View — paints reliably on Android. */}
      <View
        style={{
          minHeight: 50,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: accentColor,
          borderRadius: radii.pill,
          paddingHorizontal: 24,
          opacity: inactive ? 0.55 : 1,
          ...shadows.card,
        }}>
        {busy ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 15,
              letterSpacing: 0.2,
              color: colors.white,
            }}>
            {label}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/** Low-emphasis text link (toggle sign-in/up, sign out, etc). */
export function AuthLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: 'center' })}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.sleep }}>{label}</Text>
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
