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
import {
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '@/components/Screen';
import { AiConsentCard } from '@/features/reassure/components/AiConsentCard';
import { AiReadNote } from '@/features/reassure/components/AiReadNote';
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
import { KB } from '@/features/reassure/content/kb';
import { clinicalContentVisible } from '@/features/reassure/domain/contentGate';
import { currentContextWindowFor } from '@/features/reassure/domain/nightWindow';
import { buildReassureRecap, recapHeading } from '@/features/reassure/domain/recap';
import { route } from '@/features/reassure/domain/router';
import type { AskSource, ReassureTopicKey, RouteResult } from '@/features/reassure/domain/types';
import { useAnalytics } from '@/lib/useAnalytics';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { useTheme } from '@/state/ThemeProvider';
import { colors, fonts, radii, surfaces, tabbar } from '@/theme';

const REASSURE_TABBAR_EXTRA_CLEARANCE = tabbar.height + 64;

/* Draft-content release gate: the clinical KB surfaces (topic accordion, topic
 * answer blocks) are dev-only while REASSURE_CONTENT.status is 'draft'. Triage,
 * guides, and the code-computed recap render regardless (domain/contentGate.ts). */
const showClinical = clinicalContentVisible(__DEV__);

type VoiceFallback = {
  message: string;
  kind: 'unavailable' | 'permission_denied' | 'retryable';
};

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
  const [voiceFallback, setVoiceFallback] = useState<VoiceFallback | null>(null);

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
        const window = currentContextWindowFor(now);
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
  const {
    read: nightRead,
    status: nightReadStatus,
    needsConsent,
    grantConsent,
    declineConsent,
  } = useNightRead(recap);
  const currentRecapHeading = recapHeading(recap);

  const scrollToAnswer = useCallback(
    (delayMs = 120) => {
      setTimeout(() => {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({
            y: Math.max(0, answerYRef.current - 24),
            animated: !reduceMotion,
          });
        });
      }, delayMs);
    },
    [reduceMotion],
  );

  /** The single funnel: every input path lands here. Never routes empty text. */
  const ask = useCallback(
    (text: string, source: AskSource) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      // Ground logs_summary asks: only point at the recap when there's data in it.
      const result = route(trimmed, { hasLogs: !recap.isEmpty });
      if (source === 'text' || source === 'voice') Keyboard.dismiss();
      setVoiceFallback(null);
      setAnswer(result);
      // PRIVACY: coarse enums only — the raw ask text is never sent to analytics.
      track('reassure_asked', {
        source,
        route_kind: result.kind,
        topic: result.kind === 'topic' ? result.key : null,
      });
      if (result.kind === 'triage') track('reassure_triage_shown');
      // Bring the answer into view once it has risen in.
      scrollToAnswer(source === 'text' ? 260 : 120);
    },
    [recap.isEmpty, scrollToAnswer, track],
  );

  const showVoiceFallback = useCallback((message: string, kind: VoiceFallback['kind']) => {
    setVoiceFallback({ message, kind });
  }, []);

  const focusAskInputWithHint = useCallback((message: string, kind: VoiceFallback['kind']) => {
    setVoiceFallback({ message, kind });
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const openVoiceSettings = useCallback(() => {
    void Linking.openSettings().catch(() => {
      inputRef.current?.focus();
    });
  }, []);

  const focusTypeInstead = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const voice = useVoiceInput({
    onTranscript: (text) => ask(text, 'voice'),
    onListeningStart: () => {
      setVoiceFallback(null);
      track('reassure_voice_used');
    },
    onDenied: () => {
      track('reassure_voice_permission_denied');
      showVoiceFallback('Microphone permission is off. You can open settings or type instead.', 'permission_denied');
    },
    onUnavailable: () => {
      focusAskInputWithHint('Voice is unavailable in this build, so you can type your question here.', 'unavailable');
    },
    onNoMatch: () => {
      showVoiceFallback("I didn't catch that. You can try again or type instead.", 'retryable');
    },
    onError: () => {
      showVoiceFallback("Voice didn't catch that. You can try again or type instead.", 'retryable');
    },
  });

  const retryVoice = useCallback(() => {
    setVoiceFallback(null);
    voice.retry();
  }, [voice]);

  const onOrbPress = useCallback(() => {
    if (voice.state === 'unavailable') {
      focusAskInputWithHint('Voice is unavailable in this build, so you can type your question here.', 'unavailable');
      return;
    }
    if (voice.state === 'permission_denied') {
      showVoiceFallback('Microphone permission is off. You can open settings or type instead.', 'permission_denied');
      return;
    }
    voice.tapOrb();
  }, [focusAskInputWithHint, showVoiceFallback, voice]);

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

  const onAskTopic = useCallback(
    (key: ReassureTopicKey) => {
      ask(KB[key].title, 'chip');
    },
    [ask],
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Screen
        surfaceMode={mode}
        scrollRef={scrollRef}
        bottomGapExtra={REASSURE_TABBAR_EXTRA_CLEARANCE}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
      {/* One calm header line. The "is this normal?" question now lives in the
          hero; the non-medical disclaimer lives in the quiet footer (RG3) and the
          bounded-promise card, so it is not repeated here. */}
      <Text style={{ fontFamily: fonts.display, fontSize: 30, color: palette.ink }}>
        Reassure
      </Text>
      <Text
        style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: palette.inkSoft, marginTop: 2 }}>
        A calm companion for the small hours.
      </Text>

      {/* night-sky hero + ambient agent orb (the signature moment). The orb
          READS the night-read status only — it reflects Resting/Thinking/Ready
          and never triggers a read, gates content, or routes. */}
      <ReassureHero>
        <VoiceOrb
          state={voice.state}
          reduceMotion={reduceMotion}
          onPress={onOrbPress}
          interimText={voice.interim}
          nightReadStatus={nightReadStatus}
          isResolving={nightReadStatus === 'loading'}
        />
      </ReassureHero>

      {voice.volumeHint ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            marginTop: 10,
            fontFamily: fonts.bodyBold,
            fontSize: 12.5,
            lineHeight: 18.5,
            color: palette.inkSoft,
            textAlign: 'center',
          }}>
          {voice.volumeHint}
        </Text>
      ) : null}

      {voiceFallback ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            marginTop: 10,
            paddingHorizontal: 6,
            alignItems: 'center',
          }}>
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 12.5,
              lineHeight: 18.5,
              color: palette.inkSoft,
              textAlign: 'center',
            }}>
            {voiceFallback.message}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 9 }}>
            {voiceFallback.kind === 'retryable' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Try voice again"
                onPress={retryVoice}
                style={({ pressed }) => ({
                  backgroundColor: colors.sleepTint,
                  borderWidth: 1.5,
                  borderColor: colors.sleep,
                  borderRadius: radii.pill,
                  minHeight: 44,
                  paddingHorizontal: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                })}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.sleep }}>
                  Try again
                </Text>
              </Pressable>
            ) : null}
            {voiceFallback.kind === 'permission_denied' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open microphone settings"
                onPress={openVoiceSettings}
                style={({ pressed }) => ({
                  backgroundColor: colors.sleep,
                  borderRadius: radii.pill,
                  minHeight: 44,
                  paddingHorizontal: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                })}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.white }}>
                  Open Settings
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Type instead"
              onPress={focusTypeInstead}
              style={({ pressed }) => ({
                backgroundColor: colors.sleepTint,
                borderWidth: 1.5,
                borderColor: colors.sleep,
                borderRadius: radii.pill,
                minHeight: 44,
                paddingHorizontal: 20,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.sleep }}>
                Type instead
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

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
          testID="reassure-answer-scroll-target"
          onLayout={(event) => {
            answerYRef.current = event.nativeEvent.layout.y;
            scrollToAnswer(0);
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
      <Kicker text={currentRecapHeading} color={palette.inkFaint} />
      <RecapCard surfaceMode={mode} recap={recap} readOverride={nightRead} />

      {/* While the AI read is resolving, a calm, honest "reading" line — only for
          AI-eligible + consented parents. The local read above is already fully
          shown, so this never blocks; it disappears the moment the read resolves. */}
      {nightReadStatus === 'loading' ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontFamily: fonts.body,
            fontSize: 12,
            lineHeight: 17.5,
            color: palette.inkFaint,
            marginTop: 8,
            paddingHorizontal: 2,
          }}>
          Reading tonight’s logs…
        </Text>
      ) : null}

      {/* Honest label under the read: an 'AI-phrased' badge when the AI read is
          showing, or a calm 'AI read isn't available' note when we tried and it
          didn't come through. Renders nothing while idle/loading. */}
      <AiReadNote surfaceMode={mode} status={nightReadStatus} />

      {/* one-time AI consent notice — only for AI-eligible parents who have not
          yet decided. The recap above is already fully rendered without AI. */}
      {needsConsent ? (
        <AiConsentCard surfaceMode={mode} onGrant={grantConsent} onDecline={declineConsent} />
      ) : null}

      {/* common tonight — clinical KB blocks, hidden in public builds until clinician sign-off */}
      {showClinical ? (
        <>
          <Kicker text="Common tonight" color={palette.inkFaint} />
          <TopicAccordion
            surfaceMode={mode}
            reduceMotion={reduceMotion}
            onToggle={onTopicToggle}
            onAskTopic={onAskTopic}
          />
        </>
      ) : null}

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
    </KeyboardAvoidingView>
  );
}
