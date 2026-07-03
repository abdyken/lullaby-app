/**
 * AiReadNote — the honest label that sits directly under the RecapCard so the
 * night read never lies about where its words came from:
 *
 *   - status 'ai'          → a calm "AI-phrased" badge + the standing "general
 *                            information, not medical advice, never a diagnosis"
 *                            disclaimer, so a successful AI read is clearly shown
 *                            AS an AI read (and still non-medical).
 *   - status 'unavailable' → a calm one-liner that the AI read isn't available
 *                            and the local read is showing instead. Never a
 *                            technical error, never a scary failure surface.
 *   - status 'idle'/'loading' → renders nothing. The local read simply stands on
 *                            its own; no spinner, no "generating…" nag.
 *
 * It NEVER blocks anything and NEVER implies success when the AI didn't come
 * through — the RecapCard above already shows the local read in every state.
 */
import { Text, View } from 'react-native';

import type { NightReadStatus } from '@/features/reassure/application/nightRead';
import { colors, fonts, radii, surfaces, type SurfaceMode } from '@/theme';

type Props = {
  surfaceMode: SurfaceMode;
  status: NightReadStatus;
};

const AI_DISCLAIMER = 'General information, not medical advice — never a diagnosis.';
const UNAVAILABLE_LINE =
  "AI read isn’t available right now — here’s the local read based on your logs.";

export function AiReadNote({ surfaceMode, status }: Props) {
  if (status !== 'ai' && status !== 'unavailable') return null;
  const palette = surfaces[surfaceMode];

  if (status === 'unavailable') {
    return (
      <View style={{ marginTop: 8, paddingHorizontal: 2 }}>
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontFamily: fonts.body,
            fontSize: 12,
            lineHeight: 17.5,
            color: palette.inkFaint,
          }}>
          {UNAVAILABLE_LINE}
        </Text>
      </View>
    );
  }

  // status === 'ai'
  return (
    <View style={{ marginTop: 8, paddingHorizontal: 2, gap: 6 }}>
      <View
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor:
            surfaceMode === 'night' ? 'rgba(124,131,253,0.16)' : colors.surfaceSoft,
          borderRadius: radii.pill,
          paddingHorizontal: 10,
          paddingVertical: 4,
        }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sleep }} />
        <Text
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 10,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: colors.sleep,
          }}>
          AI-phrased read
        </Text>
      </View>
      <Text
        style={{
          fontFamily: fonts.body,
          fontSize: 11.5,
          lineHeight: 16.5,
          color: palette.inkFaint,
        }}>
        {AI_DISCLAIMER}
      </Text>
    </View>
  );
}
