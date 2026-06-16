/**
 * Log — the "what happened" history screen (placeholder for this stage).
 *
 * The real screen groups events by Today/Yesterday with filters and a night
 * recap (§4), reading the same mock store as Tonight. For now it shows the
 * title and the live mock event count.
 */
import { Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { tonightEventCount } from '@/data/mock';
import { colors, fonts, radii, shadows } from '@/theme';

export default function LogScreen() {
  const count = tonightEventCount();

  return (
    <Screen>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.4, color: colors.inkFaint }}>
        HISTORY
      </Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.ink, marginTop: 6 }}>
        Log
      </Text>

      <View
        className="mt-7 rounded-md bg-surface p-5"
        style={{ borderRadius: radii.medium, ...shadows.card }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 34, color: colors.ink }}>{count}</Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 2 }}>
          events logged so far (mock data)
        </Text>
        <Text
          style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, marginTop: 12, lineHeight: 19 }}>
          Today / Yesterday grouping, feed · sleep · diaper filters, and the night recap come next —
          all reading this same store.
        </Text>
      </View>
    </Screen>
  );
}
