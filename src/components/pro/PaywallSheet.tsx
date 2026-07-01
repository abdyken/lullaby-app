/**
 * PaywallSheet — Phase 2 paywall UI SKELETON.
 *
 * A calm bottom-sheet modal in the existing Lullaby language (cream surface, soft
 * shadow, rounded, theme tokens) modelled on src/components/LogSheet.tsx. It is
 * intentionally NOT a live paywall: no subscription provider is wired yet, so it
 * shows a calm "not configured in this build yet" state and never presents a
 * purchase or a working restore. It claims nothing about pricing or availability.
 *
 * Deliberately absent (Phase 3+ / later phases):
 *   - no purchase package list, no prices (pricing lives only in the docs)
 *   - no restore that pretends to work — the restore control is disabled
 *   - no subscription SDK, no StoreKit / Play Billing, no external payment links
 *
 * Presentational only: it fires no analytics (the entry points that open it own
 * the paywall_opened / pro_gate_seen events) and reads no auth/network state, so
 * it is safe to portal above everything from ProPaywallHost.
 */
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts, radii, shadows } from '@/theme';

const TITLE = 'Lullaby Pro';
const SUBTITLE = 'Keep and share the week, without losing the calm.';

const BENEFITS = [
  'Weekly export you can keep',
  'Clean summary to share with your pediatrician',
  'Full-week recap in one place',
];

// Honest Phase-2 state: nothing is purchasable yet.
const UNAVAILABLE = 'Subscriptions are not configured in this build yet.';
const RESTORE_LABEL = 'Restore purchase';
const RESTORE_NOTE = 'Restore will be available when subscriptions are configured.';

// Required safety copy — descriptive, non-medical, and store-managed billing.
const NOT_MEDICAL = 'Not medical advice.';
const STORE_MANAGED = 'Subscriptions will be managed through the App Store / Play Store when enabled.';

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

export function PaywallSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Scrim: soft ink dim, tap-outside to dismiss. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(46,42,64,0.35)',
          }}
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
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: radii.pill,
                backgroundColor: colors.sleepTint,
              }}>
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
          </View>

          <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.ink, marginTop: 6 }}>{TITLE}</Text>
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 13.5,
              lineHeight: 19,
              color: colors.inkSoft,
              marginTop: 4,
            }}>
            {SUBTITLE}
          </Text>

          <View style={{ gap: 10, marginTop: 16 }}>
            {BENEFITS.map((text) => (
              <BenefitRow key={text} text={text} />
            ))}
          </View>

          {/* Calm unavailable state — nothing to purchase in this build yet. */}
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
              {UNAVAILABLE}
            </Text>
          </View>

          {/* Restore is a calm, disabled stub — it must not pretend to work yet. */}
          <View style={{ marginTop: 14 }}>
            <View
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              accessibilityLabel={RESTORE_LABEL}
              style={{
                minHeight: 46,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radii.medium,
                backgroundColor: colors.surfaceSoft,
                borderWidth: 1,
                borderColor: colors.line,
                opacity: 0.55,
              }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.inkFaint }}>
                {RESTORE_LABEL}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: 11.5,
                lineHeight: 16,
                color: colors.inkFaint,
                marginTop: 6,
                textAlign: 'center',
              }}>
              {RESTORE_NOTE}
            </Text>
          </View>

          {/* Safety copy — descriptive, non-medical, store-managed billing. */}
          <View style={{ marginTop: 14, gap: 3 }}>
            <Text style={{ fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16, color: colors.inkFaint }}>
              {NOT_MEDICAL}
            </Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16, color: colors.inkFaint }}>
              {STORE_MANAGED}
            </Text>
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
