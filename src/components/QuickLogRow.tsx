/**
 * QuickLogRow — the compact row of four quick-log tiles (`.lb-quick`).
 *
 * Feed / Sleep / Diaper are live preview actions; the active one shows an accent
 * ring and agrees with the orb above. "Note" is a one-tap instant log (a preset
 * note) — it never owns an orb state, so it never reads as "active".
 */
import { View } from 'react-native';

import { QuickLogButton } from '@/components/QuickLogButton';
import type { PreviewState } from '@/data/currentState';

type Props = {
  /** the currently active state, so the matching tile reads as active (null = none) */
  selected: PreviewState | null;
  onSelect: (state: PreviewState) => void;
  /** one-tap preset note (instant, no orb state) */
  onNote: () => void;
};

export function QuickLogRow({ selected, onSelect, onNote }: Props) {
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
      <QuickLogButton kind="note" label="Note" onPress={onNote} />
    </View>
  );
}

export default QuickLogRow;
