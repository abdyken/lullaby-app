/**
 * AnswerCard — the bounded answer surface. Renders exactly one of the three
 * router outcomes and then ENDS the interaction:
 *   - topic  → calm indigo header, the three AnswerBlocks, "trust your gut" foot
 *   - oos    → calm header, bounded decline, pediatrician pointer
 *   - triage → red header, "call your pediatrician / emergency number" actions
 * There is deliberately no input inside this card — no follow-ups, no chat.
 *
 * Rise-in entrance (opacity/translateY/scale) matches the demo's `rise`
 * keyframes; skipped entirely under reduce-motion.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { AnswerBlocks } from '@/features/reassure/components/AnswerBlocks';
import { usePediatricianPhone } from '@/features/reassure/application/usePediatricianPhone';
import { clinicalContentVisible } from '@/features/reassure/domain/contentGate';
import { telUrlFor } from '@/features/reassure/domain/pediatricianContact';
import {
  GUIDES,
  KB,
  OOS_COPY,
  TOPIC_DISMISS,
  TOPIC_FOOT,
  TRIAGE_COPY,
} from '@/features/reassure/content/kb';
import type { RouteResult } from '@/features/reassure/domain/types';
import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

/* Draft-content release gate: while REASSURE_CONTENT.status is 'draft', the
 * clinical KB blocks are dev-only (see domain/contentGate.ts). Triage and the
 * non-medical guides render regardless — escalation is never hidden. */
const showClinical = clinicalContentVisible(__DEV__);

/* Draft-gate copy — local UX copy (not medical), shown in place of the
 * clinical KB blocks in public builds until clinician sign-off. */
const REVIEW_PENDING_LINE =
  'Our guidance on this topic is still being reviewed, so it isn’t shown in the app yet.';
const REVIEW_PENDING_BODY =
  'Your pediatrician or nurse line is the best place for questions like this. If anything feels urgent, call your doctor right away.';

/* UX copy (not medical) — still listed in docs/plans/reassure-content-review.md. */
const EMERGENCY_INFO =
  'Emergency numbers differ by country (for example 911 or 112). If baby is struggling to breathe, can’t be woken, or is turning blue, call yours right away.';

/* Pediatrician-number action labels — local UX copy (not medical), never sent
 * anywhere. The number itself is stored only on-device (see usePediatricianPhone). */
const ADD_NUMBER_ACTION = 'Add pediatrician number';
const UPDATE_NUMBER_ACTION = 'Update saved number';
const SAVE_NUMBER_ACTION = 'Save number';
const CANCEL_ACTION = 'Cancel';
const NUMBER_INPUT_LABEL = 'Pediatrician phone number';
const NUMBER_INPUT_PLACEHOLDER = '+1 555 123 4567';
const NUMBER_INPUT_HELP = 'Saved on this device only — never shared.';

export type TriageAction = 'pediatrician' | 'emergency-info';

type Props = {
  result: RouteResult;
  surfaceMode: SurfaceMode;
  reduceMotion: boolean;
  onDismiss: () => void;
  onTriageAction: (action: TriageAction) => void;
};

function PhoneIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5c0 9 6 15 15 15l-1-4-4-1-2 2a11 11 0 0 1-5-5l2-2-1-4-4-1Z"
        stroke="#fff"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function AnswerCard({ result, surfaceMode, reduceMotion, onDismiss, onTriageAction }: Props) {
  const palette = surfaces[surfaceMode];
  const [showEmergencyInfo, setShowEmergencyInfo] = useState(false);

  // Pediatrician number: loaded locally, never sent anywhere. `ready` guards the
  // brief pre-load window so the triage card doesn't flash the wrong action.
  const { phone, ready: phoneReady, save: savePhone } = usePediatricianPhone();
  const [editingNumber, setEditingNumber] = useState(false);
  const [draftNumber, setDraftNumber] = useState('');
  const [callFallback, setCallFallback] = useState<string | null>(null);

  // Lazy initializer keeps the Animated.Value stable across renders (the same
  // React-Compiler-safe pattern BrandSplashGate uses).
  const [progress] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 400,
      easing: Easing.bezier(0.2, 0.8, 0.25, 1),
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion, result]);

  const isTriage = result.kind === 'triage';
  const headerColors: readonly [string, string] = isTriage
    ? [colors.alert2, colors.alert]
    : [colors.sleep2, colors.sleep];

  const title =
    result.kind === 'topic'
      ? KB[result.key].title
      : result.kind === 'guide'
        ? GUIDES[result.key].title
        : result.kind === 'triage'
          ? TRIAGE_COPY.title
          : OOS_COPY.title;
  const tag =
    result.kind === 'topic'
      ? KB[result.key].tag
      : result.kind === 'guide'
        ? GUIDES[result.key].tag
        : result.kind === 'triage'
          ? TRIAGE_COPY.tag
          : OOS_COPY.tag;
  const line =
    result.kind === 'topic'
      ? showClinical
        ? KB[result.key].line
        : REVIEW_PENDING_LINE
      : result.kind === 'guide'
        ? GUIDES[result.key].line
        : result.kind === 'triage'
          ? TRIAGE_COPY.line
          : OOS_COPY.line;
  const dismissLabel =
    result.kind === 'topic'
      ? TOPIC_DISMISS
      : result.kind === 'triage'
        ? TRIAGE_COPY.dismiss
        : OOS_COPY.dismiss;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={{
        marginTop: 14,
        borderRadius: radii.medium,
        backgroundColor: palette.card,
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
          },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
        ],
        ...shadows.card,
      }}>
      {/* Inner clip node: rounds the gradient header's corners. Kept SEPARATE from
          the shadow node above — on iOS overflow:'hidden' on the same view clips the
          drop shadow away; Android still elevates via `elevation`. */}
      <View style={{ borderRadius: radii.medium, overflow: 'hidden' }}>
      {/* header */}
      <LinearGradient colors={headerColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View
          style={{
            paddingHorizontal: 18,
            paddingTop: 16,
            paddingBottom: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}>
          <Text
            style={{ fontFamily: fonts.displayMedium, fontSize: 17, color: colors.white, flex: 1 }}>
            {title}
          </Text>
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.24)',
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: radii.pill,
            }}>
            <Text
              style={{
                fontFamily: fonts.bodyBold,
                fontSize: 10,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                color: colors.white,
              }}>
              {tag}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* body */}
      <View style={{ backgroundColor: palette.card, paddingHorizontal: 18, paddingBottom: 18 }}>
        {/* one-sentence summary — the takeaway. A soft accent bar frames it as the
            summary above the "what I'm seeing / what you can do" detail (the
            AnswerBlocks below). Content, copy, and gating are unchanged. */}
        <View style={{ flexDirection: 'row', gap: 11, paddingTop: 14, paddingBottom: 10 }}>
          <View
            style={{ width: 3, borderRadius: 2, backgroundColor: isTriage ? colors.alert : colors.sleep }}
          />
          <Text
            style={{
              flex: 1,
              fontFamily: fonts.bodyBold,
              fontSize: 14,
              lineHeight: 21,
              color: palette.ink,
            }}>
            {line}
          </Text>
        </View>

        {result.kind === 'topic' && showClinical ? (
          <>
            <AnswerBlocks topic={KB[result.key]} surfaceMode={surfaceMode} />
            <View
              style={{
                backgroundColor: surfaceMode === 'night' ? 'rgba(255,255,255,0.06)' : colors.surfaceSoft,
                borderRadius: radii.small,
                padding: 13,
                marginTop: 6,
              }}>
              <Text
                style={{
                  fontFamily: fonts.bodyBold,
                  fontSize: 12.5,
                  lineHeight: 19,
                  color: palette.inkSoft,
                }}>
                {TOPIC_FOOT}
              </Text>
            </View>
          </>
        ) : null}

        {/* draft gate — a calm pediatrician pointer in place of the clinical blocks */}
        {result.kind === 'topic' && !showClinical ? (
          <View
            style={{
              backgroundColor: surfaceMode === 'night' ? 'rgba(255,255,255,0.06)' : colors.surfaceSoft,
              borderRadius: radii.small,
              padding: 13,
            }}>
            <Text
              style={{
                fontFamily: fonts.bodyBold,
                fontSize: 12.5,
                lineHeight: 19,
                color: palette.inkSoft,
              }}>
              {REVIEW_PENDING_BODY}
            </Text>
          </View>
        ) : null}

        {result.kind === 'oos' ? (
          <View
            style={{
              backgroundColor: surfaceMode === 'night' ? 'rgba(255,255,255,0.06)' : colors.surfaceSoft,
              borderRadius: radii.small,
              padding: 13,
            }}>
            <Text
              style={{
                fontFamily: fonts.bodyBold,
                fontSize: 12.5,
                lineHeight: 19,
                color: palette.inkSoft,
              }}>
              {OOS_COPY.foot}
            </Text>
          </View>
        ) : null}

        {/* guide — a bounded NON-medical answer: no "When to call" block, calm tone. */}
        {result.kind === 'guide' ? (
          <View
            style={{
              backgroundColor: surfaceMode === 'night' ? 'rgba(255,255,255,0.06)' : colors.surfaceSoft,
              borderRadius: radii.small,
              padding: 13,
            }}>
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: 13.5,
                lineHeight: 20,
                color: palette.inkSoft,
              }}>
              {GUIDES[result.key].body}
            </Text>
          </View>
        ) : null}

        {result.kind === 'triage' ? (
          <>
            <View
              style={{
                paddingVertical: 13,
                borderTopWidth: 1,
                borderTopColor: palette.line,
              }}>
              <Text
                style={{
                  fontFamily: fonts.body,
                  fontSize: 13.5,
                  lineHeight: 20,
                  color: palette.inkSoft,
                }}>
                {TRIAGE_COPY.call}
              </Text>
            </View>
            <View style={{ gap: 9, paddingTop: 4 }}>
              {/* Primary action: dial the SAVED number, or — when none exists —
                  open the inline add-number sheet. It never pretends it can call
                  with no number. A failed dialer open is non-fatal (calm fallback). */}
              {!phoneReady ? (
                <View
                  style={{
                    backgroundColor:
                      surfaceMode === 'night' ? 'rgba(224,87,75,0.16)' : colors.alertTint,
                    borderRadius: 14,
                    paddingVertical: 14,
                    opacity: 0.5,
                  }}
                />
              ) : phone != null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={TRIAGE_COPY.primaryAction}
                  onPress={() => {
                    onTriageAction('pediatrician');
                    setCallFallback(null);
                    // Opens the OS dialer with the parent's saved number.
                    Linking.openURL(telUrlFor(phone)).catch(() => {
                      setCallFallback(
                        `Couldn’t open your phone’s dialer. You can call ${phone} directly.`,
                      );
                    });
                  }}
                  style={({ pressed }) => ({
                    backgroundColor: colors.alert,
                    borderRadius: 14,
                    paddingVertical: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: pressed ? 0.86 : 1,
                  })}>
                  <PhoneIcon />
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.white }}>
                    {TRIAGE_COPY.primaryAction}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={ADD_NUMBER_ACTION}
                  onPress={() => {
                    setDraftNumber('');
                    setEditingNumber(true);
                  }}
                  style={({ pressed }) => ({
                    backgroundColor:
                      surfaceMode === 'night' ? 'rgba(224,87,75,0.16)' : colors.alertTint,
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderColor: colors.alert,
                    paddingVertical: 13,
                    alignItems: 'center',
                    opacity: pressed ? 0.86 : 1,
                  })}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.alert }}>
                    {ADD_NUMBER_ACTION}
                  </Text>
                </Pressable>
              )}

              {/* Calm fallback shown only when the dialer refused to open. */}
              {callFallback != null ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 12.5,
                    lineHeight: 19,
                    color: palette.inkSoft,
                    paddingHorizontal: 2,
                  }}>
                  {callFallback}
                </Text>
              ) : null}

              {/* Fix a wrong number without leaving triage. */}
              {phoneReady && phone != null && !editingNumber ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={UPDATE_NUMBER_ACTION}
                  onPress={() => {
                    setDraftNumber(phone);
                    setEditingNumber(true);
                  }}
                  hitSlop={8}
                  style={{ alignItems: 'center', paddingVertical: 2 }}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: palette.inkSoft }}>
                    {UPDATE_NUMBER_ACTION}
                  </Text>
                </Pressable>
              ) : null}

              {/* Inline setup sheet — the smallest clean local settings surface.
                  Stored on-device only via savePhone (usePediatricianPhone). */}
              {editingNumber ? (
                <View
                  style={{
                    backgroundColor:
                      surfaceMode === 'night' ? 'rgba(255,255,255,0.06)' : colors.surfaceSoft,
                    borderRadius: radii.small,
                    padding: 13,
                    gap: 10,
                  }}>
                  <TextInput
                    accessibilityLabel={NUMBER_INPUT_LABEL}
                    value={draftNumber}
                    onChangeText={setDraftNumber}
                    placeholder={NUMBER_INPUT_PLACEHOLDER}
                    placeholderTextColor={palette.inkFaint}
                    keyboardType="phone-pad"
                    autoFocus
                    style={{
                      fontFamily: fonts.body,
                      fontSize: 15,
                      color: palette.ink,
                      backgroundColor: palette.card,
                      borderWidth: 1.5,
                      borderColor: palette.line,
                      borderRadius: radii.small,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                    }}
                  />
                  <Text
                    style={{
                      fontFamily: fonts.body,
                      fontSize: 11.5,
                      lineHeight: 16,
                      color: palette.inkFaint,
                    }}>
                    {NUMBER_INPUT_HELP}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 9 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={SAVE_NUMBER_ACTION}
                      onPress={() => {
                        void savePhone(draftNumber).then((saved) => {
                          setEditingNumber(false);
                          if (saved != null) setCallFallback(null);
                        });
                      }}
                      style={({ pressed }) => ({
                        flex: 1,
                        backgroundColor: colors.alert,
                        borderRadius: 12,
                        paddingVertical: 12,
                        alignItems: 'center',
                        opacity: pressed ? 0.86 : 1,
                      })}>
                      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.white }}>
                        {SAVE_NUMBER_ACTION}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={CANCEL_ACTION}
                      onPress={() => setEditingNumber(false)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.86 : 1,
                      })}>
                      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, color: palette.inkSoft }}>
                        {CANCEL_ACTION}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {/* Emergency — INFORMATION ONLY. Never auto-dials; no country number
                  is hardcoded as an action. Tapping only reveals calm guidance. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={TRIAGE_COPY.secondaryAction}
                onPress={() => {
                  onTriageAction('emergency-info');
                  setShowEmergencyInfo(true);
                }}
                style={({ pressed }) => ({
                  backgroundColor:
                    surfaceMode === 'night' ? 'rgba(224,87,75,0.16)' : colors.alertTint,
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: pressed ? 0.86 : 1,
                })}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.alert }}>
                  {TRIAGE_COPY.secondaryAction}
                </Text>
              </Pressable>
              {showEmergencyInfo ? (
                <Text
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 12.5,
                    lineHeight: 19,
                    color: palette.inkSoft,
                    paddingHorizontal: 2,
                  }}>
                  {EMERGENCY_INFO}
                </Text>
              ) : null}
            </View>
          </>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss answer"
          onPress={onDismiss}
          hitSlop={8}
          style={{ paddingTop: 14, alignItems: 'center' }}>
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 13.5,
              color: isTriage ? colors.alert : colors.sleep,
            }}>
            {dismissLabel}
          </Text>
        </Pressable>
      </View>
      </View>
    </Animated.View>
  );
}
