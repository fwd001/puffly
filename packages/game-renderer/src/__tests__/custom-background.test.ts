/**
 * The room is the player's to repaint — §57, and the last clause of the design's "背景也可以作为自定义".
 *
 * `applyBackground` sits beside `applySkin` and is held to the same two rules: it changes four
 * colours and nothing else, and a game that has not taken the room over pays nothing for the
 * possibility. The "nothing else" half is the one that matters here, because the background view
 * also carries `kind`, `fog` and `grain` — the shape of the place — and a palette that could reach
 * those would let a colour choice move the geometry, which is the same line the skin rule draws.
 */

import { describe, expect, it } from 'vitest';
import { createDefaultSettings, createEngine, type GameStateView } from '@puffly/game-core';
import type { ScenePalette } from '@puffly/game-core';
import { FIXTURE } from '../../../game-core/src/__tests__/fixture';
import { applyBackground } from '../renderer';

const PALETTE: ScenePalette = {
  skyTop: [8, 90, 180],
  skyBottom: [200, 40, 10],
  horizon: [0, 220, 120],
  silhouette: [250, 250, 0],
};

function view(): GameStateView {
  const engine = createEngine({
    content: FIXTURE,
    seed: 4242,
    wallClockMs: Date.UTC(2026, 8, 29, 21, 30, 0),
    settings: createDefaultSettings(),
  });
  engine.tick(1500);
  return JSON.parse(JSON.stringify(engine.getState())) as GameStateView;
}

describe('a room the player painted themselves (§57)', () => {
  it('paints the four layers, and the shape of the place stays the place', () => {
    const state = view();
    const painted = applyBackground(state, PALETTE);
    const background = painted.environment.background;
    expect(background.sky).toEqual([PALETTE.skyTop, PALETTE.skyBottom]);
    expect(background.horizon).toEqual(PALETTE.horizon);
    expect(background.silhouette).toEqual(PALETTE.silhouette);
    // `kind` decides whether there is a stairwell in the frame at all.
    expect(background.kind).toBe(state.environment.background.kind);
    expect(background.fog).toBe(state.environment.background.fog);
    expect(background.grain).toBe(state.environment.background.grain);
  });

  it('moves no number the simulation is measured by', () => {
    const state = view();
    const painted = applyBackground(state, PALETTE);
    const strip = (v: GameStateView): unknown => {
      const clone = JSON.parse(JSON.stringify(v)) as Record<string, unknown>;
      const environment = clone.environment as Record<string, unknown>;
      delete environment.background;
      return clone;
    };
    expect(strip(painted)).toEqual(strip(state));
  });

  it('hands back the same object when the player has not taken the room over', () => {
    const state = view();
    expect(applyBackground(state, null)).toBe(state);
    expect(applyBackground(state, undefined)).toBe(state);
  });

  it('never writes into the state the engine produced', () => {
    const state = view();
    const before = JSON.stringify(state);
    applyBackground(state, PALETTE);
    expect(JSON.stringify(state)).toBe(before);
  });
});
