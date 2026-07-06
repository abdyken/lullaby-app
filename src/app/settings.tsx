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
import { Linking, Platform, Pressable, ScrollView, StatusBar, Switch, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  buildSupportMailtoUrl,
  resolvePrivacyPolicyUrl,
  resolveSupportEmail,
  resolveTermsUrl,
} from '@/lib/appLinks';
import { SettingsProCard } from '@/components/pro/SettingsProCard';
import { getProMode } from '@/lib/proConfig';
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

function ExternalGlyph({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 6h9v9M18 6 6.5 17.5"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * A tappable external-destination row inside a SettingsCard: label (+ optional
 * subtitle) on the left, an outward arrow on the right.
 */
function LinkRow({
  palette,
  label,
  subtitle,
  onPress,
}: {
  palette: SurfacePalette;
  label: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        opacity: pressed ? 0.6 : 1,
      })}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: palette.ink }}>{label}</Text>
        {subtitle ? (
          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: palette.inkFaint, marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <ExternalGlyph color={palette.inkFaint} />
    </Pressable>
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
  const { session, caregiver, signOut, goToAccountEntry, deleteAccount, busy } = useAuth();
  const palette = surfaces[mode];
  const isNight = mode === 'night';

  const email = session?.user.email ?? null;
  const signedIn = session != null;
  const configured = isSupabaseConfigured;

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const buildNumber = Constants.nativeBuildVersion ?? null;
  const statusBarInset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const topInset = Math.max(insets.top, statusBarInset);

  // Legal/support destinations — env-configurable with safe placeholder
  // fallbacks (src/lib/appLinks.ts), so these rows always have somewhere to go.
  const privacyUrl = resolvePrivacyPolicyUrl();
  const termsUrl = resolveTermsUrl();
  const supportEmail = resolveSupportEmail();

  // When a device can't open a destination (no browser / no mail app), show a
  // calm inline note with the address instead of failing silently or crashing.
  const [legalNotice, setLegalNotice] = useState<string | null>(null);
  const [supportNotice, setSupportNotice] = useState<string | null>(null);
  const openExternal = async (url: string, onFail: () => void) => {
    try {
      await Linking.openURL(url);
    } catch {
      onFail();
    }
  };
  const handleOpenLegal = (url: string) => {
    setLegalNotice(null);
    void openExternal(url, () => setLegalNotice(`Couldn’t open the link. You can visit ${url} in your browser.`));
  };
  const handleContactSupport = () => {
    setSupportNotice(null);
    void openExternal(buildSupportMailtoUrl({ email: supportEmail, appVersion }), () =>
      setSupportNotice(`Couldn’t open your mail app. You can write to us at ${supportEmail}.`),
    );
  };

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

  // Delete account (Apple 5.1.1(v)) — a two-step, in-place confirm: the row
  // arms an inline confirm block (no accidental one-tap deletion), and the
  // confirm awaits the server result before leaving the screen, so a failure
  // stays visible here with a manual fallback instead of silently vanishing.
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const handleDeleteAccount = async () => {
    setDeleteNotice(null);
    const deleted = await deleteAccount();
    if (deleted) {
      // The account is gone and AuthGate already swapped the surface under this
      // screen — pop back to land on it (same order rationale as sign out).
      router.back();
      return;
    }
    setDeleteConfirming(false);
    setDeleteNotice(
      `Couldn’t delete your account just now. Please try again, or email ${supportEmail} and we’ll remove it for you.`,
    );
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
        <View style={{ marginTop: 18 }}>
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                  accessibilityState={{ busy }}
                  onPress={handleSignOut}
                  disabled={busy}
                  style={({ pressed }) => ({
                    marginTop: 18,
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
                      marginTop: 18,
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
                    Accounts are not set up in this build yet. Your baby and logs stay on this
                    phone.
                  </Text>
                )}
              </>
            )}
          </SettingsCard>
        </View>

        {/* ---- Lullaby Pro ---- */}
        {/* Pro STATUS on the root /settings screen. /settings sits OUTSIDE the
            tabs ProProvider, so SettingsProCard reads entitlement via the
            read-only useProStatusStandalone hook (never usePro — that would throw
            here) and never purchases/restores/opens a paywall; its "upgrade"
            affordance routes back into the tabs tree where those live. Signed-in
            only (guests have no Pro); hidden entirely when Pro is off. */}
        {getProMode() !== 'off' && signedIn ? (
          <View style={{ marginTop: 18 }}>
            <SectionLabel palette={palette}>Lullaby Pro</SectionLabel>
            <SettingsProCard />
          </View>
        ) : null}

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
            <View style={{ height: 1, backgroundColor: palette.line, marginTop: 12 }} />
            <LinkRow palette={palette} label="Privacy Policy" onPress={() => handleOpenLegal(privacyUrl)} />
            <View style={{ height: 1, backgroundColor: palette.line }} />
            <LinkRow palette={palette} label="Terms of Use" onPress={() => handleOpenLegal(termsUrl)} />
            {legalNotice && (
              <Text style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: palette.inkFaint }}>
                {legalNotice}
              </Text>
            )}
          </SettingsCard>
        </View>

        {/* ---- Support ---- */}
        <View style={{ marginTop: 18 }}>
          <SectionLabel palette={palette}>Support</SectionLabel>
          <SettingsCard palette={palette}>
            <LinkRow
              palette={palette}
              label="Contact support"
              subtitle={supportEmail}
              onPress={handleContactSupport}
            />
            {supportNotice && (
              <Text style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: palette.inkFaint }}>
                {supportNotice}
              </Text>
            )}
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: 12,
                lineHeight: 18,
                color: palette.inkFaint,
                marginTop: 6,
              }}>
              Questions, a bug, or an idea for a calmer night — we read every note.
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
                {buildNumber ? `${appVersion} (${buildNumber})` : appVersion}
              </Text>
            </View>
            <View style={{ height: 1, backgroundColor: palette.line, marginVertical: 12 }} />
            <Text style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: palette.inkFaint }}>
              Lullaby offers general supportive information for tonight — not medical advice,
              never a diagnosis.
            </Text>
          </SettingsCard>
        </View>

        {/* ---- Delete account ---- */}
        {/* The irreversible action lives in its OWN card, apart from Sign out and
            set lower on the screen (a calm "danger zone", not a loud red banner):
            structurally separated so it never reads as a sibling of Sign out.
            Signed-in only; the two-step confirm + wipe order are unchanged. */}
        {signedIn ? (
          <View style={{ marginTop: 28 }}>
            <SettingsCard palette={palette}>
              {deleteConfirming ? (
                <View>
                  <Text
                    style={{
                      fontFamily: fonts.body,
                      fontSize: 12,
                      lineHeight: 18,
                      color: palette.inkSoft,
                    }}>
                    This permanently deletes your online account and erases this baby{'’'}s
                    profile and every log from this phone. If you created your baby{'’'}s
                    profile, it and its shared history are removed for all caregivers too. This
                    can{'’'}t be undone.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Permanently delete account"
                    accessibilityState={{ busy }}
                    onPress={() => void handleDeleteAccount()}
                    disabled={busy}
                    style={({ pressed }) => ({
                      marginTop: 14,
                      minHeight: 48,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: radii.medium,
                      backgroundColor: colors.alertTint,
                      opacity: pressed || busy ? 0.6 : 1,
                    })}>
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.alert }}>
                      {busy ? 'Deleting…' : 'Permanently delete account'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Keep my account"
                    onPress={() => setDeleteConfirming(false)}
                    disabled={busy}
                    style={({ pressed }) => ({
                      marginTop: 8,
                      minHeight: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.6 : 1,
                    })}>
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: palette.inkSoft }}>
                      Keep my account
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete account"
                  onPress={() => {
                    setDeleteNotice(null);
                    setDeleteConfirming(true);
                  }}
                  disabled={busy}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    justifyContent: 'center',
                    opacity: pressed ? 0.6 : 1,
                  })}>
                  <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.alert }}>
                    Delete account
                  </Text>
                </Pressable>
              )}
              {deleteNotice && (
                <Text
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 12,
                    lineHeight: 18,
                    color: palette.inkFaint,
                    marginTop: 12,
                  }}>
                  {deleteNotice}
                </Text>
              )}
            </SettingsCard>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}
