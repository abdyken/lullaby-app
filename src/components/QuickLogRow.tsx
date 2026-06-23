/**
 * QuickLogRow — the 2×2 grid of large quick-log cards, in the spirit of the
 * Hush reference's "Quick log" block: Feed / Sleep / Diaper / Pump, each a big
 * rounded card with a tinted icon block on the left and a label + secondary line
 * on the right.
 *
 * Feed / Sleep / Diaper are live preview actions; Pump also reads active while a
 * v2 pump timer or volume draft is open. Two rows of two cards (each flex:1)
 * keep the grid from ever overflowing a narrow phone.
 */
import { useWindowDimensions, View } from 'react-native';

import { QuickLogButton } from '@/components/QuickLogButton';
import type { PreviewState, QuickLogMeta } from '@/data/currentState';
import type { QuickLogKind } from '@/components/QuickLogButton';
import type { SurfaceMode } from '@/theme';

const SCREEN_HORIZONTAL_PADDING = 18;
const COLUMN_GAP = 9;

type Props = {
  /** the currently active state, so the matching card reads as active (null = none) */
  selected: QuickLogKind | null;
  onSelect: (state: PreviewState) => void;
  /** open the Pump sheet (instant side-log, no orb state) */
  onPump: () => void;
  /** descriptive secondary lines derived from the live events */
  meta: QuickLogMeta;
  /** surface palette — 'day' (default) or 'night' */
  surfaceMode?: SurfaceMode;
};

export function QuickLogRow({ selected, onSelect, onPump, meta, surfaceMode = 'day' }: Props) {
  const { width } = useWindowDimensions();
  const contentWidth = Math.max(0, width - SCREEN_HORIZONTAL_PADDING * 2);
  const cardWidth = Math.floor((contentWidth - COLUMN_GAP) / 2);

  return (
    // Use measured widths instead of flex-only sizing. On native, this grid sits
    // inside a vertical ScrollView, where nested flex children can be measured
    // by their intrinsic icon content and collapse before text gets a width.
    <View style={{ width: contentWidth, alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', width: contentWidth, justifyContent: 'space-between' }}>
        <QuickLogButton
          kind="feed"
          label="Feed"
          secondary={meta.feed}
          active={selected === 'feed'}
          cardWidth={cardWidth}
          surfaceMode={surfaceMode}
          onPress={() => onSelect('feed')}
        />
        <QuickLogButton
          kind="sleep"
          label="Sleep"
          secondary={meta.sleep}
          active={selected === 'sleep'}
          cardWidth={cardWidth}
          surfaceMode={surfaceMode}
          onPress={() => onSelect('sleep')}
        />
      </View>
      <View
        style={{
          flexDirection: 'row',
          width: contentWidth,
          justifyContent: 'space-between',
          marginTop: COLUMN_GAP,
        }}>
        <QuickLogButton
          kind="diaper"
          label="Diaper"
          secondary={meta.diaper}
          active={selected === 'diaper'}
          cardWidth={cardWidth}
          surfaceMode={surfaceMode}
          onPress={() => onSelect('diaper')}
        />
        <QuickLogButton
          kind="pump"
          label="Pump"
          secondary={meta.pump}
          active={selected === 'pump'}
          cardWidth={cardWidth}
          surfaceMode={surfaceMode}
          onPress={onPump}
        />
      </View>
    </View>
  );
}

export default QuickLogRow;
