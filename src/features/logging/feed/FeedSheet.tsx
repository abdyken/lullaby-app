/**
 * Logging v2 — Feed bottom sheet (plan §7.2 LoggingSheet, Phases 3 & 5).
 *
 * One container, two purpose-built bodies — NOT a universal form with conditional
 * fields. Breast is an active session (idle → running → finish/cancel); Bottle is
 * an instant quantity event. When a breastfeeding session is already running, the
 * sheet opens straight into the active view (the same session the Feed card and a
 * future Hero will control — a single source of truth).
 *
 * Built on RN's own Modal (no new dependency), in the existing design language
 * (cream surface, grab handle, feed accent). Reads the feature API from
 * `useLogging()`; all business logic lives in the use-cases behind it.
 */
import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hapticSave } from '@/lib/haptics';
import { colors, fonts, radii, shadows } from '@/theme';

import { newClientEventId } from '../domain/ids';
import { isBreastFeed, type BreastFeedEvent, type BreastSide, type MilkType } from '../domain/types';
import { useLogging } from '../state/LoggingProvider';
import { confirmDiscardSession } from '../ui/confirmDiscardSession';
import { BottleFeedForm } from './BottleFeedForm';
import { BreastFeedActive } from './BreastFeedActive';
import { BreastFeedIdle } from './BreastFeedIdle';
import { FeedSegmentedControl, type FeedSegmentedOption } from './FeedSegmentedControl';

type FeedTab = 'breast' | 'bottle';

type Props = {
  onClose: () => void;
};

const FEED_TAB_OPTIONS: FeedSegmentedOption<FeedTab>[] = [
  { value: 'breast', label: 'Breast' },
  { value: 'bottle', label: 'Bottle' },
];

// Remembered last feed method for the session (in-memory, resets on app restart
// — mirrors BottleFeedForm's lastAmountMl). The sheet opens on whichever method
// the parent committed to last, so a bottle parent doesn't re-tap the Bottle tab
// every feed. Set only on a real start/save, never on an idle tab peek.
let lastFeedMethod: FeedTab = 'breast';

function formatStartedAt(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function FeedSheet({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const {
    todayEvents,
    activeBreastFeed,
    error,
    clearError,
    startBreast,
    switchBreast,
    finishBreast,
    cancelBreast,
    saveBottle,
  } = useLogging();

  const [tab, setTab] = useState<FeedTab>(lastFeedMethod);

  // Pre-select the breast the parent is likely to use: the opposite of the last
  // completed breast feed's final side (babies alternate). Read-only over the
  // existing today events — this only seeds the selector; what gets saved is
  // unchanged (the parent still confirms with Start). Falls back to Left when
  // there's no prior breast feed to alternate from.
  const defaultBreastSide = useMemo<BreastSide>(() => {
    const lastBreast = [...todayEvents]
      .filter((e): e is BreastFeedEvent => isBreastFeed(e) && e.status === 'completed')
      .sort((a, b) => Date.parse(b.endedAt ?? b.occurredAt) - Date.parse(a.endedAt ?? a.occurredAt))[0];
    const segments = lastBreast?.details.segments ?? [];
    const lastSide = segments.length > 0 ? segments[segments.length - 1].side : null;
    return lastSide === 'left' ? 'right' : 'left';
  }, [todayEvents]);
  // One idempotency key per sheet-open: a double-tap on Save dedupes to one event.
  const bottleClientId = useRef(newClientEventId());

  const accentColor = colors.feed;
  const accentTint = colors.feedTint;

  const handleClose = () => {
    clearError();
    onClose();
  };

  const handleFinish = async () => {
    await finishBreast();
    handleClose();
  };

  // Cancel discards an in-progress feed with no Undo, so confirm first (plan §10).
  const handleCancel = () =>
    confirmDiscardSession('feeding session', () => {
      void cancelBreast().then(handleClose);
    });

  const handleSaveBottle = async (amountMl: number, milkType: MilkType): Promise<boolean> => {
    const ok = await saveBottle({ amountMl, milkType, clientEventId: bottleClientId.current });
    if (ok) {
      lastFeedMethod = 'bottle';
      handleClose();
    }
    return ok;
  };

  const isActive = activeBreastFeed !== null;
  const title = isActive ? 'Breastfeeding in progress' : 'Log a feed';
  const activeStartedLabel = isActive ? formatStartedAt(activeBreastFeed.startedAt) : '';
  const subtitle = isActive
    ? activeStartedLabel
      ? `Started ${activeStartedLabel}`
      : 'Switch sides or finish anytime'
    : 'Breast or bottle';

  return (
    <Modal transparent visible animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={handleClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(46,42,64,0.35)',
          }}
        />

        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radii.large,
            borderTopRightRadius: radii.large,
            paddingTop: 10,
            paddingHorizontal: 18,
            paddingBottom: insets.bottom + 18,
            ...shadows.soft,
          }}>
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.line,
              marginBottom: 14,
            }}
          />

          <Text
            style={{
              fontFamily: fonts.display,
              fontSize: isActive ? 23 : 20,
              color: colors.ink,
              textAlign: isActive ? 'center' : 'left',
            }}>
            {title}
          </Text>
          <Text
            style={{
              fontFamily: fonts.bodyBold,
              fontSize: 13,
              color: colors.inkSoft,
              marginTop: 2,
              textAlign: isActive ? 'center' : 'left',
            }}>
            {subtitle}
          </Text>

          {error && (
            <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: accentColor, marginTop: 8 }}>
              {error.message}
            </Text>
          )}

          {/* Breast / Bottle tabs — hidden while a breast session is running. */}
          {!isActive && (
            <View style={{ width: '100%', alignSelf: 'stretch', marginTop: 16 }}>
              <FeedSegmentedControl value={tab} options={FEED_TAB_OPTIONS} onChange={setTab} />
            </View>
          )}

          {isActive ? (
            <BreastFeedActive
              event={activeBreastFeed}
              accentColor={accentColor}
              onSwitch={(side: BreastSide) => {
                void switchBreast(side);
              }}
              onFinish={handleFinish}
              onCancel={handleCancel}
            />
          ) : tab === 'breast' ? (
            <BreastFeedIdle
              accentColor={accentColor}
              defaultSide={defaultBreastSide}
              onStart={(side: BreastSide) => {
                lastFeedMethod = 'breast';
                hapticSave();
                void startBreast(side);
              }}
            />
          ) : (
            <BottleFeedForm accentColor={accentColor} accentTint={accentTint} onSave={handleSaveBottle} />
          )}
        </View>
      </View>
    </Modal>
  );
}

export default FeedSheet;
