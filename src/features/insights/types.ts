export type InsightTone = 'feed' | 'sleep' | 'diaper' | 'growth' | 'neutral';

export type InsightDeltaTone = 'up' | 'down' | 'neutral';

export type InsightCardViewModel = {
  id: string;
  emoji: string;
  text: string;
  source: string;
  sourceTone?: 'accent' | 'muted';
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
