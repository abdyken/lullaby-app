/**
 * AskCard — the "Or type it" fallback input plus the example prompts. All three
 * input paths (voice, chip, text) funnel into the SAME `onAsk` → route().
 *
 * The prompts render in TWO deliberately distinct groups: the calm example
 * prompts, and — set apart with a divider and an alert-red label — the urgent
 * red ⚑ chips. Both call the same `onAsk(chip.ask, 'chip')`, so a flagged chip
 * routes to the exact same triage escalation as a typed red flag; the urgent
 * path is prominent and easy to find, never buried in calm sameness.
 */
import type { RefObject } from 'react';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { EXAMPLE_CHIPS, type ExampleChip } from '@/features/reassure/content/kb';
import type { AskSource } from '@/features/reassure/domain/types';
import { colors, fonts, radii, shadows, surfaces, type SurfaceMode } from '@/theme';

type Props = {
  surfaceMode: SurfaceMode;
  onAsk: (text: string, source: AskSource) => void;
  /** exposed so the degraded voice orb can focus the text input */
  inputRef: RefObject<TextInput | null>;
};

export function AskCard({ surfaceMode, onAsk, inputRef }: Props) {
  const palette = surfaces[surfaceMode];
  const night = surfaceMode === 'night';
  const [text, setText] = useState('');

  const submitText = () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return; // empty asks are never routed
    onAsk(trimmed, 'text');
    setText('');
  };

  const calmChips = EXAMPLE_CHIPS.filter((chip) => !chip.flagged);
  const urgentChips = EXAMPLE_CHIPS.filter((chip) => chip.flagged);

  const renderChip = (chip: ExampleChip) => (
    <Pressable
      key={chip.label}
      accessibilityRole="button"
      accessibilityLabel={chip.flagged ? `${chip.label}. Urgent example.` : chip.label}
      onPress={() => onAsk(chip.ask, 'chip')}
      hitSlop={6}
      style={({ pressed }) => ({
        borderWidth: 1.5,
        borderColor: chip.flagged
          ? 'rgba(224,87,75,0.36)'
          : night
            ? 'rgba(255,255,255,0.14)'
            : colors.line,
        backgroundColor: chip.flagged
          ? night
            ? 'rgba(224,87,75,0.16)'
            : colors.alertTint
          : night
            ? 'rgba(255,255,255,0.07)'
            : colors.surface,
        minHeight: 36,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: radii.pill,
        justifyContent: 'center',
        opacity: pressed ? 0.86 : 1,
      })}>
      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 12,
          color: chip.flagged ? colors.alert : palette.inkSoft,
        }}>
        {chip.flagged ? `⚑ ${chip.label}` : chip.label}
      </Text>
    </Pressable>
  );

  return (
    <View
      style={{
        backgroundColor: palette.card,
        borderRadius: radii.medium,
        borderWidth: night ? 1 : 0,
        borderColor: palette.border,
        padding: 18,
        marginTop: 20,
        ...shadows.card,
      }}>
      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 11,
          letterSpacing: 0.9,
          textTransform: 'uppercase',
          color: palette.inkFaint,
          marginBottom: 12,
        }}>
        Or type it
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          backgroundColor: night ? 'rgba(255,255,255,0.06)' : colors.surfaceSoft,
          borderWidth: 1.5,
          borderColor: palette.line,
          borderRadius: radii.pill,
          paddingVertical: 6,
          paddingRight: 6,
          paddingLeft: 16,
        }}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submitText}
          returnKeyType="send"
          placeholder="Ask about tonight…"
          placeholderTextColor={palette.inkFaint}
          accessibilityLabel="Ask about tonight"
          style={{
            flex: 1,
            fontFamily: fonts.body,
            fontSize: 14,
            color: palette.ink,
            paddingVertical: 6,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask"
          onPress={submitText}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: colors.sleep,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.86 : 1,
          })}>
          <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
            <Path
              d="M4 12h15M13 6l6 6-6 6"
              stroke="#fff"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      </View>

      {/* calm example prompts */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {calmChips.map(renderChip)}
      </View>

      {/* urgent path — set apart (divider + alert-red label) so a worried parent
          finds it fast. Each chip routes to the same triage escalation. */}
      {urgentChips.length > 0 ? (
        <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: palette.line }}>
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 11,
              letterSpacing: 0.9,
              textTransform: 'uppercase',
              color: colors.alert,
              marginBottom: 9,
            }}>
            If something feels urgent
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {urgentChips.map(renderChip)}
          </View>
        </View>
      ) : null}
    </View>
  );
}
