import { describe, expect, it } from 'vitest';
import {
  STAGE_LAYOUTS,
  CHROME_CLEAR_Y,
  chromeClearY,
  computeAnchors,
  deriveSmokeCharacter,
  hitToleranceFor,
  layoutFor,
  plumeFor,
  resolveTarget,
  stageBoxFor,
  stageDistance,
  touchReach,
  type StageAnchors,
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

  it('no prop lies under the chrome, in any shape of stage (§ the phone heap)', () => {
    // The pill and the rail are fixed-pixel furniture over the bottom of the scene. A rod lying
    // below them is drawn behind the button that draws it, and nothing on the table is then
    // tappable that the player can actually see.
    for (const layout of Object.values(STAGE_LAYOUTS)) {
      const points: Record<string, { x: number; y: number }> = {
        table: layout.table,
        pack: layout.pack,
        lighter: layout.lighter,
        ashtray: layout.ashtray,
        restPivot: layout.restPivot,
      };
      for (const [name, point] of Object.entries(points)) {
        expect(point.y, `${layout.id}.${name} lies under the chrome`).toBeLessThanOrEqual(
          CHROME_CLEAR_Y,
        );
      }
      expect(layout.tableEdgeY, `${layout.id}'s horizon`).toBeLessThan(CHROME_CLEAR_Y);
    }
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

  it('every point along the rod answers a tap, not only its middle (§66)', () => {
    // The rod is ~0.26 stage units long and ~0.01 thick. Measured against its midpoint alone, a
    // cursor tapping either end hit nothing at all — reproduced in the browser at 1280x800, where
    // only the middle fifth of the rod answered.
    const h = harness();
    h.engine.setStageAspect(1.6);
    const desktop = h.state();
    const rod = { from: desktop.anchors.rodStart, to: desktop.anchors.ember };
    const along = (fraction: number) => ({
      x: rod.from.x + (rod.to.x - rod.from.x) * fraction,
      y: rod.from.y + (rod.to.y - rod.from.y) * fraction,
    });

    for (const fraction of [0, 0.5, 1]) {
      expect(
        resolveTarget(along(fraction), desktop.anchors, desktop.cigarette.ash.length, 1.6, 1),
        `cursor tap at ${fraction} along the rod`,
      ).not.toBeNull();
    }

    // On a phone the same tap fell to the tray instead, whose widened radius overlaps the rod.
    h.engine.setStageAspect(0.46);
    const phone = h.state();
    const phoneRod = { from: phone.anchors.rodStart, to: phone.anchors.ember };
    for (const fraction of [0, 0.25, 0.5, 0.75]) {
      const point = {
        x: phoneRod.from.x + (phoneRod.to.x - phoneRod.from.x) * fraction,
        y: phoneRod.from.y + (phoneRod.to.y - phoneRod.from.y) * fraction,
      };
      expect(
        resolveTarget(point, phone.anchors, phone.cigarette.ash.length, 0.46, 1.6),
        `thumb tap at ${fraction} along the rod`,
      ).not.toBe('ashtray');
    }

    // A point well clear of the rod is still not the rod.
    expect(
      resolveTarget({ x: rod.from.x, y: rod.from.y - 0.3 }, desktop.anchors, 0, 1.6, 1),
    ).not.toBe('cigarette');
  });

  it('the tray and a rod lying on the table keep their own ground (§66)', () => {
    // Not a tie-break: the two targets must not overlap at all. When they did, a tap meant for
    // the rod answered as "put it out", and a player has no way to explain that to themselves —
    // it reads as the game resetting. Checked in every layout, on a finger's own tolerance.
    for (const aspect of [0.46, 1, 1.9]) {
      const h = harness();
      h.engine.setStageAspect(aspect);
      const state = h.state();
      const trayReach = touchReach(state.anchors.ashtrayRadius, 1.6);
      expect(
        stageDistance(state.anchors.body, state.anchors.ashtray, aspect),
        `aspect ${aspect}: the tray reaches the rod lying beside it`,
      ).toBeGreaterThan(trayReach);
      expect(resolveTarget(state.anchors.body, state.anchors, 0, aspect, 1.6)).toBe('cigarette');
      expect(resolveTarget(state.anchors.ashtray, state.anchors, 0, aspect, 1.6)).toBe('ashtray');
    }
  });

  it('a finger budget stops growing once the target is wide (§66)', () => {
    // Small things get the whole multiplier; wide ones stop at one finger's slop, whichever of
    // the two is the smaller reach. Without the cap the tray — already the widest object on the
    // table — covered 0.216 units, which on a 393 px phone is a circle almost as wide as it is.
    expect(touchReach(0.02, 1.6)).toBeCloseTo(0.032, 6); // multiplier wins
    expect(touchReach(0.066, 1.6)).toBeCloseTo(0.1056, 6); // the crossover
    expect(touchReach(0.085, 1.6)).toBeCloseTo(0.125, 6); // the cherry: pad wins
    expect(touchReach(0.135, 1.6)).toBeCloseTo(0.175, 6); // the tray: pad wins
    // A cursor is not a finger: nothing grows at all.
    expect(touchReach(0.085, 1)).toBe(0.085);
  });

  it('a finger gets a bigger target than a cursor (§66)', () => {
    expect(hitToleranceFor('touch')).toBeGreaterThan(1);
    expect(hitToleranceFor('mouse')).toBe(1);
    expect(hitToleranceFor(undefined)).toBe(1);

    // Typed as the real shape, so a new anchor field breaks this file at compile time rather
    // than at runtime.
    const anchors: StageAnchors = {
      pack: { x: 0.2, y: 0.9 },
      lighter: { x: 0.1, y: 0.7 },
      ashtray: { x: 0.8, y: 0.9 },
      body: { x: 0.5, y: 0.6 },
      ember: { x: 0.66, y: 0.55 },
      ash: { x: 0.66, y: 0.55 },
      rodStart: { x: 0.34, y: 0.65 },
      ashEnd: { x: 0.66, y: 0.55 },
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
      const exhales: { spreadDeg: number; turbulence: number; rise: number }[] = [];
      for (let round = 0; round < 6; round += 1) {
        h.press('cigarette');
        h.run(600);
        h.release('cigarette');
        h.run(400);
      }
      for (const event of h.bursts) {
        if (event.kind === 'burst' && event.burst.kind === 'exhale') exhales.push(event.burst);
      }
      if (exhales.length < 2) throw new Error(`only ${exhales.length} exhales captured`);
      const mean = (pick: (burst: (typeof exhales)[number]) => number): number =>
        exhales.reduce((sum, burst) => sum + pick(burst), 0) / exhales.length;
      return {
        spreadDeg: mean((burst) => burst.spreadDeg),
        turbulence: mean((burst) => burst.turbulence),
        rise: mean((burst) => burst.rise),
        samples: exhales.length,
      };
    };

    // Averaged over several breaths on purpose: every burst is sampled from a ±40% envelope, so
    // a single one is not evidence of which rod rolls harder.
    const pouring = capture('test-rod');
    const restless = capture('test-long');

    // The curtain rod's smoke sinks and lies down; the other one climbs and rolls.
    expect(pouring.rise).toBeLessThan(0);
    expect(restless.rise).toBeGreaterThan(0);
    expect(pouring.spreadDeg).toBeGreaterThan(restless.spreadDeg);
    expect(restless.turbulence).toBeGreaterThan(pouring.turbulence);
  });
});

describe('the chrome takes pixels, not a fraction (§55)', () => {
  it('lifts the table on a short stage and leaves a tall one alone', () => {
    const landscape = layoutFor(2.16, chromeClearY(390));
    const desktop = layoutFor(2.16, chromeClearY(900));
    expect(landscape.table.y).toBeLessThan(STAGE_LAYOUTS.wide.table.y);
    // A desktop window has more stage than the button needs, so nothing moves: the layout the
    // brief drew is still the layout a player sees, and a replay of it is unchanged.
    expect(desktop).toEqual(STAGE_LAYOUTS.wide);
  });

  it('keeps the horizon above the table it lifts, at every height', () => {
    for (const height of [360, 390, 568, 844, 900, 1080]) {
      const clear = chromeClearY(height);
      const layout = layoutFor(2.16, clear);
      // Lift the table past the horizon and the rod floats in the air above the surface it lies on.
      expect(layout.tableEdgeY, `${height}px tall: the horizon`).toBeLessThan(layout.table.y);
      expect(
        layout.ashtray.y + layout.ashtrayRadius,
        `${height}px tall: the tray`,
      ).toBeLessThanOrEqual(clear);
    }
  });

  it('lifts nothing that already clears the line', () => {
    // The brief's own table, untouched, when there is room for it: a desktop window has more
    // stage than the button needs, so a layout change there would be a regression, not a fix.
    const aspects: Record<'tall' | 'regular' | 'wide', number> = {
      tall: 0.46,
      regular: 1,
      wide: 2.16,
    };
    for (const [id, aspect] of Object.entries(aspects)) {
      expect(layoutFor(aspect, 1)).toEqual(STAGE_LAYOUTS[id as 'tall']);
    }
  });
});
