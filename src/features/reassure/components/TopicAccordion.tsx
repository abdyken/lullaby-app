/**
 * TopicAccordion — the "Common tonight" list. Each KB topic expands in place
 * to reveal the same three AnswerBlocks the answer card uses. Replaces the P0
 * static (non-interactive) card list.
 *
 * Expansion uses LayoutAnimation (jump-cut under reduce-motion); the chevron
 * rotates via a plain Animated timing.
 */
import { useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  Text,
  UIManager,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { AnswerBlocks } from '@/features/reassure/components/AnswerBlocks';
import { KB, TOPIC_ORDER } from '@/features/reassure/content/kb';
import type { ReassureTopicKey } from '@/features/reassure/domain/types';
import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

const isFabric = Boolean(
  (globalThis as typeof globalThis & { nativeFabricUIManager?: unknown }).nativeFabricUIManager,
);

if (Platform.OS === 'android' && !isFabric && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TAG_COLOR: Record<'Common' | 'Comfort', { color: string; tint: string }> = {
  Common: { color: colors.sleep, tint: colors.sleepTint },
  Comfort: { color: colors.diaper, tint: colors.diaperTint },
};

function TopicRow({
  topicKey,
  surfaceMode,
  reduceMotion,
  onToggle,
  onAskTopic,
}: {
  topicKey: ReassureTopicKey;
  surfaceMode: SurfaceMode;
  reduceMotion: boolean;
  onToggle: (key: ReassureTopicKey, open: boolean) => void;
  onAskTopic: (key: ReassureTopicKey) => void;
}) {
  const topic = KB[topicKey];
  const palette = surfaces[surfaceMode];
  const night = surfaceMode === 'night';
  const tag = TAG_COLOR[topic.tag];
  const askLabel = `Ask about ${topic.title.toLowerCase()}`;
  const [open, setOpen] = useState(false);
  const [chevron] = useState(() => new Animated.Value(0));

  const toggle = () => {
    const next = !open;
    if (!reduceMotion) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    Animated.timing(chevron, {
      toValue: next ? 1 : 0,
      duration: reduceMotion ? 0 : 260,
      useNativeDriver: true,
    }).start();
    setOpen(next);
    onToggle(topicKey, next);
  };

  return (
    <View
      style={{
        backgroundColor: palette.card,
        borderRadius: radii.medium,
        borderWidth: night ? 1 : 0,
        borderColor: palette.border,
        overflow: 'hidden',
        ...shadows.card,
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${topic.title}. ${topic.tag}.`}
        onPress={toggle}
        style={{ padding: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: tag.color,
            marginTop: 6,
            flexShrink: 0,
          }}
        />
        <View style={{ flex: 1, minWidth: 0, flexShrink: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
            <Text
              style={{
                flexShrink: 1,
                fontFamily: fonts.displayMedium,
                fontSize: 16,
                color: palette.ink,
              }}>
              {topic.title}
            </Text>
            <View
              style={{
                backgroundColor: night ? 'rgba(255,255,255,0.08)' : tag.tint,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: radii.pill,
                flexShrink: 0,
              }}>
              <Text
                style={{
                  fontFamily: fonts.bodyBold,
                  fontSize: 9.5,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: tag.color,
                }}>
                {topic.tag}
              </Text>
            </View>
          </View>
          <Text
            style={{
              flexShrink: 1,
              fontFamily: fonts.body,
              fontSize: 12.5,
              lineHeight: 19,
              color: palette.inkSoft,
              marginTop: 4,
            }}>
            {topic.line}
          </Text>
        </View>
        <Animated.View
          style={{
            width: 18,
            height: 18,
            marginTop: 5,
            alignSelf: 'flex-start',
            flexShrink: 0,
            transform: [
              {
                rotate: chevron.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }),
              },
            ],
          }}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path
              d="M9 6l6 6-6 6"
              stroke={palette.inkFaint}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>
      </Pressable>

      {open ? (
        <View style={{ paddingHorizontal: 18, paddingBottom: 18, paddingTop: 2 }}>
          <AnswerBlocks topic={topic} surfaceMode={surfaceMode} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={askLabel}
            onPress={() => onAskTopic(topicKey)}
            hitSlop={6}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              backgroundColor: night ? 'rgba(85,96,198,0.20)' : colors.sleepTint,
              borderWidth: 1.5,
              borderColor: night ? 'rgba(124,132,218,0.34)' : 'rgba(85,96,198,0.18)',
              borderRadius: radii.pill,
              paddingHorizontal: 14,
              paddingVertical: 9,
              marginTop: 2,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.sleep }}>
              {askLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function TopicAccordion({
  surfaceMode,
  reduceMotion,
  onToggle,
  onAskTopic,
}: {
  surfaceMode: SurfaceMode;
  reduceMotion: boolean;
  onToggle: (key: ReassureTopicKey, open: boolean) => void;
  onAskTopic: (key: ReassureTopicKey) => void;
}) {
  return (
    <View style={{ gap: 11 }}>
      {TOPIC_ORDER.map((key) => (
        <TopicRow
          key={key}
          topicKey={key}
          surfaceMode={surfaceMode}
          reduceMotion={reduceMotion}
          onToggle={onToggle}
          onAskTopic={onAskTopic}
        />
      ))}
    </View>
  );
}
