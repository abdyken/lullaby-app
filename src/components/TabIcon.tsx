/**
 * Cozy stroke-based tab icons, traced from `.reference/lullaby-phone-mockup.html`
 * (the `.lb-tab` SVGs). Single-color, ~1.9px stroke, rounded caps/joins — never
 * filled glyphs or emoji. Color is passed in so the active tab adopts the
 * current accent and inactive tabs stay muted.
 */
import Svg, { Circle, Path } from 'react-native-svg';

import { tabbar } from '@/theme';

export type TabName = 'tonight' | 'insights' | 'log' | 'reassure';

type Props = {
  name: TabName;
  color: string;
  size?: number;
};

export function TabIcon({ name, color, size = tabbar.iconSize }: Props) {
  const stroke = color;
  const sw = 1.9;

  if (name === 'tonight') {
    // crescent moon / the orb itself
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (name === 'log') {
    // soft list with rounded lines + dots
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M9 6h11M9 12h11M9 18h7" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
        <Circle cx={4.5} cy={6} r={1.4} fill={stroke} />
        <Circle cx={4.5} cy={12} r={1.4} fill={stroke} />
        <Circle cx={4.5} cy={18} r={1.4} fill={stroke} />
      </Svg>
    );
  }

  if (name === 'insights') {
    // simple rhythm bars, matching the reference's chart-style Insights tab
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M4 19V10M10 19V5M16 19v-7M22 19H2" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
      </Svg>
    );
  }

  // reassure — heart inside a speech bubble
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 3.5V17a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <Path
        d="M12 13.6c-2.2-1.5-3.4-2.7-3.4-4 0-1 .8-1.7 1.7-1.7.6 0 1.2.3 1.7.9.5-.6 1.1-.9 1.7-.9.9 0 1.7.7 1.7 1.7 0 1.3-1.2 2.5-3.4 4Z"
        fill={stroke}
        stroke={stroke}
        strokeWidth={0.4}
      />
    </Svg>
  );
}

export default TabIcon;
