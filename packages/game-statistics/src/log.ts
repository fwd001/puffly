/**
 * The only place in this package that touches the raw log — SPEC.md §69, §70, §71.
 *
 * Every read here is tolerant on purpose: a session written by an older build,
 * interrupted by a crash, or imported from another machine may lack `endedAt` or carry a
 * non-finite timestamp. Derivations report 0 for what they cannot know instead of
 * inventing a number (§84) — and instead of producing `NaN` (§72).
 */

import { MS_PER_DAY, MS_PER_MINUTE, dayKey } from '@puffly/shared';
import { SessionEventType, type Session, type SessionEvent } from '@puffly/game-core';

/** Cheap `number` guard that also rejects `NaN`/`Infinity` from a corrupt log. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A timestamp we can place on the calendar, or null when the log has nothing to say. */
export function usableTimestamp(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

/** JSON payload reads never need a cast: `unknown` in, a real type out. */
export function payloadString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function eventPayloadField(event: SessionEvent, key: string): unknown {
  const payload = event.payload;
  return typeof payload === 'object' && payload !== null ? payload[key] : undefined;
}

/** The wall-clock span a session covers, clamped so a bad `endedAt` cannot go negative. */
export interface SessionWindow {
  startMs: number;
  endMs: number;
  durationMs: number;
}

/**
 * `endedAt` wins; otherwise the last event the log actually contains. A session with
 * neither is a session of 0 measurable milliseconds — not a guessed `targetMs` (§84).
 */
export function sessionWindow(session: Session): SessionWindow {
  const startMs = usableTimestamp(session.startedAt);
  if (startMs === null) return { startMs: 0, endMs: 0, durationMs: 0 };

  let endMs = startMs;
  const candidates: (number | null)[] = [usableTimestamp(session.endedAt)];
  for (const event of eventsOf(session)) candidates.push(usableTimestamp(event.timestamp));
  for (const candidate of candidates) {
    if (candidate !== null && candidate > endMs) endMs = candidate;
  }
  return { startMs, endMs, durationMs: endMs - startMs };
}

export function sessionDurationMs(session: Session): number {
  return sessionWindow(session).durationMs;
}

/** Local calendar keys the session touched — a run past midnight yields two (§34). */
export function sessionDayKeys(session: Session, utcOffsetMinutes: number): string[] {
  // A session with an unusable `startedAt` is not on any calendar; inventing 1970 would
  // be the kind of number §84 says we do not print.
  if (usableTimestamp(session.startedAt) === null) return [];
  const { startMs, endMs } = sessionWindow(session);
  const first = dayIndexOf(startMs, utcOffsetMinutes);
  const last = dayIndexOf(endMs, utcOffsetMinutes);
  const keys: string[] = [];
  // Step by local *day index*, never by "+24h" from the start: adding a day to 23:58
  // would land on 23:58 the next day and skip the day the session actually ended in.
  // Noon-ish inside the day keeps the round trip unambiguous.
  for (let index = first; index <= last && keys.length < 366; index += 1) {
    keys.push(
      dayKey(
        index * MS_PER_DAY + MS_PER_DAY / 2 - utcOffsetMinutes * MS_PER_MINUTE,
        utcOffsetMinutes,
      ),
    );
  }
  return keys;
}

/** Day index of a `YYYY-MM-DD` key, or null when the key is not a real date. */
export function dayIndexOfKey(key: string): number | null {
  const parsed = Date.parse(`${key}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed / MS_PER_DAY);
}

export function dayIndexOf(timestampMs: number, utcOffsetMinutes: number): number {
  return Math.floor((timestampMs + utcOffsetMinutes * MS_PER_MINUTE) / MS_PER_DAY);
}

/** Sorted, de-duplicated, oldest first. */
export function sortedUnique(values: Iterable<string>): string[] {
  const unique = new Set<string>();
  for (const value of values) unique.add(value);
  return [...unique].sort();
}

/** Length of the run of consecutive civil days, ending with the newest one. */
export function trailingStreak(dayKeys: readonly string[]): number {
  let streak = 0;
  let expected: number | null = null;
  for (let index = dayKeys.length - 1; index >= 0; index -= 1) {
    const key = dayKeys[index];
    if (key === undefined) continue;
    const day = dayIndexOfKey(key);
    if (day === null) continue;
    if (expected === null || day === expected) {
      streak += 1;
      expected = day - 1;
    } else {
      break;
    }
  }
  return streak;
}

/** Longest run of consecutive civil days anywhere in the list. */
export function longestStreak(dayKeys: readonly string[]): number {
  let best = 0;
  let current = 0;
  let previous: number | null = null;
  for (const key of dayKeys) {
    const day = dayIndexOfKey(key);
    if (day === null) continue;
    current = previous !== null && day === previous + 1 ? current + 1 : 1;
    previous = day;
    if (current > best) best = current;
  }
  return best;
}

/** §69 events, defensively: an entry that is not an object cannot carry a type. */
export function eventsOf(session: Session): SessionEvent[] {
  const events: readonly unknown[] = Array.isArray(session.events) ? session.events : [];
  return events.filter(isSessionEvent);
}

function isSessionEvent(value: unknown): value is SessionEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return typeof event['id'] === 'string' && typeof event['type'] === 'string';
}

export function countByType(sessions: readonly Session[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    for (const event of eventsOf(session)) {
      counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
    }
  }
  return counts;
}

/** §31: the countdown finishing is an event, so "handled" is readable from the log alone. */
export function reachedTarget(session: Session): boolean {
  return eventsOf(session).some((event) => event.type === SessionEventType.SESSION_TARGET);
}

/**
 * Craving self-reports (§32) live both as `Session` fields and as `CRAVING` events.
 * Either form counts, and a session is never double-booked because the answer is a
 * per-session pair of booleans.
 */
export function cravingPhases(session: Session): { before: boolean; after: boolean } {
  return {
    before: isFiniteNumber(session.cravingBefore) || hasCravingPhase(session, 'before'),
    after: isFiniteNumber(session.cravingAfter) || hasCravingPhase(session, 'after'),
  };
}

function hasCravingPhase(session: Session, phase: string): boolean {
  return eventsOf(session).some(
    (event) =>
      event.type === SessionEventType.CRAVING &&
      payloadString(eventPayloadField(event, 'phase')) === phase,
  );
}

/** §36 tags: the stored tag list plus any `TRIGGER` event, de-duplicated per session. */
export function tagsOf(session: Session): string[] {
  const tags = new Set<string>();
  const stored: readonly unknown[] = Array.isArray(session.triggers) ? session.triggers : [];
  for (const value of stored) {
    const tag = payloadString(value);
    if (tag !== undefined) tags.add(tag);
  }
  for (const event of eventsOf(session)) {
    if (event.type !== SessionEventType.TRIGGER) continue;
    const tag = payloadString(eventPayloadField(event, 'tag'));
    if (tag !== undefined) tags.add(tag);
  }
  return [...tags];
}

/** A craving value the player actually reported, or null. */
export function reportedCraving(value: number | undefined): number | null {
  return isFiniteNumber(value) ? value : null;
}

/** The mean of what the player reported — 0 for an empty list, never NaN (§72). */
export function meanOrZero(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/** One decimal is plenty for `0.5h` (§35), and keeps `7.000000000000001` out of the UI. */
export function roundToTenth(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

/** Two decimals for craving means: enough to compare, not enough to look like noise. */
export function roundToHundredth(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}
