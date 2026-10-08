/**
 * S6's 写实度 row, checked as a dial and — more importantly — as a limit.
 *
 * The deck's own split is 「写实 80% / 卡通 20%」, and the row it draws is a number: 80 / 20. Four
 * things a player can see come from the cartoon side — the push-in and the darkened edges at the
 * catch, the tray rocking when ash lands, and a spark bouncing off the table — and all four read one
 * multiplier. So the interesting questions are not "does the frame change" but:
 *
 *   1. does every detent the row can produce mean a different frame? A dial that saturates after two
 *      stops is a decoration, and the first version of this mapping did exactly that.
 *   2. does the dial actually reach the thing it claims to, through the scene rather than through a
 *      helper called directly? Both spark claims below read a pool the renderer itself integrates.
 *   3. does the simulation stay *exactly* where it was? That is the redline the Frozen Core rule
 *      draws for a skin, redrawn for a look, and it is why this file exists at all: a presentation
 *      number that reaches the burn is a cheat — it would let a player buy a longer smoke with a
 *      slider.
 */

import { describe, expect, it } from 'vitest';
import { createDefaultSettings, type GameStateView } from '@puffly/game-core';
import { cartoonScale, createCanvasRenderer, DECK_SPLIT, IGNITION_IMPACT } from '../renderer';
import { ParticlePool } from '../particles';
import { createFakeCanvas } from './fakeCanvas';
import type { SpriteImage, SpriteProvider } from '../sprites';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const W = 390;
const H = 844;
const STEP = 1000 / 60;

const sprites: SpriteProvider = {
  size: 64,
  soft: () => ({ width: 64, height: 64 }) as unknown as SpriteImage,
  clear: () => undefined,
};

function drawScene(realism: number, pool?: ParticlePool) {
  const canvas = createFakeCanvas();
  const renderer = createCanvasRenderer({
    ctx: canvas.ctx,
    width: W,
    height: H,
    dpr: 1,
    sprites,
    ...(pool ? { particles: pool } : {}),
    settings: {
      reducedMotion: false,
      quality: 'high',
      contrast: 'normal',
      visualCues: false,
      realism,
      skin: null,
    },
  });
  return { canvas, renderer };
}

interface Frame {
  /** The largest `scale` the frame asked for; 1 when the camera did not move. */
  zoom: number;
  /** The punch's own vignette alpha, read by shape and not by size — see `collect`. */
  edge: number;
  /** How many turns the frame made; the tray's rock is one of them. */
  turns: number;
}

interface Scene {
  frames: Frame[];
  /** The first frame after the ash was flicked off the column. */
  dropAt: number;
}

/**
 * One lit rod, drawn from the catch until a column is ready, then flicked and drawn again, with the
 * camera read back every frame. The harness is seeded and its wall clock fixed, so two runs differ
 * only in what the dial said.
 */
function run(realism: number): Scene {
  const { canvas, renderer } = drawScene(realism);
  const h = harness();
  // The shell forwards every engine event to the renderer. Wired before the light, because the punch
  // is born on the transition into 燃烧, and an event nobody forwards is a frame that never moved —
  // which reads as "nothing is broken" while measuring nothing.
  h.engine.on((event) => renderer.handleEvent(event));
  lit(h);

  const frames: Frame[] = [];
  const collect = (): void => {
    const before = canvas.calls.length;
    const gradientsBefore = canvas.gradients.length;
    renderer.render(h.state() as GameStateView, STEP);
    const scales = canvas.calls
      .slice(before)
      .filter((call) => call.name === 'scale')
      .map((call) => Number(call.args[0]));
    // Which gradient is the punch's own? Two in the frame are a transparent middle with a black rim:
    // the room's ambient darkening (a steady 0.730 whose inner circle is offset from its outer one)
    // and the vignette (concentric, because it closes the frame around its own middle). A bare
    // "largest black alpha" read that 0.730 and did not move when the dial did — the ruler was
    // wrong, not the scene. Linear and radial gradients share one recorded list, so the pairing has
    // to walk this frame's calls in order.
    const frameCalls = canvas.calls.slice(before);
    const frameGradients = canvas.gradients.slice(gradientsBefore);
    const vignette: number[] = [];
    let painted = 0;
    for (const call of frameCalls) {
      if (call.name !== 'createRadialGradient' && call.name !== 'createLinearGradient') continue;
      const gradient = frameGradients[painted];
      painted += 1;
      if (!gradient) continue;
      const colour = String(gradient.stops[1]?.color ?? '');
      const concentric =
        call.name === 'createRadialGradient' &&
        Number(call.args[0]) === Number(call.args[3]) &&
        Number(call.args[1]) === Number(call.args[4]);
      if (
        !concentric ||
        gradient.stops.length !== 2 ||
        gradient.stops[0]?.color !== 'rgba(0,0,0,0)' ||
        !colour.startsWith('rgba(0,0,0,')
      ) {
        continue;
      }
      vignette.push(Number((colour.match(/([\d.]+)\)$/) ?? ['0', '0'])[1]));
    }
    const turns = canvas.calls.slice(before).filter((call) => call.name === 'rotate').length;
    frames.push({
      zoom: scales.length > 0 ? Math.max(...scales) : 1,
      edge: vignette.length > 0 ? Math.max(...vignette) : 0,
      turns,
    });
  };

  // The column has to exist before it can be flicked, and it never exists before the catch, so the
  // punch and the rock both come out of one walk — with the frames counted rather than guessed.
  let ready = false;
  for (let step = 0; step < 200 && !ready; step++) {
    h.engine.advance(STEP);
    collect();
    ready = h.state().cigarette.ash.ready;
  }
  if (!ready) throw new Error('the fixture rod never grew a column to flick');
  h.tap('ash');
  const dropAt = frames.length;
  for (let step = 0; step < 45; step++) {
    h.engine.advance(STEP);
    collect();
  }
  renderer.dispose();
  return { frames, dropAt };
}

/** The three settings of the dial the cases below compare, each walked once. */
const scenes = new Map<number, Scene>();
const scene = (realism: number): Scene => {
  const cached = scenes.get(realism);
  if (cached) return cached;
  const built = run(realism);
  scenes.set(realism, built);
  return built;
};

const peakZoom = (s: Scene): number => Math.max(...s.frames.slice(0, 45).map((f) => f.zoom));
const peakEdge = (s: Scene): number => Math.max(...s.frames.slice(0, 45).map((f) => f.edge));

describe('the dial is a dial (S6: 写实度 80 / 20)', () => {
  it("puts the deck's own split exactly where the game already was", () => {
    // The shipped scene is one detent on the row, not a special case above or below it: nobody's
    // picture changed because this row appeared.
    expect(createDefaultSettings().realism).toBe(DECK_SPLIT);
    expect(cartoonScale(DECK_SPLIT)).toBeCloseTo(1, 12);
  });

  it('runs out at 写实 with no cartoon left, and doubles it at the 卡通 end', () => {
    expect(cartoonScale(1)).toBe(0);
    expect(cartoonScale(0)).toBeCloseTo(2, 12);
  });

  it('means something different at every stop the row can reach', () => {
    // `step="20"` in the sheet, so these six are all a tap can produce. The first mapping saturated
    // at 2×, which left four of the six drawing one identical frame: distinctness is the claim here,
    // and it is a different claim from the two magnitudes above.
    const detents = [0, 0.2, 0.4, 0.6, 0.8, 1].map(cartoonScale);
    expect(new Set(detents.map((value) => value.toFixed(6))).size).toBe(detents.length);
    // Monotone, so the left end of the track really is the cartoon end.
    expect(detents).toEqual([...detents].sort((a, b) => b - a));
  });

  it('survives a lying save instead of taking the frame down with it', () => {
    expect(cartoonScale(Number.NaN)).toBeCloseTo(1, 12);
    expect(cartoonScale(-4)).toBeCloseTo(2, 12);
    expect(cartoonScale(40)).toBe(0);
  });
});

describe('the frame moves by exactly what the dial says', () => {
  it('pushes in — twice as hard at one end, not at all at the other', () => {
    const shipped = peakZoom(scene(DECK_SPLIT)) - 1;
    const cartoonish = peakZoom(scene(0)) - 1;
    expect(shipped, 'the shipped scene lost its 冲击感').toBeGreaterThan(0);
    expect(shipped, 'the shipped push-in drifted off the constant').toBeLessThan(
      IGNITION_IMPACT.zoom + 1e-9,
    );
    // Ratios rather than absolute values: where `punch` peaks belongs to `ignition-punch.test.ts`,
    // and the claim here is only that the dial scales it.
    expect(cartoonish / shipped).toBeCloseTo(2, 6);
    expect(peakZoom(scene(1)), '写实 still shoved the camera').toBe(1);
  });

  it('closes the edges to match, including all the way off', () => {
    const shipped = peakEdge(scene(DECK_SPLIT));
    expect(shipped, 'the shipped scene lost its edge').toBeGreaterThan(0);
    expect(shipped).toBeLessThanOrEqual(IGNITION_IMPACT.edge + 1e-3);
    // Two digits, because the alpha is written as a three-decimal string: 0.219 against 0.439 is the
    // same punch doubled, and asking for more precision than the frame can print asks for noise.
    expect(peakEdge(scene(0)) / shipped).toBeCloseTo(2, 2);
    expect(peakEdge(scene(1)), '写实 still darkened the frame').toBe(0);
  });

  it('lets the tray rock, or lets the ash land on a table that does not answer', () => {
    // `drawAshtray` turns only while the rock is non-zero, so a rocking frame costs exactly one more
    // rotate than the same frame at 写实 — and one is the whole difference, because the rod, the pack
    // and the smoke all turn the same way in both runs.
    const shipped = scene(DECK_SPLIT);
    const real = scene(1);
    const rocking: number[] = [];
    for (let i = shipped.dropAt; i < shipped.frames.length; i++) {
      const delta = (shipped.frames[i]?.turns ?? -1) - (real.frames[i]?.turns ?? -1);
      expect(delta, `frame ${String(i)} turned more than the tray`).toBeLessThanOrEqual(1);
      if (delta === 1) rocking.push(i);
    }
    expect(rocking.length, 'the ash landed and the tray never moved').toBeGreaterThan(0);
    for (let i = 0; i < shipped.dropAt; i++) {
      expect(
        (shipped.frames[i]?.turns ?? -1) - (real.frames[i]?.turns ?? -1),
        `frame ${String(i)} was rocking before any ash landed`,
      ).toBe(0);
    }
  });
});

interface Spark {
  /** Plane crossings. The bounce is read at the first one — the only one with an incoming speed. */
  contacts: number;
  /** The highest point reached after it first touched the table, in stage units. */
  apex: number;
  /** What the table gave back, as a fraction of what the spark brought. */
  restitution: number;
  /** Frames in which the landing cost was charged. There is one per landing, never one per frame. */
  costs: number;
  firstMs: number;
  lastMs: number;
  /** Where the scene left it, in stage units. */
  finalY: number;
}

/**
 * One real lighting, drawn by the renderer, with the air it owns handed in so a spark keeps its
 * identity across frames. Nothing here calls the pool itself: `render()` is what integrates it, and
 * `handleEvent()` is what put the sparks in it, which is the only way the claim below is about the
 * game rather than about a helper.
 */
function sparksThroughTheScene(realism: number): { landed: Spark[]; plane: number } {
  const pool = new ParticlePool(1400);
  const { renderer } = drawScene(realism, pool);
  const h = harness();
  h.engine.on((event) => renderer.handleEvent(event));
  lit(h, 900);

  const seen = new Map<string, Spark>();
  h.press('cigarette');
  const key = (index: number, particle: { noiseSeed: number }): string =>
    `${String(index)}:${String(particle.noiseSeed)}`;

  for (let step = 0; step < Math.round(3000 / STEP); step++) {
    if (step === Math.round(1400 / STEP)) h.release('cigarette');
    h.engine.advance(STEP);
    const atMs = (step + 1) * STEP;
    const plane = h.state().stage.layout.table.y;
    // Snapshot the fall before the frame runs it, so a crossing has a speed to compare against and a
    // life to compare against.
    const falling = new Map<string, number>();
    const alive = new Map<string, number>();
    pool.forEachActive((particle, index) => {
      if (!particle.spark) return;
      falling.set(key(index, particle), particle.vy);
      alive.set(key(index, particle), particle.life);
    });
    renderer.render(h.state() as GameStateView, STEP);
    pool.forEachActive((particle, index) => {
      if (!particle.spark) return;
      const id = key(index, particle);
      const spark: Spark = seen.get(id) ?? {
        contacts: 0,
        apex: 0,
        restitution: 0,
        costs: 0,
        firstMs: 0,
        lastMs: 0,
        finalY: particle.y,
      };
      // The pool's own test: `py` is this step's starting height, so crossing the plane is not the
      // same thing as sitting on it.
      if (particle.py < plane - 1e-9 && particle.y >= plane - 1e-9) {
        const cameIn = falling.get(id) ?? 0;
        if (cameIn > 0) {
          spark.contacts += 1;
          spark.restitution = Math.abs(particle.vy) / cameIn;
          if (spark.contacts === 1) spark.firstMs = atMs;
        }
      }
      const before = alive.get(id) ?? particle.life;
      // Every frame spends `STEP` of life, so a landing is the *extra* decay on top of that — the
      // cost multiplies what is left by 0.8, which is always more than half a millisecond.
      if (before - particle.life > STEP + 0.5) spark.costs += 1;
      if (spark.contacts > 0) {
        spark.apex = Math.max(spark.apex, plane - particle.y);
        spark.lastMs = atMs;
      }
      spark.finalY = particle.y;
      seen.set(id, spark);
    });
  }
  renderer.dispose();
  return {
    landed: [...seen.values()].filter((spark) => spark.contacts > 0),
    plane: h.state().stage.layout.table.y,
  };
}

describe('a spark takes the table the way the dial says, through the scene', () => {
  // Both of these walk a whole scene, so they are the two heaviest lines in the file: alone the
  // whole file is ~0.4 s, but in a full-suite run on a busy machine this one was killed at vitest's
  // 5 s default at 7.2 s — a timeout, not an assertion. The ceiling says so; the claims do not move.
  it('at 写实 lands and stays landed, without being killed by the landing', () => {
    const { landed, plane } = sparksThroughTheScene(1);
    expect(landed.length, 'no spark ever reached the table').toBeGreaterThan(0);
    for (const spark of landed) {
      expect(spark.restitution, 'the table threw a spark back at the 写实 end').toBe(0);
      expect(spark.apex, 'a spark left the plane').toBeLessThan(1e-6);
      expect(Math.abs(spark.finalY - plane), 'a spark did not end on the table').toBeLessThan(1e-6);
      // One landing, one cost. The cost used to be charged on every frame the spark lay on the
      // plane — which is every frame, since it could not come back — and a spark that could not
      // bounce died five frames after the table took it.
      expect(spark.contacts, 'a spark crossed the plane more than once').toBe(1);
      expect(spark.costs, 'a spark was charged the landing more than once').toBeLessThanOrEqual(1);
    }
  }, 20_000);

  it('hops at the shipped split, higher at the 卡通 end, and never faster than it fell', () => {
    const shipped = sparksThroughTheScene(DECK_SPLIT);
    const cartoonish = sparksThroughTheScene(0);
    const topApex = (sparks: Spark[]): number => Math.max(...sparks.map((s) => s.apex));
    const topBounce = (sparks: Spark[]): number => Math.max(...sparks.map((s) => s.restitution));

    expect(topApex(shipped.landed), 'the shipped scene lost the hop').toBeGreaterThan(0.01);
    expect(topApex(cartoonish.landed) / topApex(shipped.landed)).toBeGreaterThan(1.2);

    // 0.55 × 2 is already past 1, and restitution at or above that returns more than it came with,
    // so every hop would rise higher than the last: 「比真实更脆」 asks for a snap, not a trampoline.
    for (const spark of shipped.landed) {
      expect(spark.costs, 'a landing was charged twice in one frame').toBeLessThanOrEqual(
        spark.contacts,
      );
    }
    expect(topBounce(shipped.landed)).toBeGreaterThan(0.4);
    expect(topBounce(shipped.landed)).toBeLessThan(0.7);
    expect(topBounce(cartoonish.landed), 'the cartoon end did not get bouncier').toBeGreaterThan(
      topBounce(shipped.landed),
    );
    for (const spark of cartoonish.landed) {
      expect(spark.restitution, 'a spark came back faster than it fell').toBeLessThan(1);
    }
  }, 20_000);
});

describe('the dial cannot reach the burn (Frozen Core, redrawn for a look)', () => {
  it('leaves the whole simulation identical at both ends of the row', () => {
    const session = (realism: number): string[] => {
      const h = harness({ settings: { realism } });
      lit(h);
      h.press('cigarette');
      for (let step = 0; step < 90; step++) h.engine.advance(STEP);
      h.release('cigarette');
      let ready = false;
      for (let step = 0; step < 200 && !ready; step++) {
        h.engine.advance(STEP);
        ready = h.state().cigarette.ash.ready;
      }
      h.tap('ash');
      for (let step = 0; step < 120; step++) h.engine.advance(STEP);
      // The event log is part of the claim: a setting that changed one burst would leave the state
      // looking similar while the session record told a different story.
      return [JSON.stringify(h.state()), ...h.events.map((event) => JSON.stringify(event))];
    };
    expect(session(1)).toEqual(session(0));
  });
});
