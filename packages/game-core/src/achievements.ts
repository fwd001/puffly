/**
 * The achievement ladder — 2026-10-08 拍板 ⑤: 「可以做一些成就，就是烟灰的克数、吸烟的根数、吸烟的
 * 口数、然后吸烟的时长，这些可以做一些成就，然后这个成就的时长大概两个月可以走完的那种，然后给后续
 * 带来一些这个扩展的空间」, plus 拍板 ⑥ (「中间可以做一些搞笑的成就随机事件…随机几率比较低」).
 *
 * The four axes are the four counters the deck's own save schema already names (`totalPuffs`,
 * `totalDurationSec`, `ashTotalG`, and the stick count), so nothing new is measured here — this file
 * only says what a number is worth.
 *
 * It is a pure function of numbers already in the ledger: no storage, no platform, no sentences (the
 * words live in the shell's copy table, §9), and **no random draw** — §71 makes the engine's draw
 * count load-bearing, so the rare moments are read back out of the log's already-rolled gust
 * strengths rather than rolled again here. And per the standing redlines, reaching a rung is a
 * report of what happened: it never unlocks a lecture, never claims anything about health, and the
 * ash axis counts grams of ash, not grams of tobacco.
 */

/** What a rung is measured on. `moment` is the rare, non-accumulating kind (拍板 ⑥). */
export type AchievementAxis = 'sticks' | 'puffs' | 'ash' | 'time' | 'moment';

export interface Achievement {
  id: string;
  axis: AchievementAxis;
  /** The figure the ledger has to reach, in the axis's own unit. `0` for a moment. */
  goal: number;
  /**
   * A moment rung only: the minimum 风力 of an `ash_fall` the player has to have been under. The
   * world rolls strength uniformly over 0.4–1.0, so the odds are a line on that window — this is the
   * only place the number is written, and `achievements.test.ts` prints what each one costs.
   */
  minGust?: number;
}

/** The four accumulating figures a ladder rung can be measured against. */
export interface AchievementLedger {
  sticks: number;
  puffs: number;
  ashGrams: number;
  minutes: number;
}

export interface AchievementRung {
  achievement: Achievement;
  /** 0..1 through the rung's own goal; 1 once it is reached. */
  ratio: number;
  reached: boolean;
}

/**
 * The pacing the rungs are cut against — the deck's own arithmetic, cited rather than invented
 * (S22: 「25 分钟 ÷ 10 分钟/支 ≈ 2.5 支/天 → 一个月约 75 支」, S9: 12 口 / 0.30 g per 原生).
 * Two months of that is 150 支 / 1800 口 / 45 g / 1500 分钟, which is what the top of each axis is.
 */
export const DECK_PACING = {
  minutesPerDay: 25,
  daysForTwoMonths: 60,
  sticksPerDay: 2.5,
  puffsPerStick: 12,
  gramsPerStick: 0.3,
} as const;

/** One axis's worth of the deck's two-month figure. */
export function twoMonthTotal(axis: Exclude<AchievementAxis, 'moment'>): number {
  const days = DECK_PACING.daysForTwoMonths;
  const sticks = DECK_PACING.sticksPerDay * days;
  switch (axis) {
    case 'sticks':
      return Math.round(sticks);
    case 'puffs':
      return Math.round(sticks * DECK_PACING.puffsPerStick);
    case 'ash':
      return Math.round(sticks * DECK_PACING.gramsPerStick);
    case 'time':
      return DECK_PACING.minutesPerDay * days;
  }
}

/**
 * Rungs at a twelfth, a sixth, a third, two thirds and the whole of two months.
 *
 * The shape is deliberate: the first is reachable in one sitting of the deck's own day (so the
 * ladder announces itself), the top is two months of daily use, and nothing in between is further
 * apart than the previous step by more than about a factor of two — "两个月可以走完" would be false
 * if a single rung needed a month on its own.
 */
function axisRungs(axis: Exclude<AchievementAxis, 'moment'>, prefix: string): Achievement[] {
  const total = twoMonthTotal(axis);
  const steps = [1 / 12, 1 / 6, 1 / 3, 2 / 3, 1] as const;
  return steps.map((share, index) => ({
    id: `${prefix}.${String(index + 1)}`,
    axis,
    goal: Math.max(1, Math.round(total * share)),
  }));
}

/**
 * The three rare moments (拍板 ⑥). Each is one gust the room already rolled: `ash_fall` draws
 * strength uniformly over 0.4–1.0, so a line at 0.98 / 0.99 / 0.996 is 3.3% / 1.7% / 0.7% of those
 * events — rare enough that most players meet the first one by accident and the last one as a story.
 * Nothing here adds a draw: the log is read, not fed.
 */
const MOMENTS: Achievement[] = [
  { id: 'moment.gust', axis: 'moment', goal: 0, minGust: 0.98 },
  { id: 'moment.squall', axis: 'moment', goal: 0, minGust: 0.99 },
  { id: 'moment.freak', axis: 'moment', goal: 0, minGust: 0.996 },
];

/** The whole ladder, in the order the four axes are read: 支 · 口 · 灰 · 时长, then the moments. */
export const ACHIEVEMENTS: Achievement[] = [
  ...axisRungs('sticks', 'sticks'),
  ...axisRungs('puffs', 'puffs'),
  ...axisRungs('ash', 'ash'),
  ...axisRungs('time', 'time'),
  ...MOMENTS,
];

const current = (axis: AchievementAxis, ledger: AchievementLedger): number => {
  switch (axis) {
    case 'sticks':
      return ledger.sticks;
    case 'puffs':
      return ledger.puffs;
    case 'ash':
      return ledger.ashGrams;
    case 'time':
      return ledger.minutes;
    case 'moment':
      return 0;
  }
};

/**
 * Read the ladder against a ledger and the strongest gust the log recorded.
 *
 * `strongestGust` is the maximum `strength` among the `ash_fall` events the *weather* wrote; a log
 * with none is 0, which is "it has not happened", not a missing number.
 */
export function achievementsFor(ledger: AchievementLedger, strongestGust = 0): AchievementRung[] {
  return ACHIEVEMENTS.map((achievement) => {
    if (achievement.axis === 'moment') {
      const reached = strongestGust >= (achievement.minGust ?? 1.1);
      return { achievement, ratio: reached ? 1 : 0, reached };
    }
    const goal = achievement.goal;
    const value = current(achievement.axis, ledger);
    const ratio = goal <= 0 ? 0 : Math.min(1, Math.max(0, value / goal));
    return { achievement, ratio, reached: value >= goal };
  });
}

/** How many rungs the ledger has reached — the one number a row of digits can carry. */
export function reachedCount(rungs: AchievementRung[]): number {
  return rungs.filter((rung) => rung.reached).length;
}
