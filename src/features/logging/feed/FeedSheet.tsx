/**
 * FeedSheet — bottom sheet for the logging v2 Feed flow.
 *
 * Contains two tabs: Breast (active session with side timers) and Bottle
 * (instant quantity event). Opening the sheet never logs anything; each
 * sub-form handles its own save/start action.
 *
 * If an active breast-feed session already exists and the Breast tab is
 * selected, BreastFeedActive is shown instead of BreastFeedIdle so the
 * caregiver continues the running session without accidentally creating a new one.
 */
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radii, shadows } from '@/theme';
import { systemClock } from '../domain/types';
import type { MilkType } from '../domain/types';
import { useLoggingStore } from '../state/loggingStore';
import { buildStartBreastFeedEvent } from '../application/startBreastFeed';
import { buildSwitchBreastSideEvent } from '../application/switchBreastSide';
import { buildFinishBreastFeedEvent } from '../application/finishBreastFeed';
import { buildSaveBottleFeedEvent } from '../application/saveBottleFeed';
import { BreastFeedIdle } from './BreastFeedIdle';
import { BreastFeedActive } from './BreastFeedActive';
import { BottleFeedForm } from './BottleFeedForm';

const ACCENT = colors.feed;
const TINT = colors.feedTint;

type FeedTab = 'breast' | 'bottle';

interface Props {
  familyId: string;
  childId: string;
  userId: string;
  onClose: () => void;
}

export function FeedSheet({ familyId, childId, userId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const store = useLoggingStore();

  const hasActiveBreastFeed = store.activeBreastFeed !== null;
  const [tab, setTab] = useState<FeedTab>(hasActiveBreastFeed ? 'breast' : 'breast');

  // ── Breast: start ────────────────────────────────────────────────────────
  const handleBreastStart = async (side: 'left' | 'right') => {
    if (store.activeBreastFeed) return; // guard: session already running
    const event = buildStartBreastFeedEvent({
      familyId,
      childId,
      createdByUserId: userId,
      side,
      startedAt: systemClock.nowIso(),
    });
    await store.startSession(event);
  };

  // ── Breast: switch side ───────────────────────────────────────────────────
  const handleBreastSwitch = async (side: 'left' | 'right') => {
    if (!store.activeBreastFeed) return;
    const updated = buildSwitchBreastSideEvent({
      event: store.activeBreastFeed,
      newSide: side,
      nowIso: systemClock.nowIso(),
    });
    await store.updateSession(updated);
  };

  // ── Breast: finish ───────────────────────────────────────────────────────
  const handleBreastFinish = async () => {
    if (!store.activeBreastFeed) return;
    const finished = buildFinishBreastFeedEvent({
      event: store.activeBreastFeed,
      endedAt: systemClock.nowIso(),
    });
    await store.finishSession(finished);
    onClose();
  };

  // ── Breast: cancel ───────────────────────────────────────────────────────
  const handleBreastCancel = async () => {
    if (!store.activeBreastFeed) return;
    await store.cancelSession(store.activeBreastFeed.id);
    onClose();
  };

  // ── Bottle: save ─────────────────────────────────────────────────────────
  const handleBottleSave = async (amountMl: number, milkType: MilkType) => {
    const event = buildSaveBottleFeedEvent({
      familyId,
      childId,
      createdByUserId: userId,
      amountMl,
      milkType,
      occurredAt: systemClock.nowIso(),
    });
    await store.createEvent(event);
    onClose();
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Scrim */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
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
          {/* Grab handle */}
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

          {/* Title */}
          <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.ink }}>
            {tab === 'breast' && store.activeBreastFeed ? 'Breastfeeding' : 'Feed'}
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.inkFaint, marginTop: 2 }}>
            Just now
          </Text>

          {/* Tabs */}
          <View style={{ flexDirection: 'row', gap: 9, marginTop: 16 }}>
            {(['breast', 'bottle'] as const).map((t) => {
              const active = tab === t;
              return (
                <Pressable
                  key={t}
                  accessibilityRole="tab"
                  accessibilityLabel={t.charAt(0).toUpperCase() + t.slice(1)}
                  accessibilityState={{ selected: active }}
                  onPress={() => setTab(t)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 16,
                    borderRadius: radii.pill,
                    backgroundColor: active ? TINT : colors.surfaceSoft,
                    borderWidth: 2,
                    borderColor: active ? ACCENT : 'transparent',
                  }}>
                  <Text
                    style={{
                      fontFamily: fonts.bodyBold,
                      fontSize: 13,
                      color: active ? ACCENT : colors.inkSoft,
                    }}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Body */}
          <View style={{ marginTop: 20 }}>
            {tab === 'breast' ? (
              store.activeBreastFeed ? (
                <BreastFeedActive
                  event={store.activeBreastFeed}
                  accentColor={ACCENT}
                  accentTint={TINT}
                  onSwitchSide={handleBreastSwitch}
                  onFinish={handleBreastFinish}
                  onCancel={handleBreastCancel}
                />
              ) : (
                <BreastFeedIdle
                  accentColor={ACCENT}
                  accentTint={TINT}
                  onStart={handleBreastStart}
                />
              )
            ) : (
              <BottleFeedForm accentColor={ACCENT} accentTint={TINT} onSave={handleBottleSave} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
