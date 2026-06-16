/**
 * Reassure — the calm "is this normal?" surface (placeholder for this stage).
 *
 * P0 is five static safe cards (§4, §8). This foundation renders titles only —
 * no medical content yet. Copy, "usually normal" lines, red-flag blocks, and
 * the disclaimer all come later and require clinical sign-off before launch.
 */
import { Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { colors, fonts, radii, shadows } from '@/theme';

const CARDS = ['Hiccups', 'Spit-up', 'Gas', "Won't sleep", 'When to call a doctor'];

export default function ReassureScreen() {
  return (
    <Screen>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.4, color: colors.sleep }}>
        IS THIS NORMAL?
      </Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.ink, marginTop: 6 }}>
        Reassure
      </Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, marginTop: 2 }}>
        A calm place for the common worries.
      </Text>

      <View className="mt-6" style={{ gap: 10 }}>
        {CARDS.map((title) => (
          <View
            key={title}
            className="rounded-md bg-surface px-4 py-4"
            style={{ borderRadius: radii.medium, ...shadows.card }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 16, color: colors.ink }}>{title}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
