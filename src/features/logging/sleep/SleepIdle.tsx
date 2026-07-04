/**
 * Logging v2 — Sleep start screen (plan Phase 6 idle UI).
 *
 * Two paths, no keyboard:
 *  - Start a live session now, or backdated ("started earlier") by the reference
 *    offset. The model accepts an arbitrary `startedAt`, so a real time picker
 *    can replace this later without changing business logic (plan 6.2).
 *  - Add an already-finished sleep from a separate duration stepper — this logs
 *    a completed event immediately and does NOT start a timer (plan 6.4).
 *
 * The session is created on Start (by the use-case), not while choosing between
 * the two visible menu cards.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, fonts } from '@/theme';
import { formatCompactDuration } from '../timer/sessionMath';
import { useElapsedTime } from '../timer/useElapsedTime';

type Props = {
  accentColor: string;
  accentTint: string;
  errorMessage?: string;
  lastCompletedSleepEndedAt: string | null;
  /** Start a sleep that began `minutesAgo` minutes before now (0 = now). */
  onStart: (minutesAgo: number) => void;
  /** Log an already-finished sleep of `minutesLong` ending now. Returns accepted. */
  onSaveCompleted: (minutesLong: number) => Promise<boolean>;
};

function MoonIcon({ color }: { color: string }) {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
        stroke={color}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Header({
  title,
  subtitle,
  errorMessage,
}: {
  title: string;
  subtitle: string;
  errorMessage?: string;
}) {
  return (
    <View style={{ alignItems: 'center', marginBottom: 20 }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 23, color: colors.ink, textAlign: 'center' }}>
        {title}
      </Text>
      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 13,
          color: colors.inkSoft,
          textAlign: 'center',
          marginTop: 3,
        }}>
        {subtitle}
      </Text>
      {errorMessage && (
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 12.5,
            color: colors.sleep,
            textAlign: 'center',
            marginTop: 8,
          }}>
          {errorMessage}
        </Text>
      )}
    </View>
  );
}

function ChoiceCard({
  title,
  subtitle,
  icon,
  accentTint,
  accessibilityLabel,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  accentTint: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        width: '100%',
        alignSelf: 'stretch',
        borderRadius: 20,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}>
      <View
        style={{
          width: '100%',
          height: 132,
          backgroundColor: colors.surfaceSoft,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 12,
          paddingVertical: 16,
        }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            backgroundColor: accentTint,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 9,
          }}>
          {icon}
        </View>
        <Text
          style={{
            fontFamily: fonts.displayMedium,
            fontSize: 15.5,
            color: colors.ink,
            textAlign: 'center',
          }}>
          {title}
        </Text>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: fonts.bodyBold,
            fontSize: 11.5,
            lineHeight: 15,
            color: colors.inkSoft,
            marginTop: 3,
            textAlign: 'center',
          }}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function SoftButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: '100%',
        borderRadius: 19,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}>
      <View
        style={{
          width: '100%',
          minHeight: 50,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceSoft,
          borderRadius: 19,
          paddingVertical: 15,
          paddingHorizontal: 16,
        }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink }}>{label}</Text>
      </View>
    </Pressable>
  );
}

function FilledButton({
  label,
  accentColor,
  disabled,
  onPress,
}: {
  label: string;
  accentColor: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        width: '100%',
        borderRadius: 20,
        opacity: disabled ? 0.5 : 1,
        transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
      })}>
      <View
        style={{
          width: '100%',
          minHeight: 52,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: accentColor,
          borderRadius: 20,
          paddingVertical: 17,
          paddingHorizontal: 16,
          shadowColor: accentColor,
          shadowOpacity: 0.38,
          shadowRadius: 13,
          shadowOffset: { width: 0, height: 9 },
          elevation: 8,
        }}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15.5, color: colors.white }}>{label}</Text>
      </View>
    </Pressable>
  );
}

function StepperButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 52,
        height: 52,
        borderRadius: 26,
        transform: [{ scale: pressed ? 0.92 : 1 }],
      })}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceSoft,
        }}>
        <Text style={{ fontFamily: fonts.body, fontSize: 26, color: colors.ink }}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function SleepIdle({
  accentColor,
  accentTint,
  errorMessage,
  lastCompletedSleepEndedAt,
  onStart,
  onSaveCompleted,
}: Props) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedMin, setCompletedMin] = useState(60);
  const [savingCompleted, setSavingCompleted] = useState(false);
  const awakeMs = useElapsedTime(lastCompletedSleepEndedAt, lastCompletedSleepEndedAt !== null);
  const idleSubtitle =
    lastCompletedSleepEndedAt === null ? 'Tap to start' : `Awake for ${formatCompactDuration(awakeMs)}`;

  const handleSaveCompleted = async () => {
    if (savingCompleted) return;
    setSavingCompleted(true);
    const ok = await onSaveCompleted(completedMin);
    if (!ok) setSavingCompleted(false);
  };

  const adjustCompleted = (delta: number) => {
    setCompletedMin((current) => Math.max(5, current + delta));
  };

  if (showCompleted) {
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to sleep options"
          onPress={() => setShowCompleted(false)}
          hitSlop={8}
          style={({ pressed }) => ({
            alignSelf: 'center',
            paddingHorizontal: 14,
            paddingVertical: 8,
            marginTop: -8,
            marginBottom: 2,
            opacity: pressed ? 0.55 : 1,
          })}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.inkSoft }}>
            ‹ Sleep options
          </Text>
        </Pressable>

        <Header title="Add completed sleep" subtitle="Ended just now · adjust duration" errorMessage={errorMessage} />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 26,
          }}>
          <StepperButton label="−" accessibilityLabel="Decrease sleep duration" onPress={() => adjustCompleted(-5)} />
          <View
            style={{
              minWidth: 120,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              marginHorizontal: 24,
            }}>
            <Text
              style={{
                fontFamily: fonts.display,
                fontSize: 42,
                color: colors.ink,
                fontVariant: ['tabular-nums'],
              }}>
              {completedMin}
            </Text>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.inkSoft, marginLeft: 3 }}>
              min
            </Text>
          </View>
          <StepperButton label="+" accessibilityLabel="Increase sleep duration" onPress={() => adjustCompleted(5)} />
        </View>

        <FilledButton
          label={`Save sleep · ${completedMin} min`}
          accentColor={accentColor}
          disabled={savingCompleted}
          onPress={handleSaveCompleted}
        />
      </View>
    );
  }

  return (
    <View>
      <Header title="Log sleep" subtitle={idleSubtitle} errorMessage={errorMessage} />

      <View style={{ width: '100%', alignSelf: 'stretch', flexDirection: 'row', marginBottom: 18 }}>
        <View style={{ flex: 1, minWidth: 0, marginRight: 6 }}>
          <ChoiceCard
            title="Start now"
            subtitle="The timer starts now"
            accessibilityLabel="Start sleep now"
            accentTint={accentTint}
            icon={<MoonIcon color={accentColor} />}
            onPress={() => onStart(0)}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: 6 }}>
          <ChoiceCard
            title="Started earlier"
            subtitle="Counts from 5 minutes ago"
            accessibilityLabel="Start sleep 5 minutes ago"
            accentTint={accentTint}
            icon={
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: accentColor }}>
                −5
              </Text>
            }
            onPress={() => onStart(5)}
          />
        </View>
      </View>

      <SoftButton label="Add a completed sleep" onPress={() => setShowCompleted(true)} />

      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 12.5,
          lineHeight: 18,
          color: colors.inkSoft,
          textAlign: 'center',
          marginTop: 15,
          marginHorizontal: 10,
        }}>
        You can also start and stop sleep from the home screen.
      </Text>
    </View>
  );
}

export default SleepIdle;
