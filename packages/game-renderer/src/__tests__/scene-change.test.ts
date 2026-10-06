/**
 * A room is a setting the player can pick, so it has to move pixels — SPEC.md §23.
 *
 * This is the same question `plume-palette.test.ts` asks about a skin's 烟羽 layer, and it is
 * asked the same way: not "was the field written", but "did the picture change". One state is
 * rendered twice with nothing varied but the environment, so any difference in what the
 * background asks to paint with can only have come from the room.
 */

import { describe, expect, it } from 'vitest';
import {
  createDefaultSettings,
  createEngine,
  type Environment,
  type GameStateView,
} from '@puffly/game-core';
import { createViewport } from '../viewport';
import { drawBackground } from '../background';
import { createFakeCanvas, deepFreeze } from './fakeCanvas';
import { FIXTURE } from '../../../game-core/src/__tests__/fixture';

const STEP_MS = 1000 / 60;

function baseState(): GameStateView {
  const engine = createEngine({
    content: FIXTURE,
    seed: 909,
    wallClockMs: Date.UTC(2026, 8, 29, 21, 30, 0),
    settings: createDefaultSettings(),
  });
  for (let frame = 0; frame < 60; frame++) engine.advance(STEP_MS);
  return deepFreeze(JSON.parse(JSON.stringify(engine.getState())) as GameStateView);
}

/** Every colour the background pass put on the table, in the order it asked for them. */
function painted(state: GameStateView): string[] {
  const canvas = createFakeCanvas();
  const viewport = createViewport({ width: 390, height: 844, dpr: 2 });
  drawBackground(canvas.ctx, state, viewport);
  const stops = canvas.gradients.flatMap((gradient) => gradient.stops.map((stop) => stop.color));
  const fills = canvas.calls
    .filter((call) => call.name === 'set:fillStyle' || call.name === 'set:strokeStyle')
    .map((call) => String((call.args as string[])[0]));
  return [...stops, ...fills].filter((colour) => colour.startsWith('rgb'));
}

function withRoom(state: GameStateView, room: Environment): GameStateView {
  const next = JSON.parse(JSON.stringify(state)) as GameStateView & {
    environment: Environment;
  };
  next.environment = room;
  return next;
}

describe('a room changes the picture (§23)', () => {
  it('has two rooms to compare, and they are not the same place', () => {
    const rooms = FIXTURE.environments;
    expect(rooms.length, 'the fixture carries more than one room').toBeGreaterThan(1);
    const [first, second] = rooms as [Environment, Environment];
    expect(JSON.stringify(first.background)).not.toBe(JSON.stringify(second.background));
  });

  it('paints differently when the room is the only thing that changed', () => {
    const state = baseState();
    const [first, second] = FIXTURE.environments as [Environment, Environment];
    const here = painted(withRoom(state, first));
    const there = painted(withRoom(state, second));

    expect(here.length, 'the background asked for colours').toBeGreaterThan(10);
    const same = there.filter((colour, index) => colour === here[index]).length;
    // Not "a bit different": the room's own sky, horizon, silhouette and fog are most of what the
    // background paints with, so a change this large going unnoticed would mean the pass reads a
    // field nobody writes.
    expect(same / here.length, 'how many colours survived the room change').toBeLessThan(0.5);
  });

  it('paints the same thing twice, so the difference above is not noise', () => {
    const state = baseState();
    const [first] = FIXTURE.environments as [Environment, Environment];
    expect(painted(withRoom(state, first))).toEqual(painted(withRoom(state, first)));
  });

  it('gets there by selecting: the engine writes the chosen room into the state', () => {
    // The two tests above hand the renderer a state with a room already in it. This is the link
    // that could be missing in a shipped build: a pick that updates nothing the picture reads.
    const engine = createEngine({
      content: FIXTURE,
      seed: 909,
      wallClockMs: Date.UTC(2026, 8, 29, 21, 30, 0),
      settings: createDefaultSettings(),
    });
    const [, second] = FIXTURE.environments as [Environment, Environment];
    engine.selectEnvironment(second.id);
    engine.advance(STEP_MS);
    const state = engine.getState() as GameStateView & { environment: Environment };
    expect(state.environment.id).toBe(second.id);
    expect(painted(state).length).toBeGreaterThan(10);
  });
});
