export type InsightTone = 'feed' | 'sleep' | 'diaper' | 'growth' | 'neutral';

export type InsightDeltaTone = 'up' | 'down' | 'neutral';

/** In-style line glyph for a rhythm card (bottle = feed, moon = sleep, sun = wake). */
export type InsightIcon = 'bottle' | 'moon' | 'sun';

export type InsightCardViewModel = {
  id: string;
  icon: InsightIcon;
  text: string;
  /** Optional quiet helper line (e.g. the feed sample size); omitted when it would only restate the body. */
  source?: string;
  tone: InsightTone;
};

export type WeeklySleepDayViewModel = {
  date: string;
  label: string;
  minutes: number;
};

export type InsightStatViewModel = {
  value: string;
  unit?: string;
  label: string;
  delta?: string;
  deltaTone?: InsightDeltaTone;
};

export type InsightsViewModel = {
  updatedAt: number;
  hasEnoughData: boolean;
  dataDays: number;
  /** The local-day window this view model was computed over (7 free / 30 Pro). */
  windowDays: number;
  cards: InsightCardViewModel[];
  weeklySleep: WeeklySleepDayViewModel[];
  stats: {
    feedsPerDay: InsightStatViewModel;
    sleepPerDay: InsightStatViewModel;
    diapersPerDay: InsightStatViewModel;
  };
};
