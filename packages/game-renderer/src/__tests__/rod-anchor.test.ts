/**
 * The rod, its cherry and the smoke have to be the same object — SPEC.md §55, §17.
 *
 * `viewport.px()` maps normalised x by the stage's width and normalised y by its height, because
 * the layout is authored in fractions of the box and the box is a phone. That is a deliberate
 * choice, and `stageDistance` already corrects for it so a tap target stays round on screen. What
 * it means is that normalised space is *not* a picture: an angle authored in it is not the angle
 * the thing makes on the display, and one normalised length is not one number of pixels.
 *
 * `drawCigarette` drew it anyway — `rotate(angleDeg)` then `len(rodLength)`, a circular transform
 * applied into an elliptical space. On a 390×844 phone that put the burning end 52 px away from
 * `pose.tip`, which is where the smoke is born, where the cherry's own glow is centred, and what
 * a tap is measured against. The thread rose out of empty air beside the rod. Measured in a real
 * browser before the fix: brightest pixel of the drawn cherry at (355, 340), the mapped tip at
 * (317.6, 311.6).
 *
 * So the rod's frame is built from the two endpoints the core already agrees on. The visible cost
 * is that the rod now sits at its mapped angle rather than the authored one — which is what the
 * rest of the scene, and hit-testing, already assume.
 */

import { describe, expect, it } from 'vitest';
import { createEngine, type GameStateView } from '@puffly/game-core';
import { createViewport } from '../viewport';
import { drawCigarette } from '../props';
import { createFakeCanvas, type FakeCall } from './fakeCanvas';
import { FIXTURE } from '../../../game-core/src/__tests__/fixture';

const W = 390;
const H = 844;

/** A held, lit, partly-burnt rod: the state the complaint was made against. */
function heldView(): GameStateView {
  const engine = createEngine({
    content: FIXTURE,
    seed: 5,
    wallClockMs: Date.UTC(2026, 8, 29, 21, 30),
  });
  engine.send({ type: 'tap', x: 0, y: 0, timestamp: 0, target: 'cigarette', source: 'keyboard' });
  engine.send({ type: 'tap', x: 0, y: 0, timestamp: 0, target: 'lighter', source: 'keyboard' });
  // Two seconds of a four-second rod: lit, held, and with enough of it left to measure.
  for (let frame = 0; frame < 120; frame++) engine.advance(1000 / 60);
  return engine.getState();
}

function drawnRod(calls: FakeCall[]): {
  angle: number;
  length: number;
  pivot: { x: number; y: number };
} {
  const translate = calls.find((call) => call.name === 'translate');
  const rotate = calls.find((call) => call.name === 'rotate');
  // The brand band is painted at 62% of the rod's length, which makes it an observable for the
  // length itself without depending on the local `roundRect` helper (that draws paths, so the
  // recording context never sees a call named after it).
  const band = calls.find((call) => call.name === 'fillRect' && Number(call.args[0]) > 1);
  expect(translate, 'the rod was never placed').toBeDefined();
  expect(rotate, 'the rod was never turned').toBeDefined();
  expect(band, 'the rod was never drawn').toBeDefined();
  return {
    pivot: { x: Number(translate?.args[0]), y: Number(translate?.args[1]) },
    angle: Number(rotate?.args[0]),
    length: Number(band?.args[0]) / 0.62,
  };
}

describe('the rod is drawn where its own endpoints are (§55)', () => {
  const view = heldView();
  const viewport = createViewport({ width: W, height: H, dpr: 1 });
  const fake = createFakeCanvas();
  drawCigarette(fake.ctx, view, viewport);
  const rod = drawnRod(fake.calls);

  const pivot = viewport.px(view.cigarette.pose.pivot);
  const tip = viewport.px(view.cigarette.pose.tip);
  const wantAngle = Math.atan2(tip.y - pivot.y, tip.x - pivot.x);
  const wantLength = Math.hypot(tip.x - pivot.x, tip.y - pivot.y);

  it('had a rod to measure', () => {
    // Precondition, stated so the three cases below cannot pass by measuring a burnt-out stub
    // whose tip sits on its own pivot.
    expect(wantLength).toBeGreaterThan(40);
  });

  it('is placed at the pivot the core mapped', () => {
    expect(rod.pivot.x).toBeCloseTo(pivot.x, 1);
    expect(rod.pivot.y).toBeCloseTo(pivot.y, 1);
  });

  it('is turned to the angle that end actually makes on screen', () => {
    // The authored `pose.angleDeg` is a normalised-space angle. On a phone the stage stretches it
    // by height/width, so drawing with it turns the rod to somewhere the tip has never been.
    expect(rod.angle).toBeCloseTo(wantAngle, 4);
    expect(Math.abs(rod.angle - (view.cigarette.pose.angleDeg * Math.PI) / 180)).toBeGreaterThan(
      0.1,
    );
  });

  it('and its far end is the point the smoke comes out of', () => {
    const end = {
      x: rod.pivot.x + Math.cos(rod.angle) * rod.length,
      y: rod.pivot.y + Math.sin(rod.angle) * rod.length,
    };
    expect(Math.hypot(end.x - tip.x, end.y - tip.y)).toBeLessThan(1.5);
    expect(rod.length).toBeCloseTo(wantLength, 1);
  });
});
