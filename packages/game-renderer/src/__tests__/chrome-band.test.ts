/**
 * The chrome owns a band at the bottom of the window, and it is measured in pixels — so a stage
 * that is short pays for it in *fraction*. SPEC.md §55 keeps every prop above that line, and this
 * checks the line against the shell that draws it rather than against a constant.
 *
 * The bug this looks for: a phone turned sideways. At 390 CSS px of height the pill's top edge
 * lands at 0.66 of the stage, while the layout's table line is 0.695 — so the rod you have not
 * picked up yet is drawn behind the button that picks it up, which is the "the button and the
 * cigarette overlap" complaint in landscape.
 */

import { describe, expect, it } from 'vitest';
import {
  createDefaultSettings,
  createEngine,
  layoutFor,
  type GameStateView,
} from '@puffly/game-core';
import { createViewport } from '../viewport';
import { lighterBox, packBox } from '../props';
import { FIXTURE } from '../../../game-core/src/__tests__/fixture';

/**
 * `.cta { bottom: calc(74px + safe-area) }` and `.pill { min-height: 58px }` in CtaPill.vue:
 * the highest pixel the main button can paint, counted up from the bottom of the window.
 */
const CHROME_BAND_PX = 74 + 58;
/** Not flush against the edge: the pill also casts a shadow, and a touching thing reads as one. */
const CLEARANCE_PX = 12;

const SHAPES: readonly [number, number][] = [
  [320, 568],
  [360, 740],
  [390, 844],
  [414, 896],
  [390, 660],
  [600, 900],
  [768, 1024],
  [844, 390],
  [740, 360],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [2560, 1080],
];

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function stateFor(width: number, height: number): GameStateView {
  const engine = createEngine({
    content: FIXTURE,
    seed: 11,
    wallClockMs: Date.UTC(2026, 9, 6, 22, 0, 0),
    settings: createDefaultSettings(),
  });
  // The same two numbers the shell hands the engine: the shape, and how tall the stage is in
  // pixels — because the chrome the layout has to clear is fixed pixels, not a fraction.
  engine.setStageAspect(width / height, height);
  engine.advance(100);
  return engine.getState();
}

/** What is lying on the table, as pixels on this window. */
function drawnThings(state: GameStateView, width: number, height: number): Record<string, Box> {
  const viewport = createViewport({ width, height, dpr: 2 });
  const layout = state.stage.layout;
  const pose = state.cigarette.pose;
  // The same four corners `drawCigarette` rotates through: the rod is a rectangle laid out from
  // its pivot, so its box on screen is that rectangle rotated — no guessing at the angle.
  const pivot = viewport.px(pose.pivot);
  const angle = (pose.angleDeg * Math.PI) / 180;
  const rodLength = viewport.len(pose.rodLength);
  const halfThickness = viewport.len(pose.thickness) / 2;
  const corners = [
    [0, -halfThickness],
    [0, halfThickness],
    [rodLength, -halfThickness],
    [rodLength, halfThickness],
  ].map(([lx = 0, ly = 0]) => ({
    x: pivot.x + lx * Math.cos(angle) - ly * Math.sin(angle),
    y: pivot.y + lx * Math.sin(angle) + ly * Math.cos(angle),
  }));
  const rod = {
    x0: Math.min(...corners.map((p) => p.x)),
    x1: Math.max(...corners.map((p) => p.x)),
    y0: Math.min(...corners.map((p) => p.y)),
    y1: Math.max(...corners.map((p) => p.y)),
  };
  const tray = viewport.px(layout.ashtray);
  const reach = viewport.len(layout.ashtrayRadius);
  const len = (units: number): number => viewport.len(units);
  return {
    rod,
    ashtray: {
      x0: tray.x - reach,
      x1: tray.x + reach,
      y0: tray.y - reach,
      y1: tray.y + reach,
    },
    pack: packBox(viewport.px(layout.pack), len),
    lighter: lighterBox(viewport.px(layout.lighter), len),
  };
}

describe('the table clears the chrome (§55)', () => {
  it('draws nothing the main button paints over, at any window shape', () => {
    const violations: string[] = [];
    for (const [width, height] of SHAPES) {
      const state = stateFor(width, height);
      const bandTop = height - CHROME_BAND_PX;
      for (const [name, box] of Object.entries(drawnThings(state, width, height))) {
        if (box.y1 > bandTop - CLEARANCE_PX) {
          violations.push(
            `${width}x${height} (${layoutFor(width / height).id}): ${name} reaches y=${box.y1.toFixed(0)}, the pill starts at y=${bandTop}`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps the band claim honest: the shorter the window, the larger the share the chrome takes', () => {
    // The point of the test. A constant fraction cannot express this, and that is the hole.
    const share = (height: number): number => CHROME_BAND_PX / height;
    expect(share(844)).toBeLessThan(share(390));
    expect(share(390)).toBeGreaterThan(0.3);
  });
});
