/**
 * Canvas renderer — SPEC.md §15-20, §48, §54-60.
 *
 * `state → pixels`, one direction only. The renderer reads the read-only state view and
 * receives discrete bursts from Game Core; it never writes to game state (the types make
 * that a compile error, and `renderer does not mutate state` below proves it at runtime).
 *
 * Frame cost is bounded: one pool, baked sprites, no per-particle gradients, no DOM, and a
 * budget that follows the settings the player actually chose (§54, §64).
 */

import { clamp01, mixRgb, rgbToCss, type Rgb } from '@puffly/shared';
import { emberHeat, emberPresence, ventDraught } from '@puffly/game-core';
import type {
  Burst,
  ContrastMode,
  EngineEvent,
  GameStateView,
  QualityMode,
  RendererAdapter,
  ScenePalette,
  SkinPalette,
} from '@puffly/game-core';
import { FIELD_SCALE, budgetFor, intakeBurst } from './intake';
import { ParticlePool, type Particle } from './particles';
import { drawAffordanceHint, drawAshtray, drawCigarette, drawLighter, drawPack } from './props';
import { drawBackground } from './background';
import { EffectList, drawEffects, type SceneEffect } from './effects';
import { drawDust, drawRain } from './weather';
import {
  createSpriteProvider,
  defaultSpriteFactory,
  type SpriteImage,
  type SpriteProvider,
} from './sprites';
import { createViewport, type Viewport } from './viewport';

/** Anything longer than this is a stalled tab, not a frame; smoke must not teleport. */
const MAX_FRAME_MS = 50;
/** A single puff may never cover the stage, whatever the lifetime maths says (§54, §58). */
export const MAX_SMOKE_RADIUS_PX = 220;

/**
 * The deck's 冲击感, from the 20% side of its 80/20 rule (S7): 「点火瞬间整体画面轻微推近 + 边缘压暗」.
 *
 * `zoom` is deliberately small — 3.5% at the peak, which at 390 px is 14 px at the frame's edge and
 * nothing at all where the camera pivots. The pivot is the cherry itself, and that is not a
 * cinematography preference: the shell hit-tests against the anchors the core publishes, so a zoom
 * that moved the ember would move the thing under the player's thumb for the length of the punch.
 * Pivoting there keeps §37's rule true by construction rather than by tolerance.
 */
export const IGNITION_IMPACT = { ttlMs: 420, zoom: 0.035, edge: 0.22 } as const;

/** The deck's split, as a number: S6 writes 写实 80% / 卡通 20%. */
export const DECK_SPLIT = 0.8;

/**
 * How far above the core's own alpha the breath sits at one unit of cartoon. 0.5 is a step, not a
 * doubling: measured on the shipped classic at full intensity, the brightest disc of the breath goes
 * from 0.0758 to 0.1137, which lifts it just past the rod's own idle thread (0.0975) — visible, and
 * nowhere near the white ball a larger factor makes. `plume-lift.test.ts` bounds both ends.
 */
export const EXHALE_LIFT = 0.5;

/**
 * S6's 写实度, as the renderer reads it: how much of the cartoon side is left in the frame.
 *
 * Written around the deck's own split so `0.8` multiplies everything by exactly 1 — the shipped
 * look is a detent on the dial, not a special case above or below it. Above it the feedback drains
 * toward pure physics: at 1 there is no push-in, no edge, no rock, a spark lands and stays landed,
 * and the breath keeps the alpha the simulation authored for it. Below it the cartoon side grows up
 * to double, which is where 「比真实更脆」 earns its keep.
 *
 * Nothing in the simulation may consult this. `realism.test.ts` runs one session at each end and
 * compares the entire state, because that is the difference between a look and a cheat.
 */
export const cartoonScale = (realism: number): number => {
  const level = Number.isFinite(realism) ? Math.min(1, Math.max(0, realism)) : DECK_SPLIT;
  return level >= DECK_SPLIT
    ? (1 - level) / (1 - DECK_SPLIT)
    : 1 + (DECK_SPLIT - level) / DECK_SPLIT;
};
/** Particles at or past this depth draw in front of the props, the rest behind them. */
const NEAR_DEPTH = 0.55;
/**
 * Grammes of ash that read as a full tray. Measured rather than picked: one flick of the shipped
 * default rod carries 0.026 g (`ash-mass.test.ts` prints it), so this is about fourteen columns —
 * the same number of flicks the mound used to fill at, now counted in the mass that actually landed
 * in it (2026-10-08 拍板 ②) rather than in drops of any size on one rod.
 */
const TRAY_FULL_GRAMS = 0.36;
/** Overlap instead of opacity: see `drawSmoke`. */
export const PUFF_SPREAD = 1.34;
const PUFF_ALPHA = 0.62;
const PUFF_FLATTEN = 0.74;

export interface RendererSettings {
  reducedMotion: boolean;
  quality: QualityMode;
  /** §64: raised smoke opacity and a lit rim on the rod, for a readable silhouette. */
  contrast: ContrastMode;
  /**
   * §63: nothing can be heard — muted, blocked, or no Web Audio at all. The discrete cues then
   * have to be *seen*: the same accents the sounds accompany, larger and a little longer, so the
   * scene says what the mix would have said instead of going quiet on one channel.
   */
  visualCues: boolean;
  /**
   * S6's 写实度 row (0 = 卡通, 1 = 写实, 0.8 = the deck's own split). Required rather than optional
   * so a renderer built without saying it is a compile error: every site that draws the scene has
   * to state which way it leans, which is what keeps a future preview or thumbnail from silently
   * ignoring the player's dial. Presentation only — see `cartoonScale`.
   */
  realism: number;
  /** The player's own room colours, or `null` for the place as it was authored. */
  customBackground?: ScenePalette | null;
  /**
   * S15: the four layers of a skin, or `null` for the scene as the content made it. A renderer
   * setting and not a simulation one, because a skin may not move a number — the view it produces
   * differs from the state only in colour.
   */
  skin: SkinPalette | null;
}

export interface CanvasRendererOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr?: number;
  /** Injectable so tests can run without a real canvas (§72). */
  sprites?: SpriteProvider;
  settings?: RendererSettings;
  /** Baked film-grain tile; omit it (as tests do) and the scene renders without grain. */
  grainTile?: SpriteImage | null;
  /**
   * The air this renderer owns. Injectable for the same reason `sprites` is (§72), and for one claim
   * that needs it: a spark's identity — which streak belongs to which spark, across the frames after
   * it reached the table — is not recoverable from the recorded draw calls, and 写实度 is exactly a
   * claim about that. The pool a caller hands in is the one this renderer integrates and draws.
   */
  particles?: ParticlePool;
}

export interface PufflyRenderer extends RendererAdapter {
  handleEvent(event: EngineEvent): void;
  setViewport(width: number, height: number, dpr: number): void;
  setSettings(settings: Partial<RendererSettings>): void;
  particleCount(): number;
  poolCapacity(): number;
}

const TINT_CACHE_LIMIT = 32;

/**
 * The state as a skin sees it: four colours swapped, everything else the same object. No draw site
 * learns that a skin exists, which is what keeps the redline true by construction — there is no
 * branch here that could reach a duration, a count or a temperature.
 */
export function applySkin(view: GameStateView, skin: SkinPalette | null): GameStateView {
  if (skin === null) return view;
  return {
    ...view,
    style: {
      ...view.style,
      scene: { ember: skin.ember, pool: skin.pool },
      cigarette: { ...view.style.cigarette, paper: skin.paper },
    },
    smoke: { ...view.smoke, tint: skin.smoke },
  };
}

/**
 * The player's own room colours, applied the same way a skin's are: a new view, four colours, and
 * nothing else in it. `null` returns the view itself rather than a copy, so an untouched game
 * allocates nothing per frame.
 */
export function applyBackground(
  view: GameStateView,
  custom: RendererSettings['customBackground'],
): GameStateView {
  if (custom === null || custom === undefined) return view;
  return {
    ...view,
    environment: {
      ...view.environment,
      background: {
        ...view.environment.background,
        sky: [custom.skyTop, custom.skyBottom],
        horizon: custom.horizon,
        silhouette: custom.silhouette,
      },
    },
  };
}

function densityScaleFor(settings: RendererSettings): number {
  if (settings.reducedMotion) return 0.28;
  switch (settings.quality) {
    case 'light':
      return 0.5;
    case 'balanced':
      return 0.75;
    default:
      return 1;
  }
}

/** How much louder the picture gets when the sound is not there to speak. */
const VISUAL_CUE_BOOST = 1.45;

/**
 * Where a burst should leave a mark on the scene. Only the physical bursts do: the smoke
 * itself is the feedback for a puff, and drawing a ring around every wisp would be noise.
 */
function accentFor(burst: Burst, atMs: number): SceneEffect | null {
  const tint: Rgb = [255, 196, 128];
  switch (burst.kind) {
    case 'extinguish':
      return {
        kind: 'flash',
        x: burst.origin.x,
        y: burst.origin.y,
        bornMs: atMs,
        ttlMs: 420,
        strength: 0.85,
        reach: 0.16,
        tint: [255, 236, 208],
      };
    case 'impact':
      return {
        kind: 'ripple',
        x: burst.origin.x,
        y: burst.origin.y,
        bornMs: atMs,
        ttlMs: 520,
        strength: 0.7,
        reach: 0.14,
        tint,
      };
    case 'flare':
      return {
        kind: 'flash',
        x: burst.origin.x,
        y: burst.origin.y,
        bornMs: atMs,
        ttlMs: 300,
        strength: 0.5,
        reach: 0.07,
        tint: [255, 150, 60],
      };
    case 'ash':
      return {
        kind: 'ripple',
        x: burst.origin.x,
        y: burst.origin.y,
        bornMs: atMs,
        ttlMs: 380,
        strength: 0.35,
        reach: 0.05,
        tint: [214, 214, 220],
      };
    case 'ember':
      // The cherry catching has a sound of its own and never had a mark of its own: with the
      // volume down it was the one moment of the break nobody could tell had happened.
      return {
        kind: 'ring',
        x: burst.origin.x,
        y: burst.origin.y,
        bornMs: atMs,
        ttlMs: 460,
        strength: 0.55,
        reach: 0.075,
        tint: [255, 168, 74],
      };
    case 'lighter':
      return {
        kind: 'ring',
        x: burst.origin.x,
        y: burst.origin.y,
        bornMs: atMs,
        ttlMs: 300,
        strength: 0.3,
        reach: 0.05,
        tint: [255, 224, 176],
      };
    default:
      return null;
  }
}

function effectFor(burst: Burst, atMs: number, visualCues: boolean): SceneEffect | null {
  const effect = accentFor(burst, atMs);
  if (effect === null || !visualCues) return effect;
  // The same accent, not a new language: bigger and a beat longer, so the eye is where the
  // ear would have been.
  return {
    ...effect,
    strength: Math.min(1, effect.strength * VISUAL_CUE_BOOST),
    reach: effect.reach * VISUAL_CUE_BOOST,
    ttlMs: effect.ttlMs * VISUAL_CUE_BOOST,
  };
}

export function createCanvasRenderer(options: CanvasRendererOptions): PufflyRenderer {
  const ctx = options.ctx;
  const viewport: Viewport = createViewport({
    width: options.width,
    height: options.height,
    dpr: options.dpr ?? 1,
  });
  const settings: RendererSettings = {
    reducedMotion: false,
    quality: 'auto',
    contrast: 'normal',
    visualCues: false,
    realism: DECK_SPLIT,
    skin: null,
    ...options.settings,
  };
  const grainTile = options.grainTile ?? null;
  const sprites: SpriteProvider =
    options.sprites ??
    createSpriteProvider(defaultSpriteFactory(), settings.quality === 'light' ? 64 : 96);

  let pool =
    options.particles ?? new ParticlePool(budgetFor(settings.reducedMotion, settings.quality));
  let clockMs = 0;
  const tintCache = new Map<string, Rgb>();
  const effects = new EffectList();

  /** Ash that has landed, as the tray sees it: a mound, and a rock when it arrives. */
  let trayLoad = 0;
  let trayWobble = 0;
  let trayInvite = 0;
  /** 0..1, the ignition punch falling from 1 to 0 over `IGNITION_IMPACT.ttlMs`. */
  let impact = 0;
  let lastDropped = -1;
  /** The frame the renderer last drew; a discrete event is placed against it. */
  let lastView: GameStateView | null = null;

  const tintFor = (base: Rgb, particleHeat: number, visibility: number): Rgb => {
    const key = `${base[0]}|${base[1]}|${base[2]}|${Math.round(particleHeat * 8)}|${Math.round(visibility * 8)}`;
    const cached = tintCache.get(key);
    if (cached) return cached;
    // Night smoke reads brighter against a dark room (§24), and hot particles keep the
    // cherry's colour for their first moments instead of jumping straight to grey.
    const lit = mixRgb(base, [255, 255, 255], (visibility - 0.5) * 0.12);
    const tinted = mixRgb(lit, [255, 176, 96], particleHeat * 0.55);
    if (tintCache.size > TINT_CACHE_LIMIT) tintCache.clear();
    tintCache.set(key, tinted);
    return tinted;
  };

  /**
   * One depth slice of smoke (§16). Drawing half the particles behind the props and half in
   * front is what turns a flat fog into volume, and it costs nothing but a second loop.
   */
  const drawSmoke = (state: GameStateView, near: boolean): void => {
    const field = state.smoke;
    const style = state.style.smoke;
    const stage = viewport.stage;
    const lift = settings.contrast === 'high' ? 1.35 : 1;
    // The venue's share of the width (S21 通风系数): a sealed place lets the ribbon hang, a forecourt
    // tears it out sideways. Anchored at 1 and only ever adding, because the core's `smoke.dispersion`
    // also carries the rod and the ashtray — taking that straight into the radius would shrink the
    // calibrated picture of every room at once, which is what §57 says the smoke cannot afford. The
    // brightness half of the same coefficient arrives through `field.visibility` below.
    const spread = 1 + ventDraught(state.environment.ventilation) * 0.45;
    const sparks: Particle[] = [];

    ctx.save();
    pool.forEachActive((particle: Particle) => {
      if (particle.depth >= NEAR_DEPTH !== near) return;

      if (particle.spark) {
        // Sparks are streaks, not blobs: they are the only thing in the frame that moves
        // fast, and a soft sprite on a fast particle is just a smear.
        if (near) sparks.push(particle);
        return;
      }

      // Heat is a moment, not a property of the particle: a puff leaves the cherry hot and is
      // only warm air for the first fifth of its life. Held open for the whole life, additive
      // blending turns a ribbon of smoke into a string of lights — which is what the design's
      // frames do not have.
      const hot = particle.heat * clamp01(1 - particle.age * 5);
      const tint = tintFor(particle.tint, hot, field.visibility);
      const sprite = sprites.soft(tint, style.blur);
      const depthScale = 0.72 + particle.depth * 0.5;
      // Wider and dimer per particle: the same light spread over more overlapping puffs is what
      // turns a jar of bubbles into a body of smoke (§16).
      const radiusPx = Math.min(
        viewport.len(particle.radius * particle.scale * particle.size) *
          depthScale *
          PUFF_SPREAD *
          spread,
        MAX_SMOKE_RADIUS_PX,
      );
      if (!sprite || radiusPx <= 0.4) return;

      const centre = viewport.px(particle);
      const alpha = clamp01(
        particle.alpha *
          style.opacity *
          (0.35 + field.visibility * 0.8) *
          lift *
          PUFF_ALPHA *
          (near ? 1 : 0.72),
      );
      if (alpha <= 0.004) return;

      const isHot = hot > 0.3;
      ctx.globalCompositeOperation = isHot ? 'lighter' : 'source-over';
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(centre.x, centre.y);
      ctx.rotate(particle.rotation);
      // A puff is not a circle: smoke flattens as it spreads, and an ellipse that turns with the
      // flow stops a thousand sprites reading as one repeated dot. Flattened in the destination
      // rect rather than with a transform, because that is one matrix we do not have to push.
      ctx.drawImage(
        sprite,
        -radiusPx,
        -radiusPx * PUFF_FLATTEN,
        radiusPx * 2,
        radiusPx * 2 * PUFF_FLATTEN,
      );
      // Restored, not re-set: see the note on `drawFallingAsh`. A thousand sprites a frame each
      // putting the matrix back by hand is also a thousand chances to put back the wrong one.
      ctx.restore();
    });

    if (sparks.length > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const particle of sparks) {
        const from = viewport.px({ x: particle.px, y: particle.py });
        const to = viewport.px({ x: particle.x, y: particle.y });
        const alpha = clamp01(particle.alpha * 3);
        if (alpha <= 0.01) continue;
        ctx.strokeStyle = rgbToCss(mixRgb(particle.tint, [255, 214, 150], 0.7), alpha);
        ctx.lineWidth = Math.max(1, viewport.len(particle.radius * 0.9));
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // Dense smoke dims the light behind it — a cheap approximation of scattering (§58).
    if (near && field.density > 0.45 && stage.width > 0) {
      const veil = ctx.createRadialGradient(
        stage.x + stage.width * 0.5,
        stage.y + stage.height * 0.42,
        0,
        stage.x + stage.width * 0.5,
        stage.y + stage.height * 0.42,
        stage.width * 0.7,
      );
      veil.addColorStop(0, rgbToCss(state.smoke.tint, clamp01((field.density - 0.45) * 0.06)));
      veil.addColorStop(1, rgbToCss(state.smoke.tint, 0));
      ctx.fillStyle = veil;
      ctx.fillRect(stage.x, stage.y, stage.width, stage.height);
    }
  };

  /**
   * The cherry is a light source, not a red dot (§17): it halos the air it sits in and
   * spills onto the table edge below it. When it is dark the whole scene loses its single
   * warm anchor, which is exactly the difference between "a cigarette" and "a smoke break".
   */
  const drawCherryLight = (state: GameStateView): void => {
    const ember = state.cigarette.ember;
    const total = emberPresence(ember);
    if (total <= 0.02) return;
    if (!state.cigarette.pose.visible) return;

    const at = viewport.px(state.anchors.ember);
    // The same band the cherry itself is drawn from, so the light on the smoke cannot read hotter
    // than the thing it comes from (§4 声音跟画面连接's colour twin).
    const hot = mixRgb([255, 120, 32], [255, 236, 190], emberHeat(ember.temperature));

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const halo = viewport.len(ember.glowRadius) * (1.9 + ember.flare * 1.4);
    if (halo > 1) {
      const glow = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, halo);
      glow.addColorStop(0, rgbToCss(hot, clamp01(0.16 * total)));
      glow.addColorStop(1, rgbToCss(hot, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(at.x, at.y, halo, 0, Math.PI * 2);
      ctx.fill();
    }

    // The spill: a wide, very soft ellipse of the cherry's colour where the table edge is.
    const edgeY = viewport.stage.y + viewport.stage.height * state.stage.layout.tableEdgeY;
    const spill = viewport.len(0.34) * (0.6 + total * 0.6);
    if (edgeY > at.y && spill > 2) {
      const dy = edgeY - at.y;
      const grad = ctx.createRadialGradient(at.x, edgeY, 0, at.x, edgeY, spill);
      grad.addColorStop(0, rgbToCss(hot, clamp01(0.11 * total * (1 - dy / viewport.stage.height))));
      grad.addColorStop(1, rgbToCss(hot, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(at.x, edgeY, spill, spill * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  const drawGrain = (
    context: CanvasRenderingContext2D,
    state: GameStateView,
    tile: SpriteImage | null,
    reducedMotion: boolean,
  ): void => {
    // Grain is texture, not information: it is the first thing to go when the player asked for
    // less movement, and it never appears without a tile to repeat (§64, §63: absent is fine).
    if (!tile || reducedMotion) return;
    const amount = state.environment.background.grain;
    if (amount <= 0) return;
    const pattern = context.createPattern(tile as unknown as CanvasImageSource, 'repeat');
    if (!pattern) return;
    context.save();
    context.globalAlpha = Math.min(0.14, amount * 0.09);
    context.fillStyle = pattern;
    context.fillRect(0, 0, viewport.cssWidth, viewport.cssHeight);
    context.restore();
  };

  const renderer: PufflyRenderer = {
    render(incoming, dtMs) {
      const state = applyBackground(applySkin(incoming, settings.skin), settings.customBackground);
      lastView = state;
      const frame = Math.max(0, Math.min(dtMs, MAX_FRAME_MS));
      clockMs += frame;
      // One multiplier for the whole frame, read from the dial the player set. Everything below
      // that exaggerates rather than describes goes through it; nothing that measures does.
      const cartoon = cartoonScale(settings.realism);

      // The plane things lie on, straight from the state's own layout: the table lifts with the
      // window (§55), so a constant here would be a surface the scene does not draw.
      pool.update(
        frame,
        state.smoke.drift,
        FIELD_SCALE,
        clockMs / 1000,
        state.stage.layout.table.y,
        cartoon,
        // The venue reaches the plume's structure, not only its paint: how hard a draught pulls the
        // curl layer off the column is this frame's own 通风系数.
        ventDraught(state.environment.ventilation),
      );

      const dropped = state.cigarette.ash.dropped;
      if (lastDropped >= 0 && dropped > lastDropped) {
        trayWobble = Math.min(1, trayWobble + (dropped - lastDropped) * 0.5 * cartoon);
      }
      lastDropped = dropped;
      trayLoad = clamp01(state.ashtray.grams / TRAY_FULL_GRAMS);
      trayWobble = Math.max(0, trayWobble - frame / 620);
      // The invitation eases in and out rather than snapping, so a drag that simply stops
      // does not leave the tray lit like a switch left on.
      trayInvite +=
        ((state.cigarette.pose.dragged ? 1 : 0) - trayInvite) * Math.min(1, frame / 140);

      ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
      ctx.clearRect(0, 0, viewport.cssWidth, viewport.cssHeight);

      // The punch decays from the frame it was earned on, and the whole scene is drawn through a
      // camera that pivots on the cherry. `punch` is eased out of `impact` rather than used raw:
      // an impact that leaves at a constant rate reads as a slow slide, and this one has to land.
      impact = Math.max(0, impact - frame / IGNITION_IMPACT.ttlMs);
      const punch = impact * (2 - impact);
      // The frame's own anchor. Stated as the point rather than as a race: by the time the rod
      // catches the pose has settled at the mouth, and a probe that swaps this for the previous
      // frame's anchor moves nothing measurable — the claim this file tests is *which* point the
      // camera turns around, not how fresh its coordinates are.
      const camera = punch > 0.001 ? viewport.px(state.anchors.ember) : { x: 0, y: 0 };
      const zoom = 1 + IGNITION_IMPACT.zoom * punch * cartoon;
      ctx.save();
      if (punch > 0.001) {
        ctx.translate(camera.x, camera.y);
        ctx.scale(zoom, zoom);
        ctx.translate(-camera.x, -camera.y);
      }

      drawBackground(ctx, state, viewport);
      drawGrain(ctx, state, grainTile, settings.reducedMotion);
      drawDust(ctx, state, viewport, settings.reducedMotion);
      drawSmoke(state, false);
      drawAshtray(ctx, state, viewport, {
        load: trayLoad,
        wobble: trayWobble,
        invited: trayInvite,
      });
      drawPack(ctx, state, viewport);
      drawLighter(ctx, state, viewport);
      drawCigarette(ctx, state, viewport, settings.contrast, cartoon);
      drawCherryLight(state);
      drawSmoke(state, true);
      drawAffordanceHint(ctx, state, viewport);
      drawRain(ctx, state, viewport, settings.reducedMotion);
      drawEffects(
        ctx,
        effects.active(clockMs),
        clockMs,
        (x, y) => viewport.px({ x, y }),
        (units) => viewport.len(units),
      );
      ctx.restore();

      // 边缘压暗, drawn outside the camera so it stays glued to the frame rather than sliding off
      // it: the room closing in for a beat is the other half of the same hit, and the base
      // vignette is driven by ambient light alone, which no ignition changes.
      if (punch > 0.001) {
        const w = viewport.cssWidth;
        const h = viewport.cssHeight;
        const edge = ctx.createRadialGradient(
          w / 2,
          h * 0.5,
          Math.min(w, h) * 0.26,
          w / 2,
          h * 0.5,
          Math.max(w, h) * 0.72,
        );
        edge.addColorStop(0, 'rgba(0,0,0,0)');
        edge.addColorStop(1, `rgba(0,0,0,${(IGNITION_IMPACT.edge * punch * cartoon).toFixed(3)})`);
        ctx.fillStyle = edge;
        ctx.fillRect(0, 0, w, h);
      }
    },
    resize(width, height, dpr) {
      renderer.setViewport(width, height, dpr);
    },
    setViewport(width, height, dpr) {
      viewport.resize(width, height, dpr);
    },
    setSettings(next) {
      const budgetChanged =
        (next.reducedMotion !== undefined && next.reducedMotion !== settings.reducedMotion) ||
        (next.quality !== undefined && next.quality !== settings.quality);
      Object.assign(settings, next);
      if (budgetChanged) {
        const nextBudget = budgetFor(settings.reducedMotion, settings.quality);
        if (nextBudget !== pool.capacity) {
          const resized = new ParticlePool(nextBudget);
          // Keep what is already in the air rather than blanking the scene.
          pool.forEachActive((particle) => {
            resized.spawn({
              x: particle.x,
              y: particle.y,
              vx: particle.vx,
              vy: particle.vy,
              radius: particle.radius,
              alphaPeak: particle.alphaPeak,
              alphaDecay: particle.alphaDecay,
              life: particle.life,
              noiseSeed: particle.noiseSeed,
              rotation: particle.rotation,
              scale: particle.scale,
              scaleGrowth: particle.scaleGrowth,
              turbulence: particle.turbulence,
              rise: particle.rise,
              gravity: particle.gravity,
              drag: particle.drag,
              // Carried rather than re-defaulted. These three are the plume's own history: `swing`
              // and `layer` are what make one body of air into a core with an edge and a curl, and
              // `delay` is what makes a breath a stream instead of a lump. Left out, a resize handed
              // every particle in the air the pool's defaults — the column went fog and the un-born
              // half of a breath arrived at once — the moment 烟雾 changed tier, which the auto tier
              // does on its own the frame the scene starts to drop.
              swing: particle.swing,
              layer: particle.layer,
              delay: particle.delay,
              tint: particle.tint,
              heat: particle.heat,
              depth: particle.depth,
              spark: particle.spark,
            });
          });
          pool = resized;
        }
      }
    },
    handleEvent(event) {
      if (event.kind === 'transition') {
        // Picking the rod up is the most repeated gesture in the game and it emits no burst,
        // so it used to answer with nothing but movement. A ring where it left the table is the
        // §60 "every action gets feedback" beat that a burst cannot carry.
        // The deck's 冲击感 hangs on one moment, and this is the moment: the rod catching. The
        // punch is a camera and a vignette rather than an effect in the list, because it belongs to
        // the whole frame; the ring below is what the *table* does when the rod leaves it.
        if (event.to === 'BURNING' && !settings.reducedMotion) {
          impact = 1;
        }
        if (event.to === 'PICKED_UP' && lastView && !settings.reducedMotion) {
          const at = lastView.anchors.body;
          effects.push({
            kind: 'ring',
            x: at.x,
            y: at.y,
            bornMs: clockMs,
            ttlMs: 360,
            strength: 0.45,
            reach: 0.075,
            tint: [255, 214, 150],
          });
        }
        return;
      }
      if (event.kind !== 'burst') return;
      // The lift is read from the dial at the moment the air is born, so a plume already in the air
      // keeps the brightness it was breathed with rather than changing colour when the row is moved.
      intakeBurst(event.burst, pool, {
        densityScale: densityScaleFor(settings),
        plumeTint: settings.skin?.smoke,
        plumeLift: 1 + EXHALE_LIFT * cartoonScale(settings.realism),
      });
      const effect = effectFor(event.burst, clockMs, settings.visualCues);
      if (effect && !settings.reducedMotion) effects.push(effect);
    },
    particleCount() {
      return pool.size;
    },
    poolCapacity() {
      return pool.capacity;
    },
    dispose() {
      pool.clear();
      sprites.clear();
      tintCache.clear();
      effects.clear();
    },
  };

  return renderer;
}

export { clearBackgroundCache } from './background';
export { clearWeatherCache } from './weather';
