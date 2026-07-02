/**
 * Reassure — the calm "is this normal?" surface, v2 (§4, §8).
 *
 * The 2am flow: three input paths (voice orb, example chips, typed text) feed
 * ONE router — route() in src/features/reassure/domain/router.ts — which
 * resolves every ask into exactly one bounded outcome: topic reassurance,
 * triage escalation, or an out-of-scope decline. Red flags are checked FIRST
 * and always win; that ordering is smoke-guarded (§X) so it cannot silently
 * regress. Below the ask surface: the code-computed night recap (grounded in
 * the parent's saved logs) and the "Common tonight" topic accordion.
 *
 * All medical copy lives in content/kb.ts + domain/redflags.ts —
 * PLACEHOLDER, pending clinician review (REASSURE_CONTENT.status).
 *
 * Tone per §8: warm, honest, short. Never alarmist, never clinical-cold.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { AnswerCard, type TriageAction } from '@/features/reassure/components/AnswerCard';
import { AskCard } from '@/features/reassure/components/AskCard';
import { ReassureHero } from '@/features/reassure/components/ReassureHero';
import { RecapCard } from '@/features/reassure/components/RecapCard';
import { TopicAccordion } from '@/features/reassure/components/TopicAccordion';
import { VoiceOrb } from '@/features/reassure/components/VoiceOrb';
import type { CareEvent } from '@/features/logging/domain/types';
import { useLogging } from '@/features/logging/state/LoggingProvider';
import { useNightRead } from '@/features/reassure/application/nightRead';
import { useVoiceInput } from '@/features/reassure/application/useVoiceInput';
import { nightWindowFor } from '@/features/reassure/domain/nightWindow';
import { buildReassureRecap } from '@/features/reassure/domain/recap';
import { route } from '@/features/reassure/domain/router';
import type { AskSource, RouteResult } from '@/features/reassure/domain/types';
import { useAnalytics } from '@/lib/useAnalytics';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { useTheme } from '@/state/ThemeProvider';
import { colors, fonts, radii, surfaces } from '@/theme';

function Kicker({ text, color }: { text: string; color: string }) {
  return (
    <Text
      style={{
        fontFamily: fonts.bodyBold,
        fontSize: 11,
        letterSpacing: 0.9,
        textTransform: 'uppercase',
        color,
        marginTop: 20,
        marginBottom: 9,
        marginHorizontal: 2,
      }}>
      {text}
    </Text>
  );
}

export default function ReassureScreen() {
  const { mode } = useTheme();
  const palette = surfaces[mode];
  const track = useAnalytics();
  const { loadEventsInRange } = useLogging();
  const reduceMotionPref = useReduceMotion();
  // Until the OS preference resolves, don't run loops (treat as reduced).
  const reduceMotion = reduceMotionPref ?? true;

  const scrollRef = useRef<ScrollView | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const answerYRef = useRef(0);

  const [answer, setAnswer] = useState<RouteResult | null>(null);

  // The recap window is refreshed when the tab regains focus (async tick, so
  // no synchronous setState inside the focus effect — React Compiler rule).
  const [recapSource, setRecapSource] = useState<{ now: number; events: CareEvent[] }>(() => ({
    now: Date.now(),
    events: [],
  }));
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      track('reassure_opened');
      track('reassure_recap_viewed');
      const tick = setTimeout(() => {
        const now = Date.now();
        const window = nightWindowFor(now);
        void loadEventsInRange({ fromMs: window.startMs, toMs: window.endMs }).then((events) => {
          if (!cancelled) setRecapSource({ now, events });
        });
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(tick);
      };
    }, [loadEventsInRange, track]),
  );

  const recap = useMemo(
    () => buildReassureRecap(recapSource.events, recapSource.now),
    [recapSource],
  );
  const nightRead = useNightRead(recap);

  /** The single funnel: every input path lands here. Never routes empty text. */
  const ask = useCallback(
    (text: string, source: AskSource) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      const result = route(trimmed);
      setAnswer(result);
      // PRIVACY: coarse enums only — the raw ask text is never sent to analytics.
      track('reassure_asked', {
        source,
        route_kind: result.kind,
        topic: result.kind === 'topic' ? result.key : null,
      });
      if (result.kind === 'triage') track('reassure_triage_shown');
      // Bring the answer into view once it has risen in.
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, answerYRef.current - 80),
          animated: !reduceMotion,
        });
      }, 90);
    },
    [reduceMotion, track],
  );

  const voice = useVoiceInput({
    onTranscript: (text) => ask(text, 'voice'),
    onListeningStart: () => track('reassure_voice_used'),
    onDenied: () => track('reassure_voice_permission_denied'),
  });

  const onOrbPress = useCallback(() => {
    if (voice.state === 'denied' || voice.state === 'unavailable') {
      inputRef.current?.focus();
      return;
    }
    voice.tapOrb();
  }, [voice]);

  const onTriageAction = useCallback(
    (action: TriageAction) => track('reassure_triage_call_tapped', { action }),
    [track],
  );

  const onTopicToggle = useCallback(
    (key: string, open: boolean) => {
      if (open) track('reassure_topic_opened', { topic: key });
    },
    [track],
  );

  return (
    <Screen surfaceMode={mode} scrollRef={scrollRef}>
      <Text
        style={{ fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.4, color: colors.sleep }}>
        IS THIS NORMAL?
      </Text>
      <Text style={{ fontFamily: fonts.display, fontSize: 30, color: palette.ink, marginTop: 6 }}>
        Reassure
      </Text>
      <Text
        style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: palette.inkSoft, marginTop: 2 }}>
        Quick, bounded guidance for tonight — never a diagnosis.
      </Text>

      {/* night-sky hero + voice orb (the signature moment) */}
      <ReassureHero>
        <VoiceOrb
          state={voice.state}
          reduceMotion={reduceMotion}
          onPress={onOrbPress}
          interimText={voice.interim}
        />
      </ReassureHero>

      {/* bounded promise — soft lavender, calm, never an alarm */}
      <View
        style={{
          backgroundColor: mode === 'night' ? 'rgba(85,96,198,0.17)' : colors.sleepTint,
          borderRadius: radii.small,
          borderWidth: mode === 'night' ? 1 : 0,
          borderColor: palette.border,
          paddingVertical: 13,
          paddingHorizontal: 15,
          marginTop: 13,
        }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18.5, color: palette.ink }}>
          Lullaby doesn’t diagnose or treat. If something feels urgent, call your doctor or your
          local emergency number.
        </Text>
      </View>

      {/* typed fallback + example chips → the same router */}
      <AskCard surfaceMode={mode} onAsk={ask} inputRef={inputRef} />

      {/* the bounded answer (topic / triage / out-of-scope) */}
      {answer !== null ? (
        <View
          onLayout={(event) => {
            answerYRef.current = event.nativeEvent.layout.y;
          }}>
          <AnswerCard
            result={answer}
            surfaceMode={mode}
            reduceMotion={reduceMotion}
            onDismiss={() => setAnswer(null)}
            onTriageAction={onTriageAction}
          />
        </View>
      ) : null}

      {/* tonight recap, grounded in the saved logs */}
      <Kicker text="Based on tonight's logs" color={palette.inkFaint} />
      <RecapCard surfaceMode={mode} recap={recap} readOverride={nightRead} />

      {/* common tonight */}
      <Kicker text="Common tonight" color={palette.inkFaint} />
      <TopicAccordion surfaceMode={mode} reduceMotion={reduceMotion} onToggle={onTopicToggle} />

      {/* quiet, persistent disclaimer (§8) — present, low-contrast, not a nag */}
      <Text
        style={{
          fontFamily: fonts.body,
          fontSize: 11.5,
          lineHeight: 17,
          color: palette.inkFaint,
          textAlign: 'center',
          marginTop: 20,
          paddingHorizontal: 12,
        }}>
        General information, not medical advice. When in doubt, call your pediatrician.
      </Text>
    </Screen>
  );
}
