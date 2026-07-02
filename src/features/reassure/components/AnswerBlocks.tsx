/**
 * AnswerBlocks — the three bounded blocks every topic answer is made of:
 * What's normal ✓ (teal) / What can help 💡 (indigo) / When to call ⚠ (red).
 * Shared by the AnswerCard and the "Common tonight" accordion so the two
 * surfaces can never drift apart. Icons are ported from the demo's ICN set.
 */
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { ReassureTopic } from '@/features/reassure/content/kb';
import { colors, fonts, surfaces, type SurfaceMode } from '@/theme';

type BlockKind = 'normal' | 'helps' | 'call';

function BlockIcon({ kind, color }: { kind: BlockKind; color: string }) {
  if (kind === 'normal') {
    return (
      <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
        <Path
          d="M20 6 9 17l-5-5"
          stroke={color}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  if (kind === 'call') {
    return (
      <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
        <Path d="M12 8v5M12 16.5v.5" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        <Path
          d="M10.3 3.9 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
          stroke={color}
          strokeWidth={1.9}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .9 1.6l.1.5h5l.1-.5c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3ZM9.5 20h5M10 22h4"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const BLOCKS: { kind: BlockKind; label: string; color: string }[] = [
  { kind: 'normal', label: "What's normal", color: colors.diaper },
  { kind: 'helps', label: 'What can help', color: colors.sleep },
  { kind: 'call', label: 'When to call', color: colors.alert },
];

export function AnswerBlocks({
  topic,
  surfaceMode,
}: {
  topic: ReassureTopic;
  surfaceMode: SurfaceMode;
}) {
  const palette = surfaces[surfaceMode];
  const bodyByKind: Record<BlockKind, string> = {
    normal: topic.normal,
    helps: topic.helps,
    call: topic.call,
  };

  return (
    <View>
      {BLOCKS.map(({ kind, label, color }) => (
        <View
          key={kind}
          style={{
            paddingVertical: 13,
            borderTopWidth: 1,
            borderTopColor: palette.line,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <BlockIcon kind={kind} color={color} />
            <Text
              style={{
                fontFamily: fonts.bodyBold,
                fontSize: 11,
                letterSpacing: 0.55,
                textTransform: 'uppercase',
                color,
              }}>
              {label}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 13.5,
              lineHeight: 20,
              color: palette.inkSoft,
            }}>
            {bodyByKind[kind]}
          </Text>
        </View>
      ))}
    </View>
  );
}
