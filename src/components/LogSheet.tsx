/**
 * LogSheet — a calm, lightweight bottom sheet for adding a detail to a Feed,
 * Diaper, or Note before saving. Built on React Native's own Modal (no new
 * dependency) so it portals above everything, including the floating tab bar,
 * and works on Android + mobile web.
 *
 * It is deliberately not a form: a title, a "Just now" subtitle, one row of big
 * tappable option pills (one-handed friendly), and a single Save button — all in
 * the existing design language (cream/white surface, soft warm shadow, rounded,
 * per-state accent). Opening it logs nothing; only Save (via onSave) creates the
 * event. Tapping the scrim or the Android back button dismisses without logging.
 */
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryActionButton } from '@/components/PrimaryActionButton';
import { colors, fonts, radii, shadows } from '@/theme';

export type SheetOption = { key: string; label: string };

type Props = {
  title: string;
  subtitle: string;
  options: SheetOption[];
  /** which option is pre-selected when the sheet opens */
  defaultKey: string;
  saveLabel: string;
  /** the per-kind accent (feed / diaper / note) used for the selected pill + Save */
  accentColor: string;
  accentTint: string;
  /** fired with the selected option key when Save is tapped */
  onSave: (key: string) => void;
  /** fired on scrim tap / back button — dismiss without logging */
  onClose: () => void;
};

export function LogSheet({
  title,
  subtitle,
  options,
  defaultKey,
  saveLabel,
  accentColor,
  accentTint,
  onSave,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(defaultKey);

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Scrim: soft ink dim, tap-outside to dismiss (logs nothing). */}
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

          <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.ink }}>{title}</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint, marginTop: 2 }}>
            {subtitle}
          </Text>

          <View style={{ flexDirection: 'row', gap: 9, marginTop: 18 }}>
            {options.map((opt) => {
              const active = opt.key === selected;
              return (
                <Pressable
                  key={opt.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={opt.label}
                  onPress={() => setSelected(opt.key)}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 52,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radii.medium,
                    backgroundColor: active ? accentTint : colors.surfaceSoft,
                    // 2px ring at all times (transparent when inactive) so
                    // selection never shifts the pill's size
                    borderWidth: 2,
                    borderColor: active ? accentColor : 'transparent',
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  })}>
                  <Text
                    style={{
                      fontFamily: fonts.bodyBold,
                      fontSize: 14,
                      color: active ? accentColor : colors.inkSoft,
                    }}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: 18, alignItems: 'center' }}>
            <PrimaryActionButton label={saveLabel} accentColor={accentColor} onPress={() => onSave(selected)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default LogSheet;
