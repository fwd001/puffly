import {
  createEngine,
  STEP_MS,
  type ContentBundle,
  type EngineEvent,
  type GameEngine,
  type GameInput,
  type InputTarget,
  type SessionEvent,
  type Settings,
} from '@puffly/game-core';
import { createDefaultSettings } from '@puffly/game-core';
import { FIXTURE } from './fixture';

export const WALL_CLOCK = Date.UTC(2026, 8, 29, 21, 30, 0);

/** One fixed step: enough for a queued input to be applied (§71 snapping). */
const ONE_STEP = Math.ceil(STEP_MS);

export interface Harness {
  engine: GameEngine;
  events: EngineEvent[];
  sessionEvents: SessionEvent[];
  bursts: EngineEvent[];
  /** Drive the simulation and let queued inputs apply, in fixed steps. */
  run: (ms: number) => void;
  flush: () => void;
  tap: (target: InputTarget, atMs?: number) => void;
  hold: (target: InputTarget, ms: number) => void;
  press: (target: InputTarget) => void;
  release: (target: InputTarget) => void;
  swipe: (target: InputTarget, vx: number, vy: number) => void;
  dragTo: (x: number, y: number) => void;
  /** Pointer traffic aims at pixels, exactly like `Pointer Events` in the app (§49). */
  pointerDown: (x: number, y: number) => void;
  pointerUp: (x: number, y: number) => void;
  /** Advance until `predicate` holds, or fail loudly rather than hang. */
  until: (predicate: () => boolean, ms: number) => void;
  state: () => ReturnType<GameEngine['getState']>;
}

/**
 * Tests aim at named anchors rather than pixels, which is exactly how the keyboard path
 * works in the app (SPEC.md §65) — so this harness exercises the shell's own route.
 */
export function harness(
  options: {
    seed?: number;
    content?: ContentBundle;
    settings?: Partial<Settings>;
    lighterId?: string;
    cigaretteId?: string;
    environmentId?: string;
    wallClockMs?: number;
  } = {},
): Harness {
  const content = options.content ?? FIXTURE;
  const engine = createEngine({
    content,
    seed: options.seed ?? 42,
    wallClockMs: options.wallClockMs ?? WALL_CLOCK,
    settings: { ...createDefaultSettings(), ...options.settings },
    ...(options.lighterId ? { lighterId: options.lighterId } : {}),
    ...(options.cigaretteId ? { cigaretteId: options.cigaretteId } : {}),
    ...(options.environmentId ? { environmentId: options.environmentId } : {}),
  });

  const events: EngineEvent[] = [];
  const sessionEvents: SessionEvent[] = [];
  const bursts: EngineEvent[] = [];
  engine.on((event) => {
    events.push(event);
    if (event.kind === 'session') sessionEvents.push(event.event);
    if (event.kind === 'burst') bursts.push(event);
  });

  const send = (input: GameInput) => engine.send(input);

  return {
    engine,
    events,
    sessionEvents,
    bursts,
    run(ms: number) {
      engine.advance(ms);
    },
    flush() {
      engine.advance(ONE_STEP);
    },
    until(predicate, ms) {
      let waited = 0;
      while (!predicate() && waited < ms) {
        engine.advance(ONE_STEP * 3);
        waited += ONE_STEP * 3;
      }
      if (!predicate())
        throw new Error(`simulation never reached the expected condition within ${ms}ms`);
    },
    tap(target, atMs) {
      const timestamp = atMs ?? engine.getState().nowMs;
      send({ type: 'tap', x: 0, y: 0, timestamp, target, source: 'keyboard' });
      engine.advance(ONE_STEP);
    },
    hold(target, ms) {
      send({
        type: 'hold',
        x: 0,
        y: 0,
        timestamp: engine.getState().nowMs,
        target,
        source: 'keyboard',
      });
      engine.advance(ms);
    },
    press(target) {
      send({
        type: 'hold',
        x: 0,
        y: 0,
        timestamp: engine.getState().nowMs,
        target,
        source: 'keyboard',
      });
      engine.advance(ONE_STEP);
    },
    release(target) {
      send({
        type: 'release',
        x: 0,
        y: 0,
        timestamp: engine.getState().nowMs,
        target,
        source: 'keyboard',
      });
      engine.advance(ONE_STEP);
    },
    swipe(target, vx, vy) {
      send({
        type: 'swipe',
        x: 0,
        y: 0,
        timestamp: engine.getState().nowMs,
        target,
        source: 'keyboard',
        velocity: { vx, vy },
      });
      engine.advance(ONE_STEP);
    },
    dragTo(x, y) {
      send({ type: 'drag', x, y, timestamp: engine.getState().nowMs, source: 'pointer' });
      engine.advance(ONE_STEP);
    },
    pointerDown(x, y) {
      send({ type: 'hold', x, y, timestamp: engine.getState().nowMs, source: 'pointer' });
      engine.advance(ONE_STEP);
    },
    pointerUp(x, y) {
      send({ type: 'release', x, y, timestamp: engine.getState().nowMs, source: 'pointer' });
      engine.advance(ONE_STEP);
    },
    state: () => engine.getState(),
  };
}

/** Light the rod and leave it smouldering — the state most tests want to start from. */
export function lit(h: Harness, extraMs = 0): void {
  h.tap('cigarette');
  h.run(16);
  h.tap('lighter');
  h.run(900);
  // 900 ms is how long the fixture's lighter takes, not how long every one of them does. A caller
  // that presses the rod while the cherry is still lighting gets nothing: `beginPuff` only draws
  // from a lit state, so the hold is ignored, the release ends no puff, and the test goes on to
  // measure a plume that was never breathed. Wait for the cherry, and say so loudly if it never
  // comes.
  h.until(() => {
    const state = h.state().cigarette.state;
    return state !== 'IDLE' && state !== 'LIGHTING';
  }, 3000);
  if (extraMs > 0) h.run(extraMs);
}

export function sessionTypes(h: Harness): string[] {
  return h.sessionEvents.map((event) => event.type);
}
