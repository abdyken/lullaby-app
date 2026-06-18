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
import type { SurfaceMode } from '@/theme';

type Props = {
  /** the currently active state, so the matching tile reads as active (null = none) */
  selected: PreviewState | null;
  onSelect: (state: PreviewState) => void;
  /** one-tap preset note (instant, no orb state) */
  onNote: () => void;
  /** surface palette — 'day' (default) or 'night' */
  surfaceMode?: SurfaceMode;
};

export function QuickLogRow({ selected, onSelect, onNote, surfaceMode = 'day' }: Props) {
  return (
    <View style={{ flexDirection: 'row', gap: 9 }}>
      <QuickLogButton
        kind="feed"
        label="Feed"
        active={selected === 'feed'}
        surfaceMode={surfaceMode}
        onPress={() => onSelect('feed')}
      />
      <QuickLogButton
        kind="sleep"
        label="Sleep"
        active={selected === 'sleep'}
        surfaceMode={surfaceMode}
        onPress={() => onSelect('sleep')}
      />
      <QuickLogButton
        kind="diaper"
        label="Diaper"
        active={selected === 'diaper'}
        surfaceMode={surfaceMode}
        onPress={() => onSelect('diaper')}
      />
      <QuickLogButton kind="note" label="Note" surfaceMode={surfaceMode} onPress={onNote} />
    </View>
  );
}

export default QuickLogRow;
