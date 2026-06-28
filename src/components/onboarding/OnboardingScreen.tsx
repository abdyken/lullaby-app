/**
 * OnboardingScreen — the live, personalized first-run setup flow (onboarding
 * Phase 1A, roadmap §7/§10/§11/§12).
 *
 * Replaces the old 3-panel value carousel: one warm emotional beat → the one
 * question that matters (age + optional name) → a real handoff into Tonight. The
 * shared `<Orb>` is the protagonist: it stays put across steps (one instance, so
 * it keeps breathing and "follows the parent home"), its sky tone tracks the
 * chosen age, and the baby's name settles into its core.
 *
 * Driven by `useOnboardingFlow` (step STATE, never a scroll index — recorded
 * blank-frame postmortem). Completion writes a real local baby via
 * `useAuth().createLocalBaby` with the §11 ordering (write baby → clear the seed
 * night → mark complete → reveal), so the seed "Mia" never reaches Tonight. The
 * fake "Setting up..." button label is gone — the `creating` step is a true
 * transition.
 *
 * Night-safe: the surface is resolved once at entry (`resolveSurfaceMode`), so the
 * first frame at 3am is the low-glare navy scaffold + night orb, not a cream shock.
 */
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Orb, type OrbSky } from '@/components/Orb';
import { AuthButton } from '@/components/auth/AuthShell';
import { birthDateFromWeeks, type CreateLocalBabyInput } from '@/data/localBaby';
import { useAuth } from '@/state/AuthProvider';
import {
  colors,
  fonts,
  radii,
  resolveSurfaceMode,
  surfaces,
  type SurfaceMode,
  type SurfacePalette,
} from '@/theme';

import { OnboardingStepLayout } from './OnboardingStepLayout';
import { useOnboardingFlow } from './useOnboardingFlow';

type Props = {
  onComplete: () => Promise<void> | void;
};

/**
 * Coarse, one-thumb age control (roadmap §7C): three buckets → a representative
 * number of weeks → `birthDate`, plus the orb sky each maps to (newborn → night,
 * a few weeks → dusk, a few months → day). No keyboard on the critical path.
 */
type AgeChoice = { key: string; label: string; hint: string; weeks: number; sky: OrbSky };
const AGE_CHOICES: AgeChoice[] = [
  { key: 'newborn', label: 'Newborn', hint: 'The first weeks', weeks: 1, sky: 'night' },
  { key: 'weeks', label: 'A few weeks', hint: 'Around one to two months', weeks: 6, sky: 'dusk' },
  { key: 'months', label: 'A few months', hint: 'Three months and up', weeks: 14, sky: 'day' },
];

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}

/** Small uppercase field label, tinted for the resolved surface. */
function FieldLabel({ surface, text }: { surface: SurfacePalette; text: string }) {
  return (
    <Text
      style={{
        fontFamily: fonts.bodyBold,
        fontSize: 10,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: surface.inkSoft,
        marginBottom: 6,
      }}>
      {text}
    </Text>
  );
}

/** Selection indicator for the age pills — night-safe (accent ring/dot, no bright fill). */
function SelectDot({ active }: { active: boolean }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: active ? colors.sleep : colors.inkFaint,
      }}>
      {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.sleep }} /> : null}
    </View>
  );
}

/**
 * The coarse age picker. Stacked full-width pills (one-thumb, roadmap §4) that
 * indicate selection with an accent border + dot rather than a bright tint fill,
 * so the control reads cleanly in both day and the night surface.
 */
function AgePicker({
  surface,
  value,
  onChange,
}: {
  surface: SurfacePalette;
  value: string | null;
  onChange: (key: string) => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      {AGE_CHOICES.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${opt.label}. ${opt.hint}`}
            onPress={() => onChange(opt.key)}
            style={({ pressed }) => ({
              minHeight: 58,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              borderRadius: radii.medium,
              backgroundColor: surface.card,
              borderWidth: active ? 2 : 1,
              borderColor: active ? colors.sleep : surface.line,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            })}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: surface.ink }}>{opt.label}</Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 12, color: surface.inkSoft, marginTop: 1 }}>
                {opt.hint}
              </Text>
            </View>
            <SelectDot active={active} />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Optional baby-name input. A local, surface-tinted field rather than the shared
 * `AuthField` (which hardcodes the day palette) so the night scaffold stays
 * low-glare. Name is optional and off the critical path (the keyboard never
 * blocks the bottom CTA — the orb is pinned top, the CTA bottom).
 */
function NameField({
  surface,
  value,
  onChangeText,
}: {
  surface: SurfacePalette;
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View>
      <FieldLabel surface={surface} text="Baby's name (optional)" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="e.g. Mia"
        placeholderTextColor={surface.inkFaint}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={40}
        style={{
          fontFamily: fonts.body,
          fontSize: 15,
          color: surface.ink,
          backgroundColor: surface.card,
          borderRadius: radii.small,
          borderWidth: 1,
          borderColor: surface.line,
          paddingHorizontal: 14,
          paddingVertical: 13,
        }}
      />
    </View>
  );
}

/** Low-emphasis text action (Begin's "Set up later", baby step's Back / Skip). */
function LinkButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color }}>{label}</Text>
    </Pressable>
  );
}

export function OnboardingScreen({ onComplete }: Props) {
  const flow = useOnboardingFlow();
  const { createLocalBaby } = useAuth();
  const reduceMotion = useReduceMotion();

  // Resolve night/day ONCE at entry so the very first frame is night-safe (§10).
  const [mode] = useState<SurfaceMode>(() => resolveSurfaceMode('auto', new Date().getHours()));
  const surface = surfaces[mode];
  const entrySky: OrbSky = mode === 'night' ? 'night' : 'day';

  const [ageKey, setAgeKey] = useState<string | null>(null);
  const [name, setName] = useState('');

  const selectedAge = AGE_CHOICES.find((a) => a.key === ageKey) ?? null;
  const trimmedName = name.trim();
  const displayName = trimmedName.length > 0 ? trimmedName : null;

  // Freeze the orb's breathe under Reduce Motion (recorded theme-reveal gotcha: a
  // static orb must not run its loop). An un-animated external value keeps it
  // still; omitting it lets `<Orb>` run its own gentle loop.
  const [frozenBreathe] = useState(() => new Animated.Value(0));
  const orbBreathe = reduceMotion ? frozenBreathe : undefined;

  // What we persist on reaching `creating` (skip → {} defaults; submit → answers).
  const pendingInputRef = useRef<CreateLocalBabyInput>({});
  const completingRef = useRef(false);

  // Run the real completion exactly once on entering `creating`: write the local
  // baby + clear the seed night (createLocalBaby), then mark complete + reveal
  // Tonight (onComplete) — the §11 ordering. Both calls swallow storage errors, so
  // this cannot trap a parent mid-setup.
  useEffect(() => {
    if (flow.step !== 'creating' || completingRef.current) return;
    completingRef.current = true;
    let active = true;
    (async () => {
      try {
        await createLocalBaby(pendingInputRef.current);
      } catch {
        // best-effort local write — losing it is not worth stranding the parent
      }
      try {
        await onComplete();
      } catch {
        if (active) {
          completingRef.current = false;
          flow.reset(); // recover to the beat rather than hanging on `creating`
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [flow, createLocalBaby, onComplete]);

  const skyForStep: OrbSky = flow.step === 'beat' ? entrySky : (selectedAge?.sky ?? entrySky);
  const orb = (
    <Orb
      state="sleep"
      skyTone={skyForStep}
      eyebrow={flow.step === 'beat' ? 'LULLABY' : 'TONIGHT'}
      timerText={flow.step === 'beat' ? 'Tonight' : (displayName ?? 'Your baby')}
      progress={flow.step === 'beat' ? 0.34 : flow.step === 'baby' ? 0.67 : 1}
      breathe={orbBreathe}
    />
  );

  if (flow.step === 'beat') {
    return (
      <OnboardingStepLayout
        mode={mode}
        orb={orb}
        title="Lullaby"
        subtitle="A calm place for the night shift."
        cta={<AuthButton label="Begin" onPress={flow.begin} />}
        secondaryCta={
          <LinkButton
            label="Set up later"
            color={colors.sleep}
            onPress={() => {
              pendingInputRef.current = {};
              flow.skip();
            }}
          />
        }>
        <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: surface.inkSoft }}>
          The hard hours are easier with a little help.
        </Text>
      </OnboardingStepLayout>
    );
  }

  if (flow.step === 'baby') {
    const onContinue = () => {
      if (!selectedAge) return;
      pendingInputRef.current = {
        babyName: displayName,
        birthDate: birthDateFromWeeks(selectedAge.weeks),
      };
      flow.submit();
    };
    return (
      <OnboardingStepLayout
        mode={mode}
        orb={orb}
        title="How old is your baby?"
        subtitle="Pick what's closest — you can change this anytime."
        cta={<AuthButton label="Continue" onPress={onContinue} disabled={!selectedAge} />}
        secondaryCta={
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <LinkButton label="Back" color={surface.inkSoft} onPress={flow.back} />
            <LinkButton
              label="Skip for now"
              color={colors.sleep}
              onPress={() => {
                pendingInputRef.current = {};
                flow.skip();
              }}
            />
          </View>
        }>
        <AgePicker surface={surface} value={ageKey} onChange={setAgeKey} />
        <NameField surface={surface} value={name} onChangeText={setName} />
        <Text style={{ fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: surface.inkFaint }}>
          Stays on this phone. No account needed.
        </Text>
      </OnboardingStepLayout>
    );
  }

  // `creating` — the real handoff into Tonight (no fake "Setting up..." label).
  return (
    <OnboardingStepLayout
      mode={mode}
      orb={orb}
      title={displayName ? `Getting ${displayName}'s night ready…` : 'Getting your night ready…'}
      subtitle="Just a moment."
      cta={
        <View style={{ alignItems: 'center' }}>
          <ActivityIndicator color={colors.sleep} />
        </View>
      }
    />
  );
}

export default OnboardingScreen;
