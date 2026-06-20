/**
 * LoggingToast — floating undo toast shown after a save action.
 *
 * Fades in when `mutation` is set, auto-dismisses after 4 seconds,
 * and disappears immediately when `mutation` is cleared.
 *
 * Accessibility: the "Undo" button is labeled and accessible via TalkBack/VoiceOver.
 * The message text uses accessibilityLiveRegion="polite" so screen readers announce
 * the save without interrupting active UI focus.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows, tabbar } from '@/theme';
import type { UndoableMutation } from '../domain/types';

const TOAST_DURATION_MS = 4000;
const FADE_MS = 180;

interface Props {
  mutation: UndoableMutation | null;
  onUndo: () => void;
  onDismiss: () => void;
}

export function LoggingToast({ mutation, onUndo, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!mutation) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start();
      return;
    }

    // Fade in
    Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start();

    // Auto-dismiss
    timerRef.current = setTimeout(() => {
      onDismiss();
    }, TOAST_DURATION_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [mutation, onDismiss, opacity]);

  // Tab bar total height (height + marginBottom + bottom inset).
  const tabBarOffset = tabbar.height + tabbar.marginBottom + insets.bottom;

  if (!mutation) return null;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: tabBarOffset + 8,
        left: 16,
        right: 16,
        opacity,
      }}>
      <View
        style={{
          backgroundColor: colors.ink,
          borderRadius: radii.medium,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 16,
          gap: 12,
          ...shadows.soft,
        }}>
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontFamily: fonts.body,
            fontSize: 14,
            color: '#FBF4EF',
            flex: 1,
          }}
          numberOfLines={1}>
          {mutation.label}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Undo ${mutation.label}`}
          onPress={onUndo}
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : 1,
            paddingVertical: 4,
            paddingHorizontal: 8,
          })}>
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 14,
              color: colors.feed,
            }}>
            Undo
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
