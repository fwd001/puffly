import { describe, expect, it } from 'vitest';
import {
  createEngine,
  createDefaultSettings,
  type Burst,
  type GameStateView,
} from '@puffly/game-core';
import { FIXTURE } from '../../../game-core/src/__tests__/fixture';
import { CIGARETTE_LENGTH, LAYOUT } from '@puffly/game-core';
import { ParticlePool } from '../particles';
import { FIELD_SCALE, intakeBurst, SMOKE_DRAG } from '../intake';
import { curl2, fbm2, noise2, wander } from '../noise';
import { createViewport } from '../viewport';
import { createCanvasRenderer, grainAlpha } from '../renderer';
import { drawEffects, EffectList } from '../effects';
import { drawAshtray } from '../props';
import { createFakeCanvas, deepFreeze, fakeSprite } from './fakeCanvas';

function burst(overrides: Partial<Burst> = {}): Burst {
  return {
    id: 'burst-1',
    kind: 'exhale',
    seed: 987654321,
    origin: { x: 0.5, y: 0.5 },
    count: 40,
    directionDeg: -90,
    spreadDeg: 60,
    speed: { min: 0.02, max: 0.09 },
    radius: { min: 0.01, max: 0.04 },
    lifeMs: { min: 2000, max: 5000 },
    alphaPeak: 0.4,
    alphaDecay: 0.7,
    rise: 0.2,
    turbulence: 1.1,
    scaleGrowth: 2.5,
    gravity: 0,
    tint: [200, 200, 204],
    heat: 0.4,
    ...overrides,
  };
}

describe('particles (§15, §54)', () => {
  it('holds exactly the fields SPEC.md §15 names', () => {
    const pool = new ParticlePool(8);
    const particle = pool.spawn({
      x: 0.1,
      y: 0.2,
      vx: 0.01,
      vy: -0.02,
      radius: 0.02,
      alphaPeak: 0.5,
      alphaDecay: 0.8,
      life: 1000,
      noiseSeed: 12,
      rotation: 0.3,
      scale: 1,
      scaleGrowth: 2,
      turbulence: 1,
      rise: 0.2,
      gravity: 0,
      drag: SMOKE_DRAG,
      layer: null,
      tint: [10, 20, 30],
      heat: 0.5,
      depth: 0.5,
      spark: false,
    });
    expect(particle).not.toBeNull();
    for (const field of [
      'x',
      'y',
      'vx',
      'vy',
      'radius',
      'alpha',
      'life',
      'maxLife',
      'noiseSeed',
      'rotation',
      'scale',
    ]) {
      expect(particle).toHaveProperty(field);
    }
  });

  it('never exceeds its budget, however many bursts arrive (§54)', () => {
    const pool = new ParticlePool(200);
    for (let i = 0; i < 60; i++) intakeBurst(burst({ seed: 1000 + i }), pool, { densityScale: 1 });
    expect(pool.size).toBeLessThanOrEqual(pool.capacity);
    expect(pool.size).toBeGreaterThan(0);
  });

  it('lives, fades in and out, and gives its slot back', () => {
    const pool = new ParticlePool(32);
    intakeBurst(burst({ count: 4, lifeMs: { min: 300, max: 400 } }), pool, { densityScale: 1 });
    const before = pool.size;
    expect(before).toBe(4);

    pool.update(120, { x: 0, y: 0 }, FIELD_SCALE, 0.12, null);
    let peak = 0;
    pool.forEachActive((particle) => {
      peak = Math.max(peak, particle.alpha);
    });
    expect(peak).toBeGreaterThan(0);

    pool.update(1200, { x: 0, y: 0 }, FIELD_SCALE, 1.3, null);
    expect(pool.size).toBe(0);
  });

  it('drift is a wind velocity, not a slow acceleration (§6)', () => {
    // Same burst for both pools, so the only difference is the wind it is sitting in — and no
    // turbulence, because the curl is a shared field now and the two pools drift apart into
    // different parts of it, which would be measured here instead of the wind.
    const recipe = burst({
      count: 4,
      speed: { min: 0, max: 0 },
      lifeMs: { min: 5000, max: 5000 },
      turbulence: 0,
    });
    const calm = new ParticlePool(16);
    const blown = new ParticlePool(16);
    intakeBurst(recipe, calm, { densityScale: 1 });
    intakeBurst(recipe, blown, { densityScale: 1 });

    for (let i = 0; i < 20; i++) {
      calm.update(50, { x: 0, y: 0 }, FIELD_SCALE, i * 0.05, null);
      blown.update(50, { x: 0.2, y: 0 }, FIELD_SCALE, i * 0.05, null);
    }

    // One second of 0.2 units/s wind is a fifth of the stage. As an acceleration it would be
    // roughly a fiftieth of that, which is the difference between a gust and a still cloud.
    expect(firstX(blown) - firstX(calm)).toBeGreaterThan(0.15);
    expect(firstX(blown) - firstX(calm)).toBeLessThan(0.26);
  });

  it('a puff never grows large enough to fog the stage (§58, §87)', () => {
    // The bug this guards: radius compounded per second *and* scale grew linearly, so after a
    // few minutes of smouldering every particle was a screen-sized blob and the room went white.
    const pool = new ParticlePool(400);
    for (let i = 0; i < 40; i++) {
      intakeBurst(burst({ seed: 500 + i, count: 12, lifeMs: { min: 3000, max: 8000 } }), pool, {
        densityScale: 1,
      });
      pool.update(250, { x: 0.02, y: 0 }, FIELD_SCALE, i * 0.25, null);
    }

    let worst = 0;
    pool.forEachActive((particle) => {
      // Same product the renderer draws with, measured in stage units.
      worst = Math.max(worst, particle.radius * particle.scale * particle.size);
    });
    expect(worst).toBeGreaterThan(0);
    // 220 CSS px on a 750 px stage is 0.29 units; nothing may exceed the clamp it is drawn with.
    expect(worst).toBeLessThan(0.29);
    pool.forEachActive((particle) => {
      expect(particle.size).toBeLessThanOrEqual(1 + particle.scaleGrowth + 1e-9);
    });
  });

  it('never produces NaN, even with absurd frame gaps', () => {
    const pool = new ParticlePool(64);
    intakeBurst(burst({ count: 20 }), pool, { densityScale: 1 });
    for (const dt of [0, 1, 16.7, 1000, 30_000])
      pool.update(dt, { x: 0.1, y: 0 }, FIELD_SCALE, dt / 1000, null);
    pool.forEachActive((particle) => {
      expect(Number.isFinite(particle.x)).toBe(true);
      expect(Number.isFinite(particle.y)).toBe(true);
      expect(Number.isFinite(particle.alpha)).toBe(true);
    });
  });

  it('the same burst seed produces the same smoke, twice (§71)', () => {
    const a = new ParticlePool(256);
    const b = new ParticlePool(256);
    const recipe = burst({ seed: 4242 });
    intakeBurst(recipe, a, { densityScale: 1 });
    intakeBurst(recipe, b, { densityScale: 1 });
    const snapshot = (pool: ParticlePool): string => {
      const parts: string[] = [];
      pool.forEachActive((particle) =>
        parts.push(`${particle.x.toFixed(6)}|${particle.y.toFixed(6)}|${particle.noiseSeed}`),
      );
      return parts.join(',');
    };
    expect(snapshot(a)).toBe(snapshot(b));
    expect(snapshot(a).length).toBeGreaterThan(10);
  });
});

function firstX(pool: ParticlePool): number {
  let value = Number.NaN;
  pool.forEachActive((particle) => {
    if (Number.isNaN(value)) value = particle.x;
  });
  return value;
}

describe('noise fields (§15)', () => {
  it('stays in range and repeats for the same input', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.13;
      expect(noise2(x, x * 0.7, 5)).toBeGreaterThanOrEqual(-1);
      expect(noise2(x, x * 0.7, 5)).toBeLessThanOrEqual(1);
      expect(noise2(x, x * 0.7, 5)).toBe(noise2(x, x * 0.7, 5));
    }
  });

  it('is not a constant: it actually moves', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 50; i++) seen.add(Math.round(fbm2(i * 0.31, i * 0.17, 3) * 1000));
    expect(seen.size).toBeGreaterThan(20);
  });

  it('curl gives finite, small velocities', () => {
    for (let i = 0; i < 100; i++) {
      const field = curl2(i * 0.2, i * 0.05, 11);
      expect(Number.isFinite(field.vx)).toBe(true);
      expect(Number.isFinite(field.vy)).toBe(true);
      expect(Math.abs(field.vx)).toBeLessThan(20);
    }
  });

  it('wander never blows up over a long session', () => {
    for (let t = 0; t < 600; t += 1) expect(Math.abs(wander(t, 7))).toBeLessThanOrEqual(1.5);
  });
});

describe('viewport (§55)', () => {
  it('keeps the stage inside its own aspect band instead of stretching it', () => {
    // An ultrawide canvas gets a centred band, not a scene flung to the corners (§55).
    const viewport = createViewport({ width: 1600, height: 800, dpr: 1 });
    expect(viewport.stage.width / viewport.stage.height).toBeCloseTo(1.9, 5);
    expect(viewport.stage.width).toBeLessThanOrEqual(1600);
    expect(viewport.stage.x).toBeGreaterThan(0);
    expect(viewport.stage.x).toBeCloseTo((1600 - viewport.stage.width) / 2, 6);
    expect(viewport.portrait).toBe(false);
  });

  it('never leaves the band, whatever device it is handed (§55)', () => {
    const canvases: [number, number][] = [
      [320, 568],
      [390, 844],
      [844, 390],
      [768, 1024],
      [1440, 900],
      [3440, 1440],
    ];
    for (const [width, height] of canvases) {
      const viewport = createViewport({ width, height, dpr: 2 });
      const aspect = viewport.stage.width / viewport.stage.height;
      expect(aspect).toBeGreaterThanOrEqual(0.419);
      expect(aspect).toBeLessThanOrEqual(1.901);
      expect(viewport.stage.width).toBeLessThanOrEqual(width + 0.001);
      expect(viewport.stage.height).toBeLessThanOrEqual(height + 0.001);
    }
  });

  it('fills a portrait phone and keeps the centre in the centre', () => {
    const viewport = createViewport({ width: 390, height: 844, dpr: 3 });
    expect(viewport.portrait).toBe(true);
    expect(viewport.stage.x).toBeCloseTo(0, 6);
    const centre = viewport.px({ x: 0.5, y: 0.5 });
    expect(centre.x).toBeCloseTo(viewport.stage.width / 2, 6);
  });

  it('scales lengths by the stage, so smoke looks the same size everywhere', () => {
    const small = createViewport({ width: 300, height: 400, dpr: 2 });
    const big = createViewport({ width: 1200, height: 1600, dpr: 1 });
    expect(big.len(0.1)).toBeGreaterThan(small.len(0.1));
    expect(small.dpr).toBe(2);
  });

  it('refuses a zero DPR instead of dividing by it', () => {
    const viewport = createViewport({ width: 100, height: 100, dpr: 0 });
    expect(viewport.dpr).toBe(1);
    viewport.resize(200, 200, Number.NaN);
    expect(viewport.dpr).toBe(1);
    // A square canvas is already inside the band, so it fills rather than being letterboxed.
    expect(viewport.stage.height).toBe(200);
    expect(viewport.stage.width).toBe(200);
    expect(viewport.aspect).toBeCloseTo(1, 6);
  });
});

describe('renderer as an adapter (§48)', () => {
  function rendererHarness() {
    const fake = createFakeCanvas();
    const sprites = { size: 16, soft: () => fakeSprite(16), clear: () => undefined };
    return { fake, sprites };
  }

  it('constructs against an injected context and fake sprites', () => {
    const { fake, sprites } = rendererHarness();
    const renderer = createCanvasRenderer({
      ctx: fake.ctx,
      width: 400,
      height: 600,
      dpr: 2,
      sprites,
    });
    expect(renderer.poolCapacity()).toBeGreaterThan(0);
    expect(renderer.particleCount()).toBe(0);
    renderer.dispose();
  });

  it('honours reduced motion by shrinking the pool (§64)', () => {
    const { fake, sprites } = rendererHarness();
    const calm = createCanvasRenderer({
      ctx: fake.ctx,
      width: 400,
      height: 600,
      dpr: 1,
      sprites,
      settings: {
        reducedMotion: true,
        quality: 'auto',
        contrast: 'normal',
        visualCues: false,
        realism: 0.8,
        skin: null,
      },
    });
    const loud = createCanvasRenderer({
      ctx: fake.ctx,
      width: 400,
      height: 600,
      dpr: 1,
      sprites,
      settings: {
        reducedMotion: false,
        quality: 'high',
        contrast: 'normal',
        visualCues: false,
        realism: 0.8,
        skin: null,
      },
    });
    expect(calm.poolCapacity()).toBeLessThan(loud.poolCapacity());

    const recipe = burst({ count: 60 });
    calm.handleEvent({ kind: 'burst', atMs: 0, burst: recipe });
    loud.handleEvent({ kind: 'burst', atMs: 0, burst: recipe });
    expect(calm.particleCount()).toBeLessThan(loud.particleCount());
  });

  it('high contrast raises smoke opacity and edges the rod (§64)', () => {
    // Same seed, same events, same number of frames — the only difference is the setting, so a
    // difference in the recorded alphas is attributable and not luck.
    const runCase = (contrast: 'normal' | 'high'): { alphaTotal: number; strokes: number } => {
      const fake = createFakeCanvas();
      const renderer = createCanvasRenderer({
        ctx: fake.ctx,
        width: 900,
        height: 1200,
        dpr: 2,
        sprites: { size: 16, soft: () => fakeSprite(16), clear: () => undefined },
        settings: {
          reducedMotion: false,
          quality: 'high',
          contrast,
          visualCues: false,
          realism: 0.8,
          skin: null,
        },
      });

      const engine = createEngine({
        content: FIXTURE,
        seed: 31337,
        wallClockMs: Date.UTC(2026, 8, 29, 21, 30, 0),
        settings: createDefaultSettings(),
      });
      engine.on((event) => renderer.handleEvent(event));

      const view = JSON.parse(JSON.stringify(engine.getState())) as GameStateView;
      const aim = (target: 'cigarette' | 'lighter', type: 'tap' | 'hold' | 'release') => {
        const anchors = engine.getState().anchors;
        const point = target === 'lighter' ? anchors.lighter : anchors.body;
        engine.send({
          type,
          x: point.x,
          y: point.y,
          timestamp: engine.getState().nowMs,
          target,
          source: 'pointer',
        });
      };

      aim('cigarette', 'tap');
      engine.advance(20);
      aim('lighter', 'tap');
      engine.advance(1500);
      aim('cigarette', 'hold');
      engine.advance(600);
      for (let i = 0; i < 12; i++) {
        engine.advance(16);
        renderer.render(view, 16);
      }
      aim('cigarette', 'release');
      engine.advance(600);
      for (let i = 0; i < 12; i++) {
        engine.advance(16);
        renderer.render(view, 16);
      }

      const alphas = fake.calls
        .filter((call) => call.name === 'set:globalAlpha')
        .map((call) => Number(call.args[0]))
        .filter((value) => Number.isFinite(value));
      renderer.dispose();
      return {
        alphaTotal: alphas.reduce((sum, value) => sum + value, 0),
        strokes: fake.count('stroke'),
      };
    };

    const high = runCase('high');
    const normal = runCase('normal');

    // Both halves of the claim are measured, so neither can pass by doing nothing: more smoke
    // light overall, and the rod's rim stroke existing only when the player asked for it.
    expect(normal.alphaTotal).toBeGreaterThan(0);
    expect(high.alphaTotal).toBeGreaterThan(normal.alphaTotal);
    // The tray's own rim is stroked in both runs; the extra strokes are the rod's edge, one per
    // rendered frame — 24 frames here, so a difference that small would mean it never drew.
    expect(high.strokes - normal.strokes).toBeGreaterThanOrEqual(20);
  });

  it('keeps the stage geometry in the core, not in itself', () => {
    expect(CIGARETTE_LENGTH).toBeGreaterThan(0);
    expect(LAYOUT.ashtray.x).toBeGreaterThan(LAYOUT.lighter.x);
  });
});

describe('scene feedback (§19, §20, §60)', () => {
  function snapshotView() {
    const engine = createEngine({
      content: FIXTURE,
      seed: 4242,
      wallClockMs: Date.UTC(2026, 8, 29, 21, 30, 0),
      settings: createDefaultSettings(),
    });
    return JSON.parse(JSON.stringify(engine.getState())) as GameStateView;
  }

  it('an ember burst throws sparks, a smoke burst does not (§16)', () => {
    const pool = new ParticlePool(200);
    intakeBurst(burst({ kind: 'ember', heat: 0.9, count: 40 }), pool, { densityScale: 1 });
    const sparks = { count: 0 };
    pool.forEachActive((particle) => {
      if (particle.spark) sparks.count += 1;
    });
    expect(sparks.count).toBeGreaterThan(0);

    const drifting = new ParticlePool(200);
    intakeBurst(burst({ kind: 'drift', heat: 0, count: 40 }), drifting, { densityScale: 1 });
    drifting.forEachActive((particle) => {
      expect(particle.spark).toBe(false);
    });
  });

  it('smoke splits into a far and a near layer instead of one flat fog (§16)', () => {
    const pool = new ParticlePool(400);
    intakeBurst(burst({ count: 200 }), pool, { densityScale: 1 });
    const depth = { far: 0, near: 0 };
    pool.forEachActive((particle) => {
      if (particle.depth >= 0.55) depth.near += 1;
      else depth.far += 1;
    });
    expect(depth.far).toBeGreaterThan(0);
    expect(depth.near).toBeGreaterThan(0);
  });

  it('a landed burst draws a ring while it lives and nothing after (§60)', () => {
    const fake = createFakeCanvas();
    const effects = new EffectList();
    effects.push({
      kind: 'ripple',
      x: 0.5,
      y: 0.8,
      bornMs: 0,
      ttlMs: 400,
      strength: 0.8,
      reach: 0.1,
      tint: [255, 200, 140],
    });
    const toPx = (x: number, y: number) => ({ x: x * 400, y: y * 600 });
    const toLen = (units: number) => units * 600;

    drawEffects(fake.ctx, effects.active(120), 120, toPx, toLen);
    const whileAlive = { strokes: fake.count('stroke'), ellipses: fake.count('ellipse') };
    fake.reset();
    drawEffects(fake.ctx, effects.active(900), 900, toPx, toLen);

    expect(whileAlive.strokes).toBe(1);
    expect(whileAlive.ellipses).toBe(1);
    expect(fake.count('stroke')).toBe(0);
    expect(effects.active(900)).toHaveLength(0);
  });

  it('the tray lights its rim while the rod is being carried to it', () => {
    // Through the renderer rather than the parameter: what is claimed is that a drag in the
    // state becomes an invitation on the object, not that a caller can pass a number in.
    const strokesWhile = (dragged: boolean): number => {
      const fake = createFakeCanvas();
      const renderer = createCanvasRenderer({
        ctx: fake.ctx,
        width: 900,
        height: 1200,
        dpr: 1,
        sprites: { size: 16, soft: () => fakeSprite(16), clear: () => undefined },
      });
      const view = snapshotView();
      const mutable = view as unknown as { cigarette: { pose: { dragged: boolean } } };
      for (let frame = 0; frame < 12; frame += 1) {
        mutable.cigarette.pose.dragged = dragged;
        renderer.render(view, 50);
      }
      const strokes = fake.count('stroke');
      renderer.dispose();
      return strokes;
    };

    // Held still, the tray is one rim stroke a frame. Carried to, it draws the halo as well.
    expect(strokesWhile(false)).toBeLessThan(strokesWhile(true));
  });

  it('the tray visibly fills with the ash that fell (§20)', () => {
    const view = snapshotView();
    const empty = createFakeCanvas();
    drawAshtray(empty.ctx, view, createViewport({ width: 800, height: 1200, dpr: 1 }), {
      load: 0,
      wobble: 0,
      invited: 0,
    });
    const full = createFakeCanvas();
    drawAshtray(full.ctx, view, createViewport({ width: 800, height: 1200, dpr: 1 }), {
      load: 1,
      wobble: 1,
      invited: 0,
    });
    // Two extra ellipses is the mound; the wobble shows up as a rotate the empty tray never does.
    expect(full.count('ellipse') - empty.count('ellipse')).toBe(2);
    expect(full.count('rotate')).toBeGreaterThan(empty.count('rotate'));
  });

  it('picking the rod up leaves a mark, and an idle transition does not (§60)', () => {
    // Two identical renderers differing only in the event they were handed, so the difference
    // that is claimed is the ring and nothing else.
    const strokesAfter = (to: 'PICKED_UP' | 'RESTING'): number => {
      const fake = createFakeCanvas();
      const renderer = createCanvasRenderer({
        ctx: fake.ctx,
        width: 900,
        height: 1200,
        dpr: 1,
        sprites: { size: 16, soft: () => fakeSprite(16), clear: () => undefined },
      });
      const view = snapshotView();
      // The ring is placed against the frame the renderer last saw, so it has to see one first.
      renderer.render(view, 16);
      renderer.handleEvent({
        kind: 'transition',
        atMs: 0,
        from: to === 'PICKED_UP' ? 'IDLE' : 'BURNING',
        to,
      });
      renderer.render(view, 16);
      const strokes = fake.count('stroke');
      renderer.dispose();
      return strokes;
    };

    const lifted = strokesAfter('PICKED_UP');
    const resting = strokesAfter('RESTING');
    expect(resting).toBeGreaterThan(0);
    expect(lifted).toBe(resting + 1);
  });

  it('a cue nobody can hear is one they have to see (§63)', () => {
    // Two renderers and the same event: the only difference is whether sound was available, so
    // whatever differs here is the setting and nothing else. `frames` is how many 50 ms renders
    // pass before the count, because the renderer clamps a frame the way the shell does, and the
    // burst carries no particles so the only thing that can differ is the mark it leaves.
    const strokesAfter = (visualCues: boolean, frames: number, withCue: boolean): number => {
      const fake = createFakeCanvas();
      const renderer = createCanvasRenderer({
        ctx: fake.ctx,
        width: 900,
        height: 1200,
        dpr: 1,
        sprites: { size: 16, soft: () => fakeSprite(16), clear: () => undefined },
        settings: {
          reducedMotion: false,
          quality: 'high',
          contrast: 'normal',
          visualCues,
          realism: 0.8,
          skin: null,
        },
      });
      const view = snapshotView();
      renderer.render(view, 16);
      if (withCue)
        renderer.handleEvent({
          kind: 'burst',
          atMs: 0,
          burst: burst({ kind: 'ember', count: 0 }),
        });
      for (let frame = 0; frame < frames; frame += 1) renderer.render(view, 50);
      const strokes = fake.count('stroke');
      renderer.dispose();
      return strokes;
    };

    const none = strokesAfter(false, 3, false);
    expect(none).toBeGreaterThan(0);
    // The cherry catching leaves a mark now at all: a muted player used to light a rod and see
    // nothing agree with it.
    expect(strokesAfter(false, 3, true) - none).toBeGreaterThanOrEqual(1);
    // Silent, the same event draws the same number of marks — it is the mark that got louder,
    // not a second object cluttering the scene…
    expect(strokesAfter(true, 3, true)).toBe(strokesAfter(false, 3, true));
    // …and the one that outlives the heard version: 460 ms becomes 667 ms, so over the ten
    // frames after it, the version with sound has faded while the version without is still
    // drawing the mark.
    expect(strokesAfter(true, 10, true)).toBeGreaterThan(strokesAfter(false, 10, true));
  });

  it('a lit cherry puts light on the scene that a dead one does not (§17)', () => {
    const renderWith = (brightness: number): number => {
      const view = snapshotView();
      const mutable = view as unknown as {
        cigarette: {
          ember: { brightness: number; flare: number; glowRadius: number; temperature: number };
          pose: { visible: boolean };
        };
        anchors: { ember: { x: number; y: number } };
      };
      // A rod resting on the table is below the horizon, so the ember is lifted into the air:
      // the halo tests the glow and the spill needs the table edge below it.
      mutable.cigarette.ember.brightness = brightness;
      mutable.cigarette.ember.flare = 0;
      mutable.cigarette.ember.glowRadius = 0.06;
      mutable.cigarette.ember.temperature = 0.6;
      mutable.cigarette.pose.visible = true;
      mutable.anchors.ember = { x: 0.5, y: 0.4 };

      const fake = createFakeCanvas();
      const renderer = createCanvasRenderer({
        ctx: fake.ctx,
        width: 900,
        height: 1200,
        dpr: 2,
        sprites: { size: 16, soft: () => fakeSprite(16), clear: () => undefined },
      });
      renderer.render(view, 16);
      renderer.dispose();
      return fake.count('createRadialGradient');
    };

    // The background's own light pools are in both counts, so only the difference is claimed.
    expect(renderWith(0.9) - renderWith(0)).toBeGreaterThanOrEqual(2);
  });
});

describe('§48: the renderer must not write to game state', () => {
  it('renders a frozen live snapshot without mutating or throwing', async () => {
    const { createDefaultLookup } = await import('@puffly/game-content');
    const { DEFAULT_IDS } = await import('@puffly/game-content');
    const { createDefaultSettings } = await import('@puffly/game-core');

    const content = createDefaultLookup();
    const wallClockMs = Date.UTC(2026, 8, 29, 22, 0, 0);
    const engine = createEngine({
      content,
      seed: 20260929,
      wallClockMs,
      settings: createDefaultSettings(),
      ...DEFAULT_IDS,
    });

    const fake = createFakeCanvas();
    const renderer = createCanvasRenderer({
      ctx: fake.ctx,
      width: 900,
      height: 1200,
      dpr: 2,
      sprites: { size: 16, soft: () => fakeSprite(16), clear: () => undefined },
    });

    engine.on((event) => renderer.handleEvent(event));

    // The engine owns its live model; what a renderer is *handed* is this frozen copy.
    // Any write inside the renderer would throw here rather than corrupt the simulation.
    const view = deepFreeze(JSON.parse(JSON.stringify(engine.getState())) as GameStateView);
    const before = JSON.stringify(view);

    const aim = (
      target: 'cigarette' | 'lighter' | 'ash' | 'ashtray',
      type: 'tap' | 'hold' | 'release',
    ) => {
      const anchors = view.anchors;
      const point =
        target === 'lighter'
          ? anchors.lighter
          : target === 'ash'
            ? anchors.ash
            : target === 'ashtray'
              ? anchors.ashtray
              : anchors.body;
      engine.send({
        type,
        x: point.x,
        y: point.y,
        timestamp: engine.getState().nowMs,
        target,
        source: 'pointer',
      });
    };

    aim('cigarette', 'tap');
    engine.advance(100);
    renderer.render(view, 16.7);
    aim('lighter', 'tap');
    engine.advance(2500);
    renderer.render(view, 16.7);
    for (let i = 0; i < 8; i++) {
      aim('cigarette', 'hold');
      engine.advance(350);
      renderer.render(view, 16.7);
      aim('cigarette', 'release');
      engine.advance(400);
      renderer.render(view, 16.7);
    }
    aim('ash', 'tap');
    engine.advance(600);
    renderer.render(view, 16.7);
    aim('ashtray', 'hold');
    engine.advance(1200);
    renderer.render(view, 16.7);
    aim('ashtray', 'release');
    engine.advance(4000);
    renderer.render(view, 16.7);

    expect(JSON.stringify(view)).toBe(before);
    expect(fake.count('drawImage')).toBeGreaterThan(0);
    expect(fake.count('fillRect')).toBeGreaterThan(0);
    expect(fake.count('setTransform')).toBeGreaterThan(0);
    expect(renderer.particleCount()).toBeGreaterThan(0);
    renderer.dispose();
  });
});

describe('the film grain amount (§23, §56)', () => {
  it('is off under reduced motion and under an amount of zero, capped at the ceiling', () => {
    // The 3D layer reads this same function, so the two ceilings are one number.
    expect(grainAlpha(0.5, true)).toBeNull();
    expect(grainAlpha(0, false)).toBeNull();
    expect(grainAlpha(0.5, false)).toBeCloseTo(0.045, 10);
    expect(grainAlpha(4, false)).toBeCloseTo(0.14, 10);
  });
});
