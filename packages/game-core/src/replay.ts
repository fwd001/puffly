/**
 * Deterministic replay — SPEC.md §71.
 *
 * A session stores its seed, its content ids, the engine's starting wall clock and every
 * input snapped to a step boundary. Feeding those into a fresh engine reproduces the same
 * event stream, which is what turns "reproduce bug" from a hope into a check.
 *
 * Known edge, stated rather than hidden: `UNLOCK` events also depend on the persisted
 * `Progress` at the time of recording, so pass it in via `options.progress` if you need
 * those events reproduced too.
 */

import { STEP_MS } from './constants';
import { createEngine, type GameEngine } from './engine';
import type { ContentLookup } from './content/lookup';
import type { ContentBundle } from './types/content';
import type { EngineEvent, SessionEvent } from './types/events';
import type { Progress } from './types/progress';
import type { Settings } from './types/settings';
import type { Session } from './types/session';

export interface ReplayOptions {
  settings?: Settings;
  progress?: Progress;
  /** Stop after this many milliseconds of simulated time, for debugging one moment. */
  untilMs?: number;
}

export interface ReplayResult {
  engine: GameEngine;
  events: EngineEvent[];
  sessionEvents: SessionEvent[];
}

export function replaySession(
  session: Session,
  content: ContentBundle | ContentLookup,
  options: ReplayOptions = {},
): ReplayResult {
  const engine = createEngine({
    content,
    seed: session.seed,
    wallClockMs: session.engineStartWallClockMs,
    cigaretteId: session.cigaretteId,
    environmentId: session.environmentId,
    lighterId: session.lighterId,
    ashtrayId: session.ashtrayId,
    ...(options.settings ? { settings: options.settings } : {}),
    ...(options.progress ? { progress: options.progress } : {}),
  });

  const events: EngineEvent[] = [];
  const sessionEvents: SessionEvent[] = [];
  engine.on((event) => {
    events.push(event);
    if (event.kind === 'session') sessionEvents.push(event.event);
  });

  // The session itself is part of the recording: §69's SESSION_START/SESSION_END have to
  // land at the same engine steps they did originally, or the streams cannot be compared.
  engine.advance(session.startedAtEngineMs);
  engine.startSession();

  for (const input of session.inputs) {
    const targetStep = Math.max(0, Math.round(input.timestamp / STEP_MS));
    const toAdvance = Math.max(0, targetStep - 1 - engine.steps());
    engine.advance(toAdvance * STEP_MS);
    engine.send(input);
    engine.advance(STEP_MS);
    if (options.untilMs !== undefined && engine.getState().nowMs >= options.untilMs) {
      return { engine, events, sessionEvents };
    }
  }

  const closedAtEngineMs =
    session.endedAt === undefined
      ? undefined
      : session.startedAtEngineMs + Math.max(0, session.endedAt - session.startedAt);
  const tail = (closedAtEngineMs ?? engine.getState().nowMs) - engine.getState().nowMs;
  if (tail > 0) engine.advance(tail);
  engine.endSession();

  if (options.untilMs !== undefined) {
    const remaining = options.untilMs - engine.getState().nowMs;
    if (remaining > 0) engine.advance(remaining);
  }

  return { engine, events, sessionEvents };
}

/** Event types in order, ignoring ids: the comparison a regression test wants. */
export function sessionEventTypes(events: readonly SessionEvent[]): string[] {
  return events.map((event) => event.type);
}
