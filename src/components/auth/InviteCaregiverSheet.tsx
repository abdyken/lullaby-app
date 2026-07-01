/**
 * InviteCaregiverSheet — mint a code to invite a second caregiver to this baby.
 *
 * Calm and private: pick who you're inviting (role hint), create a short code,
 * and share it. No contacts, no email plumbing, no family-management surface.
 * Reachable only from the AccountSheet in Supabase 'ready' mode.
 *
 * On open it reuses an existing open invite (so reopening doesn't spawn codes);
 * "Create a new code" mints a fresh one. Sharing uses React Native's built-in
 * Share (Expo-safe, no dependency); the code is always shown for reading aloud.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BabyInvite, CaregiverRole } from '@/data/models';
import { useAnalytics } from '@/lib/useAnalytics';
import { hapticSuccess } from '@/lib/haptics';
import { useAuth } from '@/state/AuthProvider';
import { createInvite, formatInviteCode, getActiveInvites } from '@/sync';
import { colors, fonts, radii, shadows } from '@/theme';

import { AuthButton } from './AuthShell';
import { buildInviteShareMessage, resolveAppInstallUrl } from './inviteShareMessage';

const ROLES: { role: CaregiverRole; label: string; color: string }[] = [
  { role: 'mom', label: 'Mom', color: colors.mom },
  { role: 'dad', label: 'Dad', color: colors.dad },
  { role: 'other', label: 'Other', color: colors.diaper },
];

export function InviteCaregiverSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { baby } = useAuth();
  const track = useAnalytics();
  const [role, setRole] = useState<CaregiverRole>('dad');
  const [invite, setInvite] = useState<BabyInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reuse an already-open invite if one exists, so reopening doesn't pile up codes.
  useEffect(() => {
    let active = true;
    if (!baby) return;
    void getActiveInvites(baby.id).then((invites) => {
      if (active && invites.length > 0) {
        setInvite(invites[0]);
        setRole(invites[0].roleHint);
      }
    });
    return () => {
      active = false;
    };
  }, [baby]);

  const create = async () => {
    if (!baby) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createInvite(baby.id, role);
      if (created) {
        hapticSuccess();
        setInvite(created);
        // No props: role (mom/dad/other) is intentionally not sent — analytics
        // carry only coarse counts and UI source/surface, never family detail.
        track('caregiver_invited');
      }
    } catch (e) {
      setError(
        e && typeof e === 'object' && 'message' in e && typeof e.message === 'string'
          ? e.message
          : 'Could not create an invite code. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!invite) return;
    const pretty = formatInviteCode(invite.code);
    try {
      await Share.share({
        message: buildInviteShareMessage({ code: pretty, installUrl: resolveAppInstallUrl() }),
      });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
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

          <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.ink }}>
            Invite a caregiver
          </Text>
          <Text
            style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.inkSoft, marginTop: 4 }}>
            Share a code with your partner or caregiver so you both keep the same night log.
          </Text>

          {/* Role hint */}
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 10,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: colors.inkSoft,
              marginTop: 16,
              marginBottom: 6,
            }}>
            They are
          </Text>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            {ROLES.map((opt) => {
              const active = opt.role === role;
              return (
                <Pressable
                  key={opt.role}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={opt.label}
                  onPress={() => setRole(opt.role)}
                  style={{ flex: 1 }}>
                  {({ pressed }) => (
                    // The painted surface lives on this inner View, never on the
                    // Pressable itself: on real Android the Pressable's own
                    // background/border can fail to repaint after the selection
                    // changes, making the chips look like they vanish. The 2px
                    // border is present in both states so selecting a role never
                    // shifts the row's layout, and every option always renders.
                    <View
                      style={{
                        minHeight: 46,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: radii.medium,
                        backgroundColor: active ? opt.color : colors.surfaceSoft,
                        borderWidth: 2,
                        borderColor: active ? opt.color : colors.line,
                        opacity: pressed ? 0.85 : 1,
                      }}>
                      <Text
                        style={{
                          fontFamily: fonts.bodyBold,
                          fontSize: 14,
                          color: active ? colors.white : colors.inkSoft,
                        }}>
                        {opt.label}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Code display, once created */}
          {invite != null && (
            <View
              style={{
                marginTop: 18,
                backgroundColor: colors.surfaceSoft,
                borderRadius: radii.medium,
                borderWidth: 1,
                borderColor: colors.line,
                paddingVertical: 16,
                alignItems: 'center',
              }}>
              <Text
                style={{
                  fontFamily: fonts.display,
                  fontSize: 28,
                  letterSpacing: 3,
                  color: colors.ink,
                }}>
                {formatInviteCode(invite.code)}
              </Text>
              <Text
                style={{ fontFamily: fonts.body, fontSize: 12, color: colors.inkFaint, marginTop: 6 }}>
                Share this code with your caregiver. It expires in 7 days.
              </Text>
            </View>
          )}

          {error != null && (
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: 13,
                color: colors.feed,
                textAlign: 'center',
                marginTop: 14,
              }}>
              {error}
            </Text>
          )}

          <View style={{ marginTop: 18, gap: 10 }}>
            {invite == null ? (
              <AuthButton label="Create invite code" onPress={() => void create()} busy={busy} />
            ) : (
              <>
                <AuthButton label="Share code" onPress={() => void share()} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Create a new code"
                  onPress={() => void create()}
                  disabled={busy}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    alignSelf: 'center',
                    paddingVertical: 8,
                    opacity: pressed || busy ? 0.5 : 1,
                  })}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.sleep }}>
                    Create a new code
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default InviteCaregiverSheet;
