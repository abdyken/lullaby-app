/**
 * Unified outline tab icons. A single Heroicons-style family — viewBox 24,
 * fill="none", stroke="currentColor", 1.5 stroke, round caps/joins — imported as
 * SVG components via react-native-svg-transformer (the same setup the quick-log
 * tiles use). They carry `stroke="currentColor"`, so the passed-in `color` drives
 * the tint: the active tab adopts the accent, inactive tabs stay muted. Never a
 * hardcoded colour.
 *
 * These are the OUTLINE tab-bar glyphs ONLY. The FILLED quick-log tile icons
 * (feed/sleep/diaper/pump) and the timeline glyphs are a separate set and are not
 * touched here. Reassure has no Heroicons match, so it is the existing
 * speech-bubble + heart redrawn in this outline style (heart metaphor preserved).
 */
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

import HistoryIcon from '@/assets/icons/tabs/history.svg';
import InsightsIcon from '@/assets/icons/tabs/insights.svg';
import ReassureIcon from '@/assets/icons/tabs/reassure.svg';
import TonightIcon from '@/assets/icons/tabs/tonight.svg';
import { tabbar } from '@/theme';

export type TabName = 'tonight' | 'insights' | 'log' | 'reassure';

/** name -> outline SVG component. `log` keeps its route name; its glyph is History. */
const TAB_ICON: Record<TabName, ComponentType<SvgProps>> = {
  tonight: TonightIcon,
  insights: InsightsIcon,
  log: HistoryIcon,
  reassure: ReassureIcon,
};

type Props = {
  name: TabName;
  /** active/inactive tint — resolves the glyph's `currentColor` (never hardcoded). */
  color: string;
  size?: number;
};

export function TabIcon({ name, color, size = tabbar.iconSize }: Props) {
  const Glyph = TAB_ICON[name];
  return <Glyph width={size} height={size} color={color} />;
}

export default TabIcon;
