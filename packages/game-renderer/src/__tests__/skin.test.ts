/**
 * The one redline a skin has, checked at the only seam it can reach: applying one must change
 * four colours and nothing else. A duration, a count or a temperature that moved under a palette
 * would turn cosmetics into difficulty, and the brief calls that out by name (§6.1).
 */

import { describe, expect, it } from 'vitest';
import { createEngine, createDefaultSettings, type GameStateView } from '@puffly/game-core';
import { FIXTURE } from '../../../game-core/src/__tests__/fixture';
import { applySkin } from '../renderer';

function view(): GameStateView {
  const engine = createEngine({
    content: FIXTURE,
    seed: 31337,
    wallClockMs: Date.UTC(2026, 8, 29, 21, 30, 0),
    settings: createDefaultSettings(),
  });
  engine.tick(1200);
  return JSON.parse(JSON.stringify(engine.getState())) as GameStateView;
}

const SKIN = {
  paper: [10, 20, 30] as [number, number, number],
  ember: [40, 50, 60] as [number, number, number],
  smoke: [70, 80, 90] as [number, number, number],
  pool: [100, 110, 120] as [number, number, number],
};

describe('a skin is four colours (§ redlines.skinIsCosmetic)', () => {
  it('no skin at all is the same object, not a copy of it', () => {
    const state = view();
    expect(applySkin(state, null)).toBe(state);
  });

  it('the four layers land, and nothing else moves', () => {
    const state = view();
    const skinned = applySkin(state, SKIN);

    expect(skinned.style.scene).toEqual({ ember: SKIN.ember, pool: SKIN.pool });
    expect(skinned.style.cigarette.paper).toEqual(SKIN.paper);
    expect(skinned.smoke.tint).toEqual(SKIN.smoke);

    // Everything the simulation is allowed to be measured by, unchanged.
    const strip = (view: GameStateView) => {
      const clone = JSON.parse(JSON.stringify(view)) as Record<string, unknown>;
      delete clone.style;
      const smoke = clone.smoke as Record<string, unknown> | undefined;
      delete smoke?.tint;
      return clone;
    };
    expect(strip(skinned)).toEqual(strip(state));
  });

  it('a skin cannot reach the ash, the band, the filter or the tray', () => {
    const state = view();
    const skinned = applySkin(state, SKIN);
    expect(skinned.style.cigarette).toEqual({
      ...state.style.cigarette,
      paper: SKIN.paper,
    });
    expect(skinned.style.ashtray).toEqual(state.style.ashtray);
    expect(skinned.style.lighter).toEqual(state.style.lighter);
    expect(skinned.style.smoke).toEqual(state.style.smoke);
  });

  it('the state the engine produced is never touched', () => {
    const state = view();
    const before = JSON.stringify(state);
    applySkin(state, SKIN);
    expect(JSON.stringify(state)).toBe(before);
  });
});
