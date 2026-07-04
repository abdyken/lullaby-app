/**
 * PaywallSheet — the Lullaby Pro paywall (Phase 4: real packages).
 *
 * A calm bottom-sheet modal in the existing Lullaby language (modelled on
 * LogSheet). It reads the purchase surface from usePro() and renders one of a few
 * calm states:
 *   unconfigured → "Subscriptions are not configured in this build yet."
 *   loading      → "Loading subscription options…"
 *   ready        → the real subscription packages (store-localized price strings)
 *   unavailable  → "Subscription options aren't available right now."
 * If Pro is already active it shows a calm success state instead.
 *
 * It NEVER hardcodes a price (every price is the store's own `priceString`), never
 * imports the subscription SDK, and carries no external payment link or web
 * payment flow. Purchase / restore run through usePro(); this file is presentational.
 */
import { Linking, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { resolvePrivacyPolicyUrl, resolveTermsUrl } from '@/lib/appLinks';
import { usePro } from '@/state/ProProvider';
import { colors, fonts, radii, shadows } from '@/theme';

import type { ProPackageView } from '@/lib/revenueCat';

const TITLE = 'Lullaby Pro';
const SUBTITLE = 'Fuller history, gentle weekly recaps, and export-ready summaries. Coming later.';

const BENEFITS = [
  'Fuller history',
  'Gentle weekly recaps',
  'Export-ready summaries',
];

// Calm per-state copy.
const UNAVAILABLE = 'Subscriptions are not configured in this build yet.';
const LOADING = 'Loading subscription options…';
const NO_PACKAGES = 'Subscription options aren’t available right now.';
const ACTIVE = 'You’re all set — Lullaby Pro is active.';

const RESTORE_LABEL = 'Restore purchase';
const RESTORE_NOTE = 'Restore recovers a subscription you already purchased.';

// Required safety copy — descriptive, non-medical, store-managed billing.
const NOT_MEDICAL = 'Not medical advice.';
const STORE_MANAGED = 'Subscriptions are billed through your App Store / Play Store account.';
const STORE_MANAGE = 'Cancel or manage anytime in your store account settings.';

// App Store / Play review-safe legal links. Labels only — the destinations come
// from appLinks (env EXPO_PUBLIC_TERMS_URL / EXPO_PUBLIC_PRIVACY_POLICY_URL with
// safe fallbacks), so no URL is ever hardcoded in this file.
const TERMS_LABEL = 'Terms of Use';
const PRIVACY_LABEL = 'Privacy Policy';

/**
 * Open a legal link. Single, crash-safe openURL site (mirrors settings.tsx): a
 * missing browser or a bad env value must never crash the paywall — it degrades
 * to a no-op instead.
 */
function openLegalLink(url: string): void {
  try {
    void Linking.openURL(url).catch(() => {
      // Calm: opening a link should never surface an error on the paywall.
    });
  } catch {
    // Calm: never let a link tap crash the paywall.
  }
}

/** A friendly plan name from the RevenueCat package type (falls back to title). */
function planLabel(pkg: ProPackageView): string {
  switch (pkg.packageType) {
    case 'ANNUAL':
      return 'Yearly';
    case 'MONTHLY':
      return 'Monthly';
    case 'WEEKLY':
      return 'Weekly';
    case 'LIFETIME':
      return 'Lifetime';
    default:
      return pkg.title;
  }
}

function BenefitRow({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.feed, marginTop: 7 }} />
      <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, color: colors.inkSoft }}>
        {text}
      </Text>
    </View>
  );
}

/** A calm one-line notice box (unavailable / sign-in / loading / no packages). */
function NoticeBox({ text }: { text: string }) {
  return (
    <View
      style={{
        marginTop: 16,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: radii.medium,
        backgroundColor: colors.surfaceSoft,
        borderWidth: 1,
        borderColor: colors.line,
      }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, lineHeight: 18, color: colors.inkSoft }}>
        {text}
      </Text>
    </View>
  );
}

/** One purchasable package row — plan name + the store's own price string. */
function PackageButton({
  pkg,
  disabled,
  onPress,
}: {
  pkg: ProPackageView;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={planLabel(pkg) + ' ' + pkg.priceString}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 54,
        paddingHorizontal: 16,
        borderRadius: radii.medium,
        backgroundColor: colors.sleepTint,
        borderWidth: 2,
        borderColor: colors.sleep,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.sleep }}>{planLabel(pkg)}</Text>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.sleep }}>{pkg.priceString}</Text>
    </Pressable>
  );
}

export function PaywallSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const {
    isPro,
    paywallStatus,
    packages,
    isPurchasing,
    isRestoring,
    purchaseError,
    restoreError,
    purchasePackage,
    restorePurchases,
  } = usePro();

  const showBadge = !isPro && paywallStatus !== 'ready';
  // Restore is ALWAYS reachable (Apple review 3.1.1) — the button is only disabled
  // while a restore is in flight. `canRestore` drives the helper copy: when the
  // store is configured (signed-in or guest) we show the store-manage line,
  // otherwise a calm hint. ProProvider.restorePurchases() safely no-ops when
  // RevenueCat is unconfigured, so tapping it in any state never crashes.
  const canRestore = paywallStatus === 'ready' || paywallStatus === 'unavailable';

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Scrim: soft ink dim, tap-outside to dismiss. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(46,42,64,0.35)' }}
        />

        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radii.large,
            borderTopRightRadius: radii.large,
            paddingTop: 10,
            paddingHorizontal: 18,
            paddingBottom: insets.bottom + 18,
            ...shadows.soft,
          }}>
          {/* grab handle */}
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.line,
              marginBottom: 14,
            }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              style={{
                fontFamily: fonts.bodyBold,
                fontSize: 10,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                color: colors.sleep,
              }}>
              Lullaby Pro
            </Text>
            {showBadge ? (
              <View
                style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: colors.sleepTint }}>
                <Text
                  style={{
                    fontFamily: fonts.bodyBold,
                    fontSize: 9.5,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: colors.sleep,
                  }}>
                  Soon
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.ink, marginTop: 6 }}>{TITLE}</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.inkSoft, marginTop: 4 }}>
            {SUBTITLE}
          </Text>

          <View style={{ gap: 10, marginTop: 16 }}>
            {BENEFITS.map((text) => (
              <BenefitRow key={text} text={text} />
            ))}
          </View>

          {/* Body — success, packages, or a calm notice, by state. */}
          {isPro ? (
            <NoticeBox text={ACTIVE} />
          ) : paywallStatus === 'ready' ? (
            <View style={{ gap: 10, marginTop: 16 }}>
              {packages.map((pkg) => (
                <PackageButton
                  key={pkg.id}
                  pkg={pkg}
                  disabled={isPurchasing}
                  onPress={() => void purchasePackage(pkg)}
                />
              ))}
              {isPurchasing ? (
                <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.inkFaint, textAlign: 'center' }}>
                  Processing…
                </Text>
              ) : null}
              {purchaseError ? (
                <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.feed, textAlign: 'center' }}>
                  {purchaseError}
                </Text>
              ) : null}
            </View>
          ) : paywallStatus === 'loading' ? (
            <NoticeBox text={LOADING} />
          ) : paywallStatus === 'unavailable' ? (
            <NoticeBox text={NO_PACKAGES} />
          ) : (
            <NoticeBox text={UNAVAILABLE} />
          )}

          {/* Restore — real whenever RevenueCat is configured; calm stub otherwise. */}
          {!isPro ? (
            <View style={{ marginTop: 14 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isRestoring }}
                accessibilityLabel={RESTORE_LABEL}
                disabled={isRestoring}
                onPress={() => void restorePurchases()}
                style={({ pressed }) => ({
                  minHeight: 46,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radii.medium,
                  backgroundColor: colors.surfaceSoft,
                  borderWidth: 1,
                  borderColor: colors.line,
                  opacity: isRestoring ? 0.55 : pressed ? 0.8 : 1,
                })}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.sleep }}>
                  {isRestoring ? 'Restoring…' : RESTORE_LABEL}
                </Text>
              </Pressable>
              <Text
                style={{
                  fontFamily: fonts.body,
                  fontSize: 11.5,
                  lineHeight: 16,
                  color: colors.inkFaint,
                  marginTop: 6,
                  textAlign: 'center',
                }}>
                {restoreError ?? (canRestore ? STORE_MANAGE : RESTORE_NOTE)}
              </Text>
            </View>
          ) : null}

          {/* Safety copy — descriptive, non-medical, store-managed billing. */}
          <View style={{ marginTop: 14, gap: 3 }}>
            <Text style={{ fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16, color: colors.inkFaint }}>
              {NOT_MEDICAL}
            </Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16, color: colors.inkFaint }}>
              {STORE_MANAGED}
            </Text>
          </View>

          {/* Terms + Privacy — always visible, in every paywall state (required
              for App Store / Play review, especially when Pro is live). */}
          <View style={{ marginTop: 12, flexDirection: 'row', gap: 18 }}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={TERMS_LABEL}
              onPress={() => openLegalLink(resolveTermsUrl())}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Text
                style={{
                  fontFamily: fonts.body,
                  fontSize: 11.5,
                  color: colors.sleep,
                  textDecorationLine: 'underline',
                }}>
                {TERMS_LABEL}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={PRIVACY_LABEL}
              onPress={() => openLegalLink(resolvePrivacyPolicyUrl())}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Text
                style={{
                  fontFamily: fonts.body,
                  fontSize: 11.5,
                  color: colors.sleep,
                  textDecorationLine: 'underline',
                }}>
                {PRIVACY_LABEL}
              </Text>
            </Pressable>
          </View>

          <View style={{ marginTop: 18, alignItems: 'center' }}>
            <PrimaryActionButton label="Close" accentColor={colors.sleep} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default PaywallSheet;
