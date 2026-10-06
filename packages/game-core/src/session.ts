/**
 * Session recording — SPEC.md §31-33, §69, §71.
 *
 * The session log *is* the raw data. Statistics never keep their own counters (§70);
 * the log keeps enough to replay from (§71).
 */

import { rollPack } from './packs';
import { record } from './emit';
import { SessionEventType } from './types/events';
import { clamp } from '@puffly/shared';
import { CRAVING_SCALE_MAX, type Session } from './types/session';
import type { EngineRuntime, SessionLog } from './runtime';

export function openSession(rt: EngineRuntime, targetMs: number): SessionLog {
  const log: SessionLog = {
    id: rt.ids.next('ses'),
    seed: rt.state.seed,
    startedAt: rt.state.wallClockMs,
    startedAtEngineMs: rt.state.nowMs,
    targetMs,
    events: [],
    inputs: [],
    triggers: [],
  };
  rt.session = log;

  record(rt, SessionEventType.SESSION_START, {
    cigaretteId: rt.cigarette.id,
    environmentId: rt.environment.id,
    lighterId: rt.lighter.id,
    ashtrayId: rt.ashtray.id,
    targetMs,
    timeOfDay: rt.state.world.timeOfDay,
    weather: rt.state.world.weather,
  });
  return log;
}

/** Only the §31 countdown can complete a session on its own. */
export function isSessionTargetReached(rt: EngineRuntime): boolean {
  return (
    rt.session?.events.some((event) => event.type === SessionEventType.SESSION_TARGET) ?? false
  );
}

export function closeSession(rt: EngineRuntime): Session | null {
  const log = rt.session;
  if (!log) return null;

  const completed = isSessionTargetReached(rt);
  record(rt, SessionEventType.SESSION_END, {
    durationMs: Math.round(rt.state.nowMs - log.startedAtEngineMs),
    completed,
    puffs: rt.state.cigarette.puff.count,
  });

  const session: Session = {
    id: log.id,
    seed: log.seed,
    cigaretteId: rt.cigarette.id,
    environmentId: rt.environment.id,
    lighterId: rt.lighter.id,
    ashtrayId: rt.ashtray.id,
    startedAt: log.startedAt,
    endedAt: rt.state.wallClockMs,
    targetMs: log.targetMs,
    timeOfDay: rt.state.world.timeOfDay,
    weather: rt.state.world.weather,
    events: log.events.slice(),
    engineStartWallClockMs: rt.wallStartMs,
    startedAtEngineMs: log.startedAtEngineMs,
    inputs: log.inputs.slice(),
    ...(log.cravingBefore === undefined ? {} : { cravingBefore: log.cravingBefore }),
    ...(log.cravingAfter === undefined ? {} : { cravingAfter: log.cravingAfter }),
    triggers: log.triggers.slice(),
    completed,
  };

  rt.progress.sessions += 1;
  // A box is a fact about a stick that was actually smoked: a break that ran its length with the
  // rod unlit is a break spent doing something else.
  const smoked = completed && log.events.some((event) => event.type === SessionEventType.LIGHT);
  if (smoked) {
    // A finished stick leaves a box behind, and the roll comes from the session's own generator:
    // replaying the break has to hand back the same collection (§71).
    const box = rollPack(
      rt.rng,
      rt.content.bundle.packs,
      rt.progress.collectedPacks ?? [],
      rt.progress.sessions,
    );
    if (box !== null) {
      rt.progress.collectedPacks = [...(rt.progress.collectedPacks ?? []), box.id];
      record(rt, SessionEventType.PACK, { packId: box.id, tier: box.tier });
    }
  }
  rt.session = null;
  return session;
}

/** §32: a drag on a three-face control, nothing to read. */
export function recordCraving(rt: EngineRuntime, level: number, phase: 'before' | 'after'): void {
  const log = rt.session;
  if (!log) return;
  const value = clamp(Math.round(level), 0, CRAVING_SCALE_MAX);
  if (phase === 'before') log.cravingBefore = value;
  else log.cravingAfter = value;
  record(rt, SessionEventType.CRAVING, { level: value, phase });
}

/** §36: one tap on an icon. No questionnaire. */
export function recordTrigger(rt: EngineRuntime, tag: string): void {
  const log = rt.session;
  if (!log) return;
  if (log.triggers.includes(tag)) return;
  log.triggers.push(tag);
  record(rt, SessionEventType.TRIGGER, { tag });
}

/** The §31 clock running out is a handled craving; the shell shows it, it does not say it. */
export function announceTargetReached(rt: EngineRuntime): void {
  record(rt, SessionEventType.SESSION_TARGET, { atMs: Math.round(rt.state.nowMs) });
}
