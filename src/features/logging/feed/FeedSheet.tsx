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
import { useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows } from '@/theme';

import { newClientEventId } from '../domain/ids';
import type { BreastSide, MilkType } from '../domain/types';
import { useLogging } from '../state/LoggingProvider';
import { confirmDiscardSession } from '../ui/confirmDiscardSession';
import { BottleFeedForm } from './BottleFeedForm';
import { BreastFeedActive } from './BreastFeedActive';
import { BreastFeedIdle } from './BreastFeedIdle';
import { ChoicePill } from './ChoicePill';

type FeedTab = 'breast' | 'bottle';

type Props = {
  onClose: () => void;
};

export function FeedSheet({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const {
    activeBreastFeed,
    error,
    clearError,
    startBreast,
    switchBreast,
    finishBreast,
    cancelBreast,
    saveBottle,
  } = useLogging();

  const [tab, setTab] = useState<FeedTab>('breast');
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
    if (ok) handleClose();
    return ok;
  };

  const isActive = activeBreastFeed !== null;
  const title = isActive ? 'Breastfeeding in progress' : 'Log a feed';
  const subtitle = isActive ? 'Switch sides or finish anytime' : 'Breast session or bottle';

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

          <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.ink }}>{title}</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint, marginTop: 2 }}>
            {subtitle}
          </Text>

          {error && (
            <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: accentColor, marginTop: 8 }}>
              {error.message}
            </Text>
          )}

          {/* Breast / Bottle tabs — hidden while a breast session is running. */}
          {!isActive && (
            <View style={{ flexDirection: 'row', gap: 9, marginTop: 16 }}>
              <ChoicePill
                label="Breast"
                active={tab === 'breast'}
                accentColor={accentColor}
                accentTint={accentTint}
                onPress={() => setTab('breast')}
              />
              <ChoicePill
                label="Bottle"
                active={tab === 'bottle'}
                accentColor={accentColor}
                accentTint={accentTint}
                onPress={() => setTab('bottle')}
              />
            </View>
          )}

          {isActive ? (
            <BreastFeedActive
              event={activeBreastFeed}
              accentColor={accentColor}
              accentTint={accentTint}
              onSwitch={(side: BreastSide) => {
                void switchBreast(side);
              }}
              onFinish={handleFinish}
              onCancel={handleCancel}
            />
          ) : tab === 'breast' ? (
            <BreastFeedIdle
              accentColor={accentColor}
              accentTint={accentTint}
              onStart={(side: BreastSide) => {
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
