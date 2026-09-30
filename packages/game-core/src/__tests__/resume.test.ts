/**
 * Resuming a break that outlived its app — SPEC.md §81 (4).
 *
 * A hidden tab still has a loop to catch up, and that path is verified in the browser. A phone
 * that locks and reclaims the page has nothing left: the only honest record is the burn position
 * and the moment the cherry caught, which is what these tests put through a second engine.
 */

import { describe, expect, it } from 'vitest';
import {
  createDefaultSettings,
  createEngine,
  STEP_MS,
  type GameEngine,
  type GameStateView,
  type OpenBreak,
} from '@puffly/game-core';
import { FIXTURE } from './fixture';
import { harness, lit } from './harness';

const BURN_MS = 4000;

function breakOf(heldMs: number) {
  const h = harness({ seed: 909 });
  h.tap('cigarette');
  h.run(16);
  lit(h, 0);
  h.engine.startSession();
  h.run(heldMs);
  const record = h.engine.openBreakSnapshot();
  if (record === null) throw new Error('no open break after lighting');
  return { h, record };
}

/** A second app start: the same content and the same moment, but no memory of the break. */
function engineFor(record: OpenBreak, wallClockMs: number): GameEngine {
  return createEngine({
    content: FIXTURE,
    seed: record.seed,
    wallClockMs,
    settings: createDefaultSettings(),
    cigaretteId: record.cigaretteId,
    environmentId: record.environmentId,
    lighterId: record.lighterId,
    ashtrayId: record.ashtrayId,
  });
}

function intoFreshEngine(record: OpenBreak, nowWallClockMs: number): GameStateView {
  return engineFor(record, nowWallClockMs).restoreOpenBreak(record, nowWallClockMs);
}

describe('an unfinished break survives the app being killed (§81 (4))', () => {
  it('is only written while a break is running', () => {
    const h = harness();
    h.tap('cigarette');
    h.run(16);
    lit(h, 0);
    expect(h.engine.openBreakSnapshot()).toBeNull();
    h.engine.startSession();
    h.run(16);
    expect(h.engine.openBreakSnapshot()).not.toBeNull();
  });

  it('records where the burn is and when it caught', () => {
    const { h, record } = breakOf(800);
    expect(record.emberLit).toBe(true);
    expect(record.rodRemaining).toBeGreaterThan(0);
    expect(record.rodRemaining).toBeLessThan(1);
    expect(record.litAtWallMs).toBeGreaterThan(0);
    expect(record.startedAt).toBeGreaterThan(0);
    // The stamp and the burn agree: some of a 4 s rod has gone, not all of it.
    const burned = 1 - record.rodRemaining;
    expect(burned).toBeGreaterThan(0.02);
    expect(burned).toBeLessThan(0.6);
    // A copy: writing to it cannot reach the live session.
    const before = h.engine.openBreakSnapshot()?.rodRemaining;
    record.rodRemaining = 0.5;
    expect(h.engine.openBreakSnapshot()?.rodRemaining).toBe(before);
  });

  it('restores the rod at the position the wall clock says it reached', () => {
    const { record } = breakOf(900);
    const gap = 1200;
    const state = intoFreshEngine(record, record.litAtWallMs + gap);
    expect(state.cigarette.ember.lit).toBe(true);
    expect(state.cigarette.state).toBe('BURNING');
    expect(state.ui.sessionActive).toBe(true);
    expect(state.cigarette.rodRemaining).toBeCloseTo(record.rodRemaining - gap / BURN_MS, 3);
    // The clock the player comes back to is the clock that was really there.
    expect(state.wallClockMs).toBe(record.litAtWallMs + gap);
  });

  it('restores a rod that burnt out while nobody was watching', () => {
    const { record } = breakOf(400);
    const state = intoFreshEngine(record, record.litAtWallMs + BURN_MS * 3);
    expect(state.cigarette.ember.lit).toBe(false);
    expect(state.cigarette.state).toBe('EXTINGUISHED');
    // The break is still there to be closed; it is not a fresh rod pretending to be one.
    expect(state.ui.sessionActive).toBe(true);
  });

  it('keeps the record honest: the resumed break closes as the same session', () => {
    const { record } = breakOf(600);
    const engine = engineFor(record, record.litAtWallMs);
    engine.restoreOpenBreak(record, record.litAtWallMs + 900);
    expect(engine.sessionId()).toBe(record.id);
    const session = engine.endSession();
    expect(session?.id).toBe(record.id);
    expect(session?.startedAt).toBe(record.startedAt);
    expect(session?.cigaretteId).toBe('test-rod');
  });

  it('resumes the countdown at the minute the break was really in', () => {
    const { record } = breakOf(600);
    const gap = 1500;
    const now = record.litAtWallMs + gap;
    const engine = engineFor(record, record.litAtWallMs);
    engine.restoreOpenBreak(record, now);
    const stepsBefore = engine.steps();
    engine.advance(120);
    // The clock owes the whole absence, not only the part somebody watched: a resume that
    // restarts the countdown is showing a break that never happened.
    const owed = now - record.startedAt;
    expect(owed).toBeGreaterThan(1000);
    const remaining = engine.getState().ui.sessionRemainingMs;
    expect(remaining).toBeLessThan(record.targetMs - 1000);
    expect(remaining).toBeCloseTo(
      record.targetMs - owed - (engine.steps() - stepsBefore) * STEP_MS,
      1,
    );
  });

  it('a break that outlived its own target while away comes back finished', () => {
    const { record } = breakOf(300);
    const awayMs = record.targetMs * 2;
    const engine = engineFor(record, record.litAtWallMs);
    engine.restoreOpenBreak(record, record.litAtWallMs + awayMs);
    const session = engine.endSession();
    expect(session?.completed).toBe(true);
    // The logged wall span covers the absence, not just the part somebody watched.
    const loggedMs = session === null ? 0 : (session.endedAt ?? 0) - session.startedAt;
    expect(loggedMs).toBeGreaterThanOrEqual(awayMs);
  });

  it('a record whose rod was never lit comes back unlit', () => {
    const { record } = breakOf(400);
    const state = intoFreshEngine({ ...record, emberLit: false }, record.litAtWallMs + 100);
    expect(state.cigarette.ember.lit).toBe(false);
    expect(state.cigarette.state).toBe('EXTINGUISHED');
  });
});
