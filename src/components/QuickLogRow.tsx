/**
 * QuickLogRow — the compact row of four quick-log tiles (`.lb-quick`).
 *
 * P0: Feed / Sleep / Diaper are live preview actions; the active one shows an
 * accent ring and agrees with the orb above. "More" is a muted P1 placeholder
 * (pump / bottle / medicine) and is a visual no-op for now.
 */
import { View } from 'react-native';

import { QuickLogButton } from '@/components/QuickLogButton';
import type { PreviewState } from '@/data/currentState';

type Props = {
  /** the currently previewed state, so the matching tile reads as active */
  selected: PreviewState;
  onSelect: (state: PreviewState) => void;
};

export function QuickLogRow({ selected, onSelect }: Props) {
  return (
    <View style={{ flexDirection: 'row', gap: 9 }}>
      <QuickLogButton
        kind="feed"
        label="Feed"
        active={selected === 'feed'}
        onPress={() => onSelect('feed')}
      />
      <QuickLogButton
        kind="sleep"
        label="Sleep"
        active={selected === 'sleep'}
        onPress={() => onSelect('sleep')}
      />
      <QuickLogButton
        kind="diaper"
        label="Diaper"
        active={selected === 'diaper'}
        onPress={() => onSelect('diaper')}
      />
      {/* P1 overflow — muted, no-op for now */}
      <QuickLogButton kind="more" label="More" muted />
    </View>
  );
}

export default QuickLogRow;
