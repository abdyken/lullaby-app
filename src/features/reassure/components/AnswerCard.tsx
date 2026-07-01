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
import { Animated, Easing, Linking, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { AnswerBlocks } from '@/features/reassure/components/AnswerBlocks';
import {
  KB,
  OOS_COPY,
  TOPIC_DISMISS,
  TOPIC_FOOT,
  TRIAGE_COPY,
} from '@/features/reassure/content/kb';
import type { RouteResult } from '@/features/reassure/domain/types';
import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

/* UX copy (not medical) — still listed in docs/reassure-content-review.md. */
const EMERGENCY_INFO =
  'Emergency numbers differ by country (for example 911 or 112). If baby is struggling to breathe, can’t be woken, or is turning blue, call yours right away.';

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
      : result.kind === 'triage'
        ? TRIAGE_COPY.title
        : OOS_COPY.title;
  const tag =
    result.kind === 'topic'
      ? KB[result.key].tag
      : result.kind === 'triage'
        ? TRIAGE_COPY.tag
        : OOS_COPY.tag;
  const line =
    result.kind === 'topic'
      ? KB[result.key].line
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
        overflow: 'hidden',
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
          },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
        ],
        ...shadows.card,
      }}>
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
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 14,
            lineHeight: 21,
            color: palette.ink,
            paddingTop: 14,
            paddingBottom: 10,
          }}>
          {line}
        </Text>

        {result.kind === 'topic' ? (
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={TRIAGE_COPY.primaryAction}
                onPress={() => {
                  onTriageAction('pediatrician');
                  // Opens the dialer; no pediatrician number is stored yet
                  // (open question in SUMMARY.md). Failure is non-fatal.
                  Linking.openURL('tel:').catch(() => {});
                }}
                style={({ pressed }) => ({
                  backgroundColor: colors.alert,
                  borderRadius: 14,
                  paddingVertical: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                })}>
                <PhoneIcon />
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.white }}>
                  {TRIAGE_COPY.primaryAction}
                </Text>
              </Pressable>
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
                  transform: [{ scale: pressed ? 0.98 : 1 }],
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
    </Animated.View>
  );
}
