# Logging UI Reference Audit

Scope: UI-only audit of the current React Native / Expo logging flows against `.reference/preview.html`. This document intentionally does not propose data-model, persistence, timer, or event-creation changes.

Reference checked: Expo SDK v56 docs were reviewed before code inspection per `AGENTS.md`; no app code was edited.

## High-Level Alignment

The app already carries the strongest reference foundations:

- Exact event colors are present in `src/theme/index.ts`: feed `#FF7A3D`, sleep `#5560C6`, diaper `#23B79E`, pump/growth `#FFB12E`.
- Fredoka and Nunito are loaded in `src/app/_layout.tsx`.
- Cards and shadows generally use the warm brown-tinted design language from the reference.
- The logging v2 flows are purpose-built at the interaction level, not generic forms.

The main mismatches are visual hierarchy and sheet/toast chrome: the native UI is more compact, left-aligned, and system-like than the HTML reference.

## Mismatch 1: App Background Is Flat Cream, Not Warm Headspace-Like Atmosphere

Current behavior / UI:
The Today screen uses a flat surface background from `surfaces[mode].bg`, usually `#FBF4EF`. `Screen` applies this directly to the `ScrollView`.

Reference behavior / UI:
The HTML places the phone on `#FBF4EF`, but the overall reference visual language is warmer and atmospheric, with radial peach/lavender/mint glows around the phone and the same soft warmth echoed in the app surfaces. See `.reference/preview.html` lines 35-43 and 55-57.

File/component likely responsible:
`src/components/Screen.tsx` lines 34-53, `src/theme/index.ts` lines 23-27 and 164-178.

Safe implementation plan:
Keep `surfaces.day.bg` and app state unchanged. Add a purely presentational background layer or gradient wrapper behind Today content, scoped to visual rendering. Use static warm radial/linear shapes or a React Native gradient layer that does not affect scroll metrics, taps, or event state. Verify contrast in day and night modes.

Risks:
Gradients can band or render differently on Android. If placed inside the scroll content instead of behind it, they may change layout height or introduce tab-bar gaps.

## Mismatch 2: Today Hero Orb Is Smaller And Less Immersive Than The Reference

Current behavior / UI:
`OrbHero` uses `ORB_SIZE = 178`, a 126px sun/moon, and a 128px core. The hero card has 18/18/20 padding. This reads tighter and less "signature" than the reference.

Reference behavior / UI:
The reference hero centers a 206px orb, 150px core, larger 42px timer, larger sky field, and the hero is the dominant first-viewport element. See `.reference/preview.html` lines 81-121 and 321-343.

File/component likely responsible:
`src/components/OrbHero.tsx` lines 260-380.

Safe implementation plan:
Adjust only presentational constants and padding in `OrbHero`: bring the orb/ring/core closer to 206/150, increase vertical sky padding, and keep existing props/callbacks unchanged. Test small devices to avoid pushing Quick Log below the fold too aggressively.

Risks:
A larger orb can crowd the BabyHeader and Quick Log on shorter devices. Ring math must remain internally consistent when changing radius/circumference.

## Mismatch 3: Reference Hero Has A Next-Nap Pill Inside The Sky; Native Uses Caption Text Below

Current behavior / UI:
`OrbHero` renders `title` and `description` below the sky card as normal text. There is no translucent pill inside the sky hero for next nap / started time context.

Reference behavior / UI:
The reference places a rounded translucent pill directly under the orb inside the sky, then the primary action. See `.reference/preview.html` lines 113-120 and 338-341.

File/component likely responsible:
`src/components/OrbHero.tsx` lines 378-388 and `src/app/(tabs)/index.tsx` lines 306-320.

Safe implementation plan:
Render the existing `title` or `description` as a non-interactive pill inside `OrbHero`, preserving all existing prop values. Keep the action callback untouched. If both lines remain useful, treat the pill as the main reference-aligned line and keep a smaller caption below only if product wants it.

Risks:
The current copy may be longer than the reference pill. Text must use `numberOfLines` / font scaling or be rewritten through existing view-model display strings without changing logic.

## Mismatch 4: Extra TonightStatus Strip Interrupts Hero -> Quick Log Flow

Current behavior / UI:
`TonightStatus` sits between `OrbHero` and `QuickLogRow`.

Reference behavior / UI:
The reference sequence is BabyHeader -> Sky hero -> encouragement nudge -> "Quick log" eyebrow -> 2x2 Quick Log grid. There is no three-column status card between the hero and Quick Log. See `.reference/preview.html` lines 345-353.

File/component likely responsible:
`src/app/(tabs)/index.tsx` lines 323-326 and `src/components/TonightStatus.tsx`.

Safe implementation plan:
For visual alignment, move the status strip below Quick Log or integrate it into the hero caption/nudge area as presentation only. Do not change `buildTonightStatus`, event selectors, or logging data.

Risks:
The strip may be an intentional product addition. Moving it can reduce at-a-glance utility even if it improves reference fidelity.

## Mismatch 5: Quick Log Section Lacks The Reference Eyebrow And Uses Tighter Geometry

Current behavior / UI:
Quick Log is rendered directly after a 13px gap with no visible "Quick log" eyebrow. Cards are 82px tall with a 9px grid gap and a 2px always-present border/ring.

Reference behavior / UI:
The reference uses an uppercase "Quick log" eyebrow with a larger section gap, 12px grid gap, soft cards without a visible inactive border, and card shape around 26px radius. See `.reference/preview.html` lines 78-79 and 130-141.

File/component likely responsible:
`src/app/(tabs)/index.tsx` lines 328-337, `src/components/QuickLogRow.tsx` lines 18-88, `src/components/QuickLogButton.tsx` lines 137-154.

Safe implementation plan:
Add a presentational section label above `QuickLogRow`, increase grid gap to 12, tune height/padding to closer match the reference, and remove or soften the inactive border while preserving the active ring. No changes to `onSelect`, `onPump`, or `meta`.

Risks:
Inactive borders were added for Android visibility. Removing them entirely may flatten cards on low-end Android unless shadow/elevation is retuned.

## Mismatch 6: Bottom Sheet Header Is Left-Aligned And Smaller Than Reference

Current behavior / UI:
Legacy `LogSheet` and v2 sheets render titles/subtitles left-aligned with 20px title text and 13px subtitle. Sheet padding is 18px horizontal. The grabber is 4px tall.

Reference behavior / UI:
The reference bottom sheet has a centered 23px Fredoka title, centered subtitle, 24px horizontal padding, 36px top radius, 40x5 grabber, and softer/higher sheet shadow. See `.reference/preview.html` lines 196-205 and 230-235.

File/component likely responsible:
`src/components/LogSheet.tsx` lines 70-95; `src/features/logging/feed/FeedSheet.tsx` lines 98-122; `src/features/logging/sleep/SleepSheet.tsx` lines 94-118; `src/features/logging/diaper/DiaperSheet.tsx` lines 82-108; `src/features/logging/pump/PumpSheet.tsx` lines 106-130.

Safe implementation plan:
Extract a shared visual-only `LoggingBottomSheetFrame` or update each sheet container consistently: 36px top radius, 24px horizontal padding, centered title/subtitle, 23px title, 5px grabber, and reference shadow. Keep all children and callbacks as-is.

Risks:
Changing padding and centering can expose text wrapping issues in localized or longer error states. A shared frame reduces drift but must not alter modal lifecycle or dismissal behavior.

## Mismatch 7: Sheet Scrim Is Too Plain And Slightly Too Light

Current behavior / UI:
Sheets use a flat `rgba(46,42,64,0.35)` scrim with no blur.

Reference behavior / UI:
The reference scrim is `rgba(46,42,64,.45)` with a subtle 2px blur. See `.reference/preview.html` lines 196-198.

File/component likely responsible:
`src/components/LogSheet.tsx` lines 60-67; `FeedSheet.tsx` lines 88-95; `SleepSheet.tsx` lines 84-91; `DiaperSheet.tsx` lines 72-79; `PumpSheet.tsx` lines 96-103.

Safe implementation plan:
Adjust only overlay styling. If blur is available through an existing Expo-compatible primitive, add it behind the sheet without changing press-to-dismiss. Otherwise raise opacity to 0.45 as a low-risk step.

Risks:
Blur can be expensive or inconsistent across Android devices. Avoid adding a dependency for this alone unless the project already has one.

## Mismatch 8: Feed Sheet Is Functionally Purpose-Built But Visually More Generic

Current behavior / UI:
Feed v2 supports Breast/Bottle and active breastfeeding, but the idle sheet uses pill rows and compact stepper layout. Active breastfeeding uses a table-like stat block rather than a centered timer card with status chip and two metric tiles.

Reference behavior / UI:
The reference feed flow uses centered header text, segmented controls on soft surfaces, a hint line, large centered amount stepper for bottle, and an active breastfeeding view with status chip, timer card, two metric tiles, action row, full-width save, and text cancel. See `.reference/preview.html` lines 564-592.

File/component likely responsible:
`src/features/logging/feed/FeedSheet.tsx` lines 119-169, `BreastFeedIdle.tsx`, `BottleFeedForm.tsx` lines 93-154, `BreastFeedActive.tsx`.

Safe implementation plan:
Keep existing feed tabs, start/save/switch/finish/cancel handlers. Retune bodies visually: use a segmented container for Breast/Bottle, add reference-style section kickers/hints, make bottle amount the dominant centered Fredoka number, and convert active breastfeeding stats into a timer-card plus metric tiles.

Risks:
Bottle currently has a third milk type, `Mixed`, beyond the reference. Keep it unless product explicitly removes it; hiding it would change functionality.

## Mismatch 9: Sleep Sheet Uses Four Preset Pills Instead Of Reference Choice Cards

Current behavior / UI:
Sleep idle shows a row of four start offsets, then a primary "Start sleep" button and a secondary completed-sleep branch. Active sleep is a compact timer card.

Reference behavior / UI:
The reference idle sleep sheet uses two large choice cards: "Start now" and "Started earlier", a full-width secondary "Add a completed sleep", and a sheet hint linking the hero button to the same sleep session. Completed sleep uses a large stepper. Active sleep includes a centered timer card with a timer label and meta copy. See `.reference/preview.html` lines 637-657.

File/component likely responsible:
`src/features/logging/sleep/SleepSheet.tsx` lines 115-140, `src/features/logging/sleep/SleepIdle.tsx` lines 70-132, `src/features/logging/sleep/SleepActive.tsx` lines 45-90.

Safe implementation plan:
Preserve `onStart(minutesAgo)` and `onSaveCompleted(minutesLong)`. Present the common actions as large choice cards and keep the existing additional offsets either as secondary quick picks inside "Started earlier" or as a visual expansion. Retune completed sleep to use the reference large stepper without changing timestamp math.

Risks:
Compressing four offsets into two cards could hide useful speed choices. If all offsets remain visible, the sheet may grow beyond the reference's compactness.

## Mismatch 10: Diaper Sheet Uses Full-Width Rows Instead Of Reference 2x2 Instant Cards

Current behavior / UI:
Diaper v2 renders four full-width rows with a leading glyph badge. It is two-tap and saves instantly.

Reference behavior / UI:
The reference renders a 2x2 grid of centered instant-choice cards, each at least 104px tall, with large glyph, Fredoka label, small hint, and a final sheet hint about no confirmation. See `.reference/preview.html` lines 261-265 and 687-695.

File/component likely responsible:
`src/features/logging/diaper/DiaperSheet.tsx` lines 103-129 and `src/features/logging/diaper/DiaperTypeButton.tsx` lines 105-128.

Safe implementation plan:
Change only `DiaperTypeButton` layout and the containing grid: render two columns with centered card contents. Keep `onPress={() => handleSave(k.kind)}` exactly the same and keep the saving guard.

Risks:
Two-column cards reduce horizontal room for translated labels. Keep labels short or allow wrapping.

## Mismatch 11: Pump Sheet Copy And Volume UI Drift From Reference

Current behavior / UI:
Pump idle title is "Log a pump"; the reference says "Start pumping". Pump volume draft uses row steppers with 46px controls and a compact duration strip.

Reference behavior / UI:
The reference pump flow uses centered header, "Start pumping", last pump subtitle, Side segmented control, hint text, active timer card, then a volume draft with "Volume" kicker and mini-stepper rows in a soft rounded container. See `.reference/preview.html` lines 704-729.

File/component likely responsible:
`src/features/logging/pump/PumpSheet.tsx` lines 106-154, `src/features/logging/pump/PumpIdle.tsx`, `PumpActive.tsx`, `PumpVolumeDraft.tsx` lines 139-180.

Safe implementation plan:
Keep the pump state machine and handlers. Retune copy and body layout to reference language: idle title "Start pumping", section kicker "Side", segmented side selector, hint, active timer card with label/meta, and volume rows matching the reference mini-stepper style.

Risks:
The native flow currently supports "Save without volume" and disabled primary-at-zero behavior. Preserve both; making zero volume save through the primary button would change behavior.

## Mismatch 12: Toast / Undo Visual Treatment Does Not Match Reference

Current behavior / UI:
Both `AppToast` and `LoggingToast` render a white pill, centered above the tab bar, with message, separator dot, and blue Undo text. There is no check icon.

Reference behavior / UI:
The reference toast is a dark ink rectangle with 18px radius, left/right 20px, bottom 98px, white confirmation text, green check icon, and warm `#FFB59E` Undo. See `.reference/preview.html` lines 217-224 and 440.

File/component likely responsible:
`src/components/AppToast.tsx` lines 31-63 and `src/features/logging/ui/LoggingToast.tsx` lines 32-64.

Safe implementation plan:
Create one shared visual toast component used by both legacy and v2 to avoid drift. Keep each toast's source state and undo callback unchanged. Change only styling: dark background `colors.ink`, 18px radius, green check icon, white text, warm Undo, reference-like width/padding, and tab-bar-aware bottom placement.

Risks:
A dark toast in night mode may lose contrast against the low-glare navy background unless it has a clear shadow or border. Shared component must not merge legacy and v2 toast state.

## Mismatch 13: Bottom Tab Bar Is A Compact Three-Tab App Bar, Not Reference Five-Item Bar

Current behavior / UI:
The app has three tabs: Tonight, Log, Reassure. The custom tab bar is compact, max 304px, 58px tall, with an active sliding tint pill.

Reference behavior / UI:
The reference uses a 5-item nav with Today, Insights, central Log FAB, Growth, and History. The bar is 70px high, inset 16px, 28px radius, with a prominent central orange circular Log action. See `.reference/preview.html` lines 182-194 and 426-431.

File/component likely responsible:
`src/app/(tabs)/_layout.tsx`, `src/components/LullabyTabBar.tsx`, `src/components/TabBarPill.tsx`, and `src/theme/index.ts` lines 100-128.

Safe implementation plan:
Because changing navigation structure affects product scope, treat this as a visual-language note rather than a safe logging UI polish item. For the current three-tab app, the safe UI-only path is to preserve routes and only tune spacing/height/radius if desired. Do not add/remove tabs in this audit scope.

Risks:
Changing tab count or adding a central FAB would be functional/navigation work, outside this UI-only task. It could also affect sheets and toast placement.

## Mismatch 14: Sheet And Toast Spacing Above The Tab Bar Needs Reference-Specific QA

Current behavior / UI:
Sheets are `Modal`s and appear above the tab bar, covering it. Toasts calculate `bottom` as `barFootprint + 12`, using the app's current 58px compact tab bar.

Reference behavior / UI:
The reference sheet slides from the bottom over the nav area with high z-index; the toast sits at `bottom:98px`, just above a 70px nav at `bottom:16px`, leaving a narrow but clear gap. See `.reference/preview.html` lines 183-201 and 217-224.

File/component likely responsible:
`src/components/Screen.tsx` lines 36-47, `src/components/AppToast.tsx` lines 31-40, `src/features/logging/ui/LoggingToast.tsx` lines 32-40, and all sheet `Modal` containers.

Safe implementation plan:
After any tab-bar/toast visual tuning, verify three states on small and large devices: sheet open, toast visible, and sheet dismissed while toast visible. Keep bottom spacing derived from shared tab-bar geometry, not hard-coded pixels, unless the tab bar itself is retuned to the reference dimensions.

Risks:
Hard-coding reference `bottom:98px` against the current compact tab bar can create too much empty space or collide with safe-area insets. Modal stacking can differ between iOS and Android.

## Safe Implementation Order

1. Shared sheet visual frame: centered header, scrim, radius, padding, shadow.
2. Toast visual component shared by legacy and v2.
3. Quick Log eyebrow and grid/card tuning.
4. Hero sizing and in-sky pill.
5. Per-flow body polish: Feed, Sleep, Diaper, Pump.
6. Final spacing QA for tab bar, sheet, and toast.

## Non-Goals For The Follow-Up Implementation

- Do not change event schemas, repository code, persistence, timers, idempotency, or undo semantics.
- Do not change which actions create events.
- Do not change navigation/tab structure unless product explicitly expands scope.
- Do not remove currently supported logging options such as mixed milk, dry diaper, backdated sleep presets, or save-without-volume.
