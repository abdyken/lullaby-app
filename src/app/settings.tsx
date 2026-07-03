/**
 * Settings — the dedicated account/settings screen, pushed over the tab shell
 * from the Tonight header's account button (no fifth tab; the floating pill
 * stays a four-tab bar). The quick AccountSheet stays available behind the baby
 * header tap; this screen is the full, always-reachable settings home.
 *
 * Lives at the ROOT stack (sibling of "(tabs)"), so it only relies on the root
 * providers: AuthProvider + ThemeProvider. It deliberately does NOT render the
 * Pro upgrade card (ProProvider is mounted inside the tab shell).
 */
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StatusBar, Switch, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InviteCaregiverSheet } from '@/components/auth/InviteCaregiverSheet';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/state/AuthProvider';
import { useTheme } from '@/state/ThemeProvider';
import { colors, fonts, radii, shadows, surfaces, type SurfacePalette } from '@/theme';

function BackGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M14.5 5.5 8 12l6.5 6.5" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Card shell — white in day, calm raised navy at night (mirrors TimelineCard). */
function SettingsCard({ palette, children }: { palette: SurfacePalette; children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: palette.card,
        borderRadius: radii.medium,
        borderWidth: 1,
        borderColor: palette.border,
        paddingHorizontal: 16,
        paddingVertical: 14,
        ...shadows.card,
      }}>
      {children}
    </View>
  );
}

function SectionLabel({ palette, children }: { palette: SurfacePalette; children: string }) {
  return (
    <Text
      style={{
        fontFamily: fonts.bodyBold,
        fontSize: 11,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: palette.inkFaint,
        marginBottom: 8,
        marginLeft: 4,
      }}>
      {children}
    </Text>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { mode, isTransitioning, toggleThemeFromPoint } = useTheme();
  const { session, caregiver, signOut, goToAccountEntry, busy } = useAuth();
  const palette = surfaces[mode];
  const isNight = mode === 'night';

  const email = session?.user.email ?? null;
  const signedIn = session != null;
  const configured = isSupabaseConfigured;
  const [inviteOpen, setInviteOpen] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const statusBarInset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const topInset = Math.max(insets.top, statusBarInset);

  // Both account actions land on a surface UNDER this screen (AuthGate swaps the
  // tab shell's content), so pop back first — same order as AccountSheet's
  // onClose-then-navigate.
  const handleSignOut = () => {
    router.back();
    void signOut();
  };
  const handleAccountEntry = () => {
    router.back();
    void goToAccountEntry();
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: palette.bg }}
        contentContainerStyle={{
          paddingTop: topInset + 10,
          paddingHorizontal: 18,
          paddingBottom: insets.bottom + 28,
        }}
        showsVerticalScrollIndicator={false}>
        {/* Header: glass back button (mirrors the header icon buttons) + title. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6, minHeight: 56 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.74)',
              borderWidth: 1,
              borderColor: isNight ? 'transparent' : 'rgba(255,255,255,0.88)',
              transform: [{ scale: pressed ? 0.94 : 1 }],
              ...shadows.card,
              shadowColor: isNight ? 'rgb(0,0,0)' : shadows.card.shadowColor,
            })}>
            <BackGlyph color={colors.sleep} />
          </Pressable>
          <Text style={{ fontFamily: fonts.display, fontSize: 22, color: palette.ink }}>Settings</Text>
        </View>

        {/* ---- Account ---- */}
        <View style={{ marginTop: 16 }}>
          <SectionLabel palette={palette}>Account</SectionLabel>
          <SettingsCard palette={palette}>
            {signedIn ? (
              <>
                <Text style={{ fontFamily: fonts.body, fontSize: 13, color: palette.inkSoft }}>
                  {caregiver?.displayName
                    ? `Signed in as ${caregiver.displayName}${email ? ` · ${email}` : ''}`
                    : email
                      ? `Signed in as ${email}`
                      : 'Signed in'}
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 12,
                    lineHeight: 18,
                    color: palette.inkFaint,
                    marginTop: 6,
                  }}>
                  Your night log is shared with your caregivers on this baby.
                </Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Invite caregiver"
                  onPress={() => setInviteOpen(true)}
                  style={({ pressed }) => ({
                    marginTop: 14,
                    minHeight: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radii.medium,
                    backgroundColor: colors.sleepTint,
                    opacity: pressed ? 0.7 : 1,
                  })}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.sleep }}>
                    Invite caregiver
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                  accessibilityState={{ busy }}
                  onPress={handleSignOut}
                  disabled={busy}
                  style={({ pressed }) => ({
                    marginTop: 10,
                    minHeight: 48,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radii.medium,
                    backgroundColor: isNight ? 'rgba(255,255,255,0.06)' : colors.surfaceSoft,
                    borderWidth: 1,
                    borderColor: palette.line,
                    opacity: pressed || busy ? 0.6 : 1,
                  })}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.feed }}>
                    Sign out
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={{ fontFamily: fonts.body, fontSize: 13, color: palette.inkSoft }}>
                  You{'’'}re local right now — your baby and logs stay safe on this phone.
                </Text>
                {configured ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Create account or sign in"
                    onPress={handleAccountEntry}
                    style={({ pressed }) => ({
                      marginTop: 14,
                      minHeight: 48,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: radii.medium,
                      backgroundColor: colors.sleepTint,
                      opacity: pressed ? 0.7 : 1,
                    })}>
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.sleep }}>
                      Create account or sign in
                    </Text>
                  </Pressable>
                ) : (
                  <Text
                    style={{
                      fontFamily: fonts.body,
                      fontSize: 12,
                      lineHeight: 18,
                      color: palette.inkFaint,
                      marginTop: 8,
                    }}>
                    Account backup and sync turn on once this build is connected to its account
                    service.
                  </Text>
                )}
              </>
            )}
          </SettingsCard>
        </View>

        {/* ---- Appearance ---- */}
        <View style={{ marginTop: 18 }}>
          <SectionLabel palette={palette}>Appearance</SectionLabel>
          <SettingsCard palette={palette}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontFamily: fonts.body, fontSize: 14, color: palette.ink }}>
                  Night mode
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 12,
                    lineHeight: 18,
                    color: palette.inkFaint,
                    marginTop: 2,
                  }}>
                  A low-glare surface for 3am — easy on tired eyes.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Night mode"
                value={isNight}
                disabled={isTransitioning}
                onValueChange={() => {
                  if (isTransitioning) return;
                  void toggleThemeFromPoint();
                }}
                trackColor={{ false: colors.line, true: colors.sleep2 }}
                thumbColor={colors.white}
              />
            </View>
          </SettingsCard>
        </View>

        {/* ---- Privacy & data ---- */}
        <View style={{ marginTop: 18 }}>
          <SectionLabel palette={palette}>Privacy &amp; data</SectionLabel>
          <SettingsCard palette={palette}>
            <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: palette.inkSoft }}>
              Your logs are stored on this phone. Lullaby doesn{'’'}t sell your data or share it
              with anyone.
            </Text>
          </SettingsCard>
        </View>

        {/* ---- About ---- */}
        <View style={{ marginTop: 18 }}>
          <SectionLabel palette={palette}>About</SectionLabel>
          <SettingsCard palette={palette}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: fonts.body, fontSize: 14, color: palette.ink }}>Version</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 13, color: palette.inkFaint }}>
                {appVersion}
              </Text>
            </View>
            <View style={{ height: 1, backgroundColor: palette.line, marginVertical: 12 }} />
            <Text style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: palette.inkFaint }}>
              Lullaby offers general supportive information for tonight — not medical advice,
              never a diagnosis.
            </Text>
          </SettingsCard>
        </View>
      </ScrollView>

      {signedIn && inviteOpen && <InviteCaregiverSheet onClose={() => setInviteOpen(false)} />}
    </>
  );
}
