/**
 * Public shapes of the derivation layer — SPEC.md §33-36, §70.
 *
 * Nothing in here is stored. Every field is computed from the raw `Session[]` log on
 * demand, which is what §70 asks for ("统计系统必须从 Session Event 推导"): the log is
 * the only source of truth and these types are read-only views of it.
 */

import type { Session, SubstituteTally } from '@puffly/game-core';

/** What a derivation needs besides the log: a wall clock and the player's own offset (§71). */
export interface StatisticsOptions {
  /** Wall clock "now", in epoch milliseconds. Never read from a platform global here (§47). */
  nowMs: number;
  /** The player's `Settings.utcOffsetMinutes`, so day keys match what they saw (§71). */
  utcOffsetMinutes: number;
  /**
   * §33/§84: smoke-free days are counted from *the player's own* anchor. When it is
   * absent the count falls back to the first session in the log — never to a guess.
   */
  quitAnchorTimestamp?: number;
  /**
   * S23's 替代动作计次, straight from the player's own ledger. Absent is an empty ledger: the page
   * still shows the three rows, each at zero, because the deck's row is a choice and not a score.
   */
  substitutes?: readonly SubstituteTally[];
}

/** §33's list, expressed as numbers only so the shell needs no sentences (§35). */
export interface Statistics {
  /** Sessions recorded in the log. */
  sessionCount: number;
  /** Sum of every session's duration. */
  totalDurationMs: number;
  /** `totalDurationMs / sessionCount`, 0 for an empty log (never NaN). */
  averageDurationMs: number;
  longestSessionMs: number;
  /** The session holding `longestSessionMs`; null when the log is empty. */
  longestSessionId: string | null;
  /** Counted from `PUFF` events — one event per puff (§69). */
  totalPuffs: number;
  totalEvents: number;
  /** §33 "events": per `SessionEvent.type` count, keyed by the raw type string. */
  eventCounts: Record<string, number>;
  /**
   * The hardest 一阵风 the log ever recorded: the maximum `strength` among the `ash_fall` events the
   * *weather* wrote (the rows `dropAsh` writes carry a `cause` and no strength, and the two meanings
   * of that one event type are documented in SPEC.md). 0 when the room never blew that hard — which
   * is a reading, not a missing number. 2026-10-08 拍板 ⑥'s rare achievements are cut against this.
   */
  strongestGust: number;
  /** Mean over sessions that report a value; 0 when none do. */
  averageCravingBefore: number;
  averageCravingAfter: number;
  /** `averageCravingBefore - averageCravingAfter`; positive means the break read as relief. */
  averageCravingRelief: number;
  /** How many sessions reported at least one craving value — the denominator of the means. */
  cravingReportCount: number;
  /** §33: sessions that reached the §31 target *or* reported both a before and an after. */
  cravingsHandled: number;
  /** §33: whole local days between the player's own anchor and `nowMs`. */
  smokeFreeDays: number;
  /** The timestamp `smokeFreeDays` counts from, or null when nothing backs the count (§84). */
  smokeFreeAnchorMs: number | null;
  /** True when the anchor is the player's `quitAnchorTimestamp`, false when it is the log's own first session. */
  smokeFreeAnchorIsExplicit: boolean;
  /** Active local day keys, oldest first — §34's timeline input. */
  dayKeys: string[];
  activeDayCount: number;
  /** Run of consecutive active days ending on the most recent active day. */
  currentStreakDays: number;
  /** Longest run of consecutive active days anywhere in the log. */
  longestStreakDays: number;
  /** Whole days between the most recent activity and `nowMs`; 0 when the log is empty. */
  daysSinceLastActivity: number;
}

/** The icon vocabulary of §34's timeline — three tokens, no words. */
export const JOURNEY_TOKENS = ['puff', 'extinguish', 'wind'] as const;

export type JourneyToken = (typeof JOURNEY_TOKENS)[number];

export interface JourneySymbol {
  token: JourneyToken;
  count: number;
}

/** One dot on §34's `●──●──●` line. */
export interface JourneyStop {
  dayKey: string;
  /** 1-based, counted from the player's own first day — the §37 ladder is in these units. */
  dayNumber: number;
  isMilestone: boolean;
  /** The matching §37 milestone day (1/3/7/14/21/30/45/60/90), null when not a milestone. */
  milestoneDay: number | null;
  sessionCount: number;
  /** Only non-zero tokens, in `JOURNEY_TOKENS` order, so the shell can pick the loudest icon. */
  symbols: JourneySymbol[];
  /** `◆` on a §37 milestone day, `●` otherwise. A hint: the shell owns the real art. */
  marker: '●' | '◆';
}

export interface JourneyOptions {
  utcOffsetMinutes?: number;
  /** Keep only the newest N stops. Stops stay oldest-first. */
  maxStops?: number;
}

/** §36: one visual tag and how many sessions the player reached for it in. */
export interface TriggerCount {
  tag: string;
  count: number;
}

/** §35's whole screen: five numbers and five icons, no prose. */
export interface TodayView {
  dayKey: string;
  sessionCount: number;
  totalDurationMs: number;
  /** Duration split by each session's own `timeOfDay` (§35's ☀️/🌙 pair). */
  daylightMs: number;
  nightMs: number;
  /** `*Ms / 3_600_000` rounded to a tenth, so `8` renders as `8h`. */
  daylightHours: number;
  nightHours: number;
  /** 🔥 */
  puffs: number;
  /** 🌫️ — everything that put visible vapour in the air. */
  smokeEvents: number;
  cravingsHandled: number;
  /** Per-type counts restricted to today, for any icon the shell has but this list lacks. */
  eventCounts: Record<string, number>;
  /** Time-of-day values this build does not know; reported, never folded into either bucket (§84). */
  unclassifiedDurationMs: number;
}

/** Re-exported so shells can type callbacks without importing the core directly. */
export type { Session };
