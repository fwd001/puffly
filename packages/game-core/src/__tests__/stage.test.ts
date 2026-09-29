import { describe, expect, it } from 'vitest';
import {
  STAGE_LAYOUTS,
  computeAnchors,
  deriveSmokeCharacter,
  hitToleranceFor,
  layoutFor,
  plumeFor,
  resolveTarget,
  stageBoxFor,
  stageDistance,
} from '@puffly/game-core';
import { FIXTURE } from './fixture';
import { harness, lit } from './harness';

describe('stage shape decides where things live (§55)', () => {
  it('picks a layout per canvas shape', () => {
    expect(layoutFor(0.46).id).toBe('tall');
    expect(layoutFor(1).id).toBe('regular');
    expect(layoutFor(2.16).id).toBe('wide');
    expect(layoutFor(Number.NaN).id).toBe('regular');
  });

  it('a phone fills the screen; an ultrawide gets a centred band', () => {
    const phone = stageBoxFor(390, 844);
    expect(phone.width).toBe(390);
    expect(phone.height).toBe(844);

    const ultrawide = stageBoxFor(3440, 1440);
    expect(ultrawide.aspect).toBeCloseTo(1.9, 5);
    expect(ultrawide.width).toBeCloseTo(1440 * 1.9, 5);
    expect(ultrawide.x).toBeCloseTo((3440 - 1440 * 1.9) / 2, 5);
  });

  it('landscape spreads the props apart instead of crowding the middle', () => {
    const tall = STAGE_LAYOUTS.tall;
    const wide = STAGE_LAYOUTS.wide;
    expect(wide.ashtray.x - wide.pack.x).toBeGreaterThan(tall.ashtray.x - tall.pack.x);
    expect(wide.tableEdgeY).toBeLessThan(tall.tableEdgeY);
  });

  it('the engine re-lays the scene when the window changes shape', () => {
    const h = harness();
    const before = { ...h.state().anchors.ashtray };
    const beforeTable = { ...h.state().cigarette.pose.pivot };

    h.engine.setStageAspect(2.1);

    expect(h.state().stage.layout.id).toBe('wide');
    expect(h.state().anchors.ashtray.x).not.toBe(before.x);
    // An untouched rod follows its table, rather than being left behind by it.
    expect(h.state().cigarette.pose.pivot.x).toBeCloseTo(STAGE_LAYOUTS.wide.table.x, 6);
    expect(h.state().cigarette.pose.pivot.x).not.toBe(beforeTable.x);
  });

  it('hit areas stay round on a non-square stage', () => {
    const centre = { x: 0.5, y: 0.5 };
    // One unit of x is wider than one unit of y on a 2:1 stage, so the same normalised
    // offset must measure further away once the aspect is taken into account.
    const flat = stageDistance({ x: 0.6, y: 0.5 }, centre, 1);
    const wide = stageDistance({ x: 0.6, y: 0.5 }, centre, 2);
    expect(wide).toBeGreaterThan(flat);
    expect(wide).toBeCloseTo(0.2, 6);
  });

  it('an input that names a target still carries its own pixel (§65, §66)', () => {
    // A pointer already knows where it was pressed; only a keyboard borrows an anchor for a
    // position. Substituting the anchor for a finger too means "let go over the tray?" is
    // answered with where the rod happens to be lying — which is next to the tray.
    const h = harness();
    h.engine.startSession();
    let bodyAtSend = { x: 0, y: 0 };
    const record = (source: 'pointer' | 'keyboard') => {
      bodyAtSend = { ...h.state().anchors.body };
      h.engine.send({
        type: 'tap',
        x: 0.5,
        y: 0.5,
        timestamp: h.state().nowMs,
        target: 'cigarette',
        source,
      });
      h.run(20);
    };

    record('pointer');
    record('keyboard');
    const session = h.engine.endSession();
    const inputs = session?.inputs ?? [];
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({ x: 0.5, y: 0.5, source: 'pointer' });
    expect(inputs[1]?.x).not.toBe(0.5);
    expect(inputs[1]?.y).not.toBe(0.5);
    expect(
      Math.hypot((inputs[1]?.x ?? 0) - bodyAtSend.x, (inputs[1]?.y ?? 0) - bodyAtSend.y),
    ).toBeLessThan(0.001);
  });

  it('a finger gets a bigger target than a cursor (§66)', () => {
    expect(hitToleranceFor('touch')).toBeGreaterThan(1);
    expect(hitToleranceFor('mouse')).toBe(1);
    expect(hitToleranceFor(undefined)).toBe(1);

    const anchors = {
      pack: { x: 0.2, y: 0.9 },
      lighter: { x: 0.1, y: 0.7 },
      ashtray: { x: 0.8, y: 0.9 },
      body: { x: 0.5, y: 0.6 },
      ember: { x: 0.66, y: 0.55 },
      ash: { x: 0.66, y: 0.55 },
      ashtrayRadius: 0.1,
    };
    // A point just outside the cherry's radius: a cursor misses, a thumb does not.
    // Just past the cherry's own radius, still inside the widened one.
    const miss = { x: anchors.ember.x + 0.002, y: anchors.ember.y + 0.12 };
    expect(resolveTarget(miss, anchors, 0, 1, 1)).not.toBe('ember');
    expect(resolveTarget(miss, anchors, 0, 1, hitToleranceFor('touch'))).toBe('ember');
  });

  it('the whole break still works after a layout swap mid-session', () => {
    const h = harness();
    h.engine.setStageAspect(2.16);
    lit(h);
    expect(h.state().cigarette.state).toBe('BURNING');
    h.run(1500);
    expect(h.state().cigarette.rodRemaining).toBeLessThan(1);
    // The held rod uses the wide scene's tilt, not the portrait one.
    expect(h.state().cigarette.pose.angleDeg).toBeCloseTo(STAGE_LAYOUTS.wide.heldDeg, 0);
  });

  it('anchors agree with the pose the renderer will draw', () => {
    const h = harness();
    h.engine.setStageAspect(0.5);
    const layout = layoutFor(0.5);
    const anchors = computeAnchors(h.state().cigarette.pose, 0, layout);
    expect(anchors.ashtray.x).toBeCloseTo(layout.ashtray.x, 6);
    expect(anchors.lighter.y).toBeCloseTo(layout.lighter.y, 6);
  });
});

describe('every rod has its own plume (§13, §16)', () => {
  it('content names it, or the numbers say it', () => {
    const base = FIXTURE.cigarettes[0];
    if (!base) throw new Error('fixture lost its first rod');
    expect(deriveSmokeCharacter({ ...base, character: 'curtain' })).toBe('curtain');
    expect(['column', 'haze', 'curls', 'curtain', 'bloom']).toContain(
      deriveSmokeCharacter({ ...base, character: undefined }),
    );
  });

  it('the five characters really are five different bodies of air', () => {
    const shapes = (['column', 'haze', 'curls', 'curtain', 'bloom'] as const).map(plumeFor);
    const rises = shapes.map((shape) => Math.sign(shape.rise));
    // One of them falls instead of rising, and none of them share a spread.
    expect(rises).toContain(-1);
    expect(new Set(shapes.map((shape) => shape.spread)).size).toBe(shapes.length);
    expect(new Set(shapes.map((shape) => shape.count)).size).toBe(shapes.length);
  });

  it('two rods exhale differently, measured from the engine', () => {
    const capture = (cigaretteId: string) => {
      const h = harness({ seed: 808, cigaretteId });
      lit(h, 400);
      h.press('cigarette');
      h.run(600);
      h.release('cigarette');
      const first = h.bursts.find(
        (event) => event.kind === 'burst' && event.burst.kind === 'exhale',
      );
      if (first === undefined || first.kind !== 'burst')
        throw new Error('no exhale burst captured');
      return first.burst;
    };

    const pouring = capture('test-rod');
    const restless = capture('test-long');

    // The curtain rod's smoke sinks and lies down; the other one climbs and rolls.
    expect(pouring.rise).toBeLessThan(0);
    expect(restless.rise).toBeGreaterThan(0);
    expect(pouring.spreadDeg).toBeGreaterThan(restless.spreadDeg);
    expect(restless.turbulence).toBeGreaterThan(pouring.turbulence);
  });
});
