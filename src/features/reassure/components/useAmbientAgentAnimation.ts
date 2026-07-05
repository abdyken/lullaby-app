/**
 * useAmbientAgentAnimation — the ambient orb's motion, on Reanimated (UI-thread
 * worklets, 60fps, identical on iOS + Android). It expresses Lullaby's calm
 * intelligence as ONE softly glowing halo with four conceptual states:
 *
 *   - resting / listening : a slow, low-amplitude breath (~5.2s ease-in-out yoyo)
 *   - thinking            : the same breath, deeper + a touch brighter (the orb
 *                           "leans in" while reading) — a calm pulse, NEVER a spinner
 *   - ready               : a one-shot "exhale" bloom fired on the thinking ->
 *                           not-thinking edge, i.e. when a read/answer resolves
 *
 * This is presentation only: it READS a phase + a `still` flag and returns an
 * animated style. It never triggers reads, gates content, or routes.
 *
 * Reduce Motion (or a degraded voice state) arrives as `still`: the breath rests
 * at neutral (scale exactly 1, a calm mid-opacity glow) and the ready exhale
 * never fires. `thinking` still lifts the glow statically so a screen-reader /
 * reduced-motion parent still sees the "reading" state, just without motion — a
 * calm still, never a frozen mid-animation pose.
 *
 * React Compiler order (the TabBarPill / OnboardingNightSky template):
 * useSharedValue -> useEffect(mutate .value) -> useAnimatedStyle(read).
 */
import { useEffect, useRef } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** The steady ambient phase. `ready` is emergent (the exhale on thinking's edge). */
export type OrbPhase = 'resting' | 'listening' | 'thinking';

// One breath cycle sits in the calm 4-7s band. The breath never changes speed
// (so switching phase never restarts / snaps the loop) — `thinking` differs by
// depth + glow, not tempo.
const BREATHE_PERIOD_MS = 5200;

const SCALE_AMP = 0.03; // resting breath: scale 1.0 -> 1.03
const SCALE_AMP_THINK = 0.02; // thinking adds depth: up to 1.0 -> 1.05
const OPACITY_REST = 0.6; // neutral glow (also the Reduce-Motion still frame)
const OPACITY_AMP = 0.28; // breath swings the glow up to +0.28
const THINK_GLOW = 0.16; // thinking lifts the base glow so it reads "present"

const BLOOM_SCALE = 0.06; // the ready exhale swells a touch past the breath
const BLOOM_OPACITY = 0.14;
const BLOOM_RISE_MS = 240;
const BLOOM_FALL_MS = 560;

const THINK_FADE_MS = 350; // smooth 250-500ms transition into / out of thinking

export function useAmbientAgentAnimation(phase: OrbPhase, still: boolean) {
  // 0..1 eased breath driver; 0..1 thinking intensity; 0..1 one-shot ready exhale.
  const breath = useSharedValue(0);
  const intensity = useSharedValue(0);
  const bloom = useSharedValue(0);
  const wasThinking = useRef(false);

  // Continuous breath. Fixed period, so a phase change never restarts it; it only
  // starts/stops with `still`. Rests at 0 (scale 1) when still.
  useEffect(() => {
    if (still) {
      cancelAnimation(breath);
      breath.value = 0;
      return;
    }
    breath.value = 0;
    breath.value = withRepeat(
      withTiming(1, { duration: BREATHE_PERIOD_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [still, breath]);

  // Thinking depth/glow. Animates smoothly when moving; snaps (0ms) when still so
  // the "reading" state is shown statically with no motion.
  useEffect(() => {
    intensity.value = withTiming(phase === 'thinking' ? 1 : 0, {
      duration: still ? 0 : THINK_FADE_MS,
      easing: Easing.out(Easing.quad),
    });
  }, [phase, still, intensity]);

  // Ready exhale: a single gentle bloom when thinking resolves (thinking ->
  // not-thinking edge). Never fires while still.
  useEffect(() => {
    const isThinking = phase === 'thinking';
    const justResolved = wasThinking.current && !isThinking;
    wasThinking.current = isThinking;
    if (justResolved && !still) {
      bloom.value = 0;
      bloom.value = withSequence(
        withTiming(1, { duration: BLOOM_RISE_MS, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: BLOOM_FALL_MS, easing: Easing.out(Easing.quad) }),
      );
    }
  }, [phase, still, bloom]);

  const haloStyle = useAnimatedStyle(() => {
    const b = breath.value;
    const scale = 1 + (SCALE_AMP + SCALE_AMP_THINK * intensity.value) * b + BLOOM_SCALE * bloom.value;
    const opacity =
      OPACITY_REST + THINK_GLOW * intensity.value + OPACITY_AMP * b + BLOOM_OPACITY * bloom.value;
    return {
      opacity: opacity > 1 ? 1 : opacity,
      transform: [{ scale }],
    };
  });

  return { haloStyle };
}
