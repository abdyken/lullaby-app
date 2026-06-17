/**
 * Reassure — the calm "is this normal?" surface (§4, §8).
 *
 * P0 is five static safe cards: bundled local content only. No AI, no
 * diagnosis, no symptom checking, no backend. Cards are visually pressable (a
 * no-op for now) so the detail view can slot in later without a redesign. A
 * quiet, persistent disclaimer sits at the bottom.
 *
 * Above the cards sits a quiet morning recap (Phase 6) built from the SAME
 * local events as Tonight/Log (via useLocalEvents). It only counts what the
 * parent logged — no diagnosis, no prediction, no "normal/abnormal", no health
 * claims — and carries its own calm safety line. The five static cards and the
 * top safety note / bottom disclaimer are unchanged.
 *
 * Tone per §8: warm, honest, short. Never alarmist, never clinical-cold.
 * Clinical sign-off is still required before any public launch.
 */
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Screen } from '@/components/Screen';
import { buildNightRecap, recapSummaryLine } from '@/data/currentState';
import { useLocalEvents } from '@/state/LocalEventProvider';
import { colors, fonts, radii, shadows } from '@/theme';

/** Calm pastel tones for the chips. Lavender stays the section tone; Safety
 *  uses the brand's warm terracotta (never a blaring alarm red, §8). */
type Tone = 'common' | 'comfort' | 'safety';

const TONES: Record<Tone, { label: string; color: string; tint: string }> = {
  common: { label: 'Common', color: colors.sleep, tint: colors.sleepTint },
  comfort: { label: 'Comfort', color: colors.diaper, tint: colors.diaperTint },
  safety: { label: 'Safety', color: colors.feed, tint: colors.feedTint },
};

type ReassureCard = { id: string; title: string; description: string; tone: Tone };

/** The five fixed P0 cards. Conservative, non-diagnostic framing only. */
const CARDS: ReassureCard[] = [
  {
    id: 'hiccups',
    title: 'Hiccups',
    description:
      'Frequent little hiccups are a normal newborn reflex. They usually pass on their own and tend to bother us more than the baby.',
    tone: 'common',
  },
  {
    id: 'spit-up',
    title: 'Spit-up',
    description:
      'Small spit-ups after feeds are typical while a tiny tummy is still settling. Keeping baby upright for a little while can help.',
    tone: 'common',
  },
  {
    id: 'gas',
    title: 'Gas',
    description:
      'Wriggles, grunts, and gas are part of a new digestive system finding its rhythm. Gentle burping and tummy time often ease it.',
    tone: 'comfort',
  },
  {
    id: 'wont-sleep',
    title: "Won't sleep",
    description:
      "Newborn sleep is wonderfully unpredictable. Short, broken stretches at this age are normal — not a sign you're doing it wrong.",
    tone: 'comfort',
  },
  {
    id: 'call-doctor',
    title: 'When to call a doctor',
    description:
      'A calm, general guide to signs worth a call — like fever, changes in breathing, or feeding far less than usual. When unsure, call.',
    tone: 'safety',
  },
];

function Chevron() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 6l6 6-6 6"
        stroke={colors.inkFaint}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ReassureRow({ card }: { card: ReassureCard }) {
  const tone = TONES[card.tone];
  return (
    <Pressable
      // Visual-only for now: detail pages come later (§4). No-op press is fine.
      onPress={() => {}}
      accessibilityRole="button"
      accessibilityLabel={`${card.title}. ${tone.label}.`}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderRadius: radii.medium,
        padding: 16,
        transform: [{ scale: pressed ? 0.98 : 1 }],
        ...shadows.card,
      })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* small accent dot in the card's tone */}
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: tone.color,
            marginTop: 5,
            alignSelf: 'flex-start',
          }}
        />

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 16.5, color: colors.ink }}>
              {card.title}
            </Text>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: radii.pill,
                backgroundColor: tone.tint,
              }}>
              <Text
                style={{
                  fontFamily: fonts.bodyBold,
                  fontSize: 9.5,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: tone.color,
                }}>
                {tone.label}
              </Text>
            </View>
          </View>

          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: 13,
              lineHeight: 19,
              color: colors.inkSoft,
              marginTop: 5,
            }}>
            {card.description}
          </Text>
        </View>

        <Chevron />
      </View>
    </Pressable>
  );
}

/**
 * A quiet morning recap built from the local events. Not a dashboard: one calm
 * line of counts (or a calm empty state) plus a non-medical safety line. Reads
 * the live store so it always reflects what the parent actually logged.
 */
function NightRecapCard() {
  const { events } = useLocalEvents();
  const recap = buildNightRecap(events);
  const summary = recapSummaryLine(recap);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.medium,
        paddingVertical: 16,
        paddingHorizontal: 16,
        marginTop: 16,
        ...shadows.card,
      }}>
      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 9.5,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: colors.inkFaint,
        }}>
        Based on saved logs
      </Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.ink, marginTop: 4 }}>
        Here’s what you logged
      </Text>

      <Text
        style={{
          fontFamily: fonts.body,
          fontSize: 13.5,
          lineHeight: 20,
          color: summary ? colors.inkSoft : colors.inkFaint,
          marginTop: 8,
        }}>
        {summary ??
          'No logs yet tonight. Your recap will appear here after you save a feed, diaper, sleep, or note.'}
      </Text>

      <Text
        style={{
          fontFamily: fonts.body,
          fontSize: 12,
          lineHeight: 18,
          color: colors.inkFaint,
          marginTop: 10,
        }}>
        Newborn nights can vary. If something feels unusual, urgent, or worrying, contact your
        pediatrician or local emergency care.
      </Text>
    </View>
  );
}

export default function ReassureScreen() {
  return (
    <Screen>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.4, color: colors.sleep }}>
        IS THIS NORMAL?
      </Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.ink, marginTop: 6 }}>
        Reassure
      </Text>
      <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkSoft, marginTop: 2 }}>
        Quick, bounded guidance for common newborn nights.
      </Text>

      {/* Safety note near the top — soft lavender, calm, never an alarm. */}
      <View
        style={{
          backgroundColor: colors.sleepTint,
          borderRadius: radii.medium,
          paddingVertical: 13,
          paddingHorizontal: 15,
          marginTop: 16,
        }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18.5, color: colors.ink }}>
          Lullaby does not provide diagnosis or treatment. If something feels urgent, call your doctor or
          local emergency number.
        </Text>
      </View>

      {/* Quiet morning recap from the local events (Phase 6) — sits above the
          static cards, never replaces them. */}
      <NightRecapCard />

      <View style={{ gap: 11, marginTop: 16 }}>
        {CARDS.map((card) => (
          <ReassureRow key={card.id} card={card} />
        ))}
      </View>

      {/* Quiet, persistent disclaimer (§8) — present, low-contrast, not a nag. */}
      <Text
        style={{
          fontFamily: fonts.body,
          fontSize: 11.5,
          lineHeight: 17,
          color: colors.inkFaint,
          textAlign: 'center',
          marginTop: 20,
          paddingHorizontal: 12,
        }}>
        General information, not medical advice. When in doubt, call your pediatrician.
      </Text>
    </Screen>
  );
}
