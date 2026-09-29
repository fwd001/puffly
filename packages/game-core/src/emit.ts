/**
 * Emitting and state changes, in one place, so no system can log a session event
 * without broadcasting it (or the reverse) — SPEC.md §69, §70.
 */

import { canTransition } from './stateMachine';
import type { EngineEvent, SessionEvent } from './types/events';
import type { CigaretteStateId } from './types/state';
import type { EngineRuntime } from './runtime';

export function emit(rt: EngineRuntime, event: EngineEvent): void {
  for (const listener of rt.listeners) listener(event);
}

/**
 * Append a §69 event. `timestamp` is wall clock so an exported save reads sensibly on
 * its own; replay uses the relative input timeline instead (§71).
 */
export function record(
  rt: EngineRuntime,
  type: string,
  payload?: Record<string, unknown>,
): SessionEvent | undefined {
  const event: SessionEvent = {
    id: rt.ids.next('evt'),
    type,
    timestamp: rt.state.wallClockMs,
    ...(payload ? { payload } : {}),
  };
  rt.session?.events.push(event);
  emit(rt, { kind: 'session', event });
  return event;
}

/**
 * Apply a lifecycle change. Illegal edges are refused rather than thrown: a stranded
 * cigarette would be a worse user experience than a missed one, and the exhaustive
 * transition test is what keeps the table honest.
 */
export function setState(rt: EngineRuntime, next: CigaretteStateId): boolean {
  const current = rt.state.cigarette.state;
  if (current === next) return true;
  if (!canTransition(current, next)) return false;
  rt.state.cigarette.state = next;
  emit(rt, {
    kind: 'transition',
    atMs: rt.state.nowMs,
    from: current,
    to: next,
  });
  return true;
}

export function markRevision(rt: EngineRuntime): void {
  rt.state.revision += 1;
}
