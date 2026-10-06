/**
 * Props layer: the tray, the pack, the lighter, and the cigarette itself.
 *
 * The cigarette is drawn from simulation numbers — rod fraction, ember brightness, ash
 * column length and bend — never from a sprite sheet, because §87 says the smoke is not a
 * picture and the fire is not a GIF. The ash column is drawn as a slightly bowed stack so
 * a long column visibly *asks* to be flicked (§6, §18).
 */

import { clamp01, mixRgb, rgbToCss } from '@puffly/shared';
import { type GameStateView } from '@puffly/game-core';
import { wander } from './noise';
import type { Viewport } from './viewport';

const TIP_GRADIENT_STEPS = 5;

export interface TrayFeedback {
  /** 0..1: how full the mound of ash has grown. */
  load: number;
  /** 0..1 decaying impulse, replayed every time ash lands. */
  wobble: number;
  /**
   * 0..1 while the rod is being carried somewhere. The tray answers by lighting its own rim, so
   * the destination says "here" without a control appearing over the scene. The tray itself is
   * always in the scene — ash falls into it whether or not anyone is dragging — so what appears
   * is the invitation, never the object.
   */
  invited: number;
}

export function drawAshtray(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  feedback: TrayFeedback = { load: 0, wobble: 0, invited: 0 },
): void {
  const style = state.style.ashtray;
  const centre = viewport.px(state.stage.layout.ashtray);
  const radius = viewport.len(state.anchors.ashtrayRadius);
  const light = state.world.light.ambient;
  // A tray rocks when something lands in it and settles back, so the object has weight.
  // Cosine, not sine: a released oscillator starts at full tilt and settles back to level.
  const rock = feedback.wobble > 0 ? Math.cos(state.nowMs / 46) * feedback.wobble * 0.05 : 0;

  ctx.save();
  ctx.translate(centre.x, centre.y);
  if (rock !== 0) ctx.rotate(rock);

  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.42, 0, 0, Math.PI * 2);
  ctx.fillStyle = rgbToCss(mixRgb(style.base, [0, 0, 0], 0.35));
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, -radius * 0.06, radius * 0.86, radius * 0.34, 0, 0, Math.PI * 2);
  ctx.fillStyle = rgbToCss(mixRgb(style.base, [255, 255, 255], 0.1 + light * 0.2));
  ctx.fill();

  // The mound: ash that has actually fallen, drawn as a settled pile rather than a count.
  if (feedback.load > 0.02) {
    const ash = state.style.cigarette.ash;
    const width = radius * 0.62 * feedback.load;
    const height = radius * 0.2 * feedback.load;
    ctx.beginPath();
    ctx.ellipse(-radius * 0.08, radius * 0.02, width, height, 0.12, 0, Math.PI * 2);
    ctx.fillStyle = rgbToCss(mixRgb(ash, [52, 48, 50], 0.45), 0.92);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-radius * 0.1, -height * 0.45, width * 0.68, height * 0.62, -0.08, 0, Math.PI * 2);
    ctx.fillStyle = rgbToCss(mixRgb(ash, [255, 255, 255], 0.2), 0.85);
    ctx.fill();
  }

  // Rim highlight: the only place a tray shows its material.
  const invite = clamp01(feedback.invited);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * 0.42, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.lineWidth = Math.max(1, radius * 0.06);
  ctx.strokeStyle = rgbToCss(
    mixRgb(style.rim, [255, 214, 150], invite * 0.7),
    clamp01(0.25 + style.reflect + light * 0.3 + invite * 0.45),
  );
  ctx.stroke();

  // Carrying the rod to it: a warm halo just outside the rim, the one thing a still object can
  // do to say "here" without becoming a button.
  if (invite > 0.02) {
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.16, radius * 0.54, 0, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, radius * 0.05);
    ctx.strokeStyle = rgbToCss([255, 196, 128], invite * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPack(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
): void {
  const centre = viewport.px(state.stage.layout.pack);
  const w = viewport.len(0.095);
  const h = viewport.len(0.062);
  const band = state.style.cigarette.band;
  const paper = state.style.cigarette.paper;

  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(-0.05);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, h * 0.52, w * 0.62, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Box: the band colour, lit from the scene's key direction.
  const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  body.addColorStop(0, rgbToCss(mixRgb(band, [0, 0, 0], 0.55)));
  body.addColorStop(0.55, rgbToCss(mixRgb(band, [255, 255, 255], 0.12)));
  body.addColorStop(1, rgbToCss(mixRgb(band, [0, 0, 0], 0.4)));
  ctx.fillStyle = body;
  roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.08);
  ctx.fill();

  // Foil lip and the lid seam: two bands, and it reads as a pack rather than a brick.
  ctx.fillStyle = rgbToCss(mixRgb(paper, [180, 180, 186], 0.35), 0.85);
  ctx.fillRect(-w / 2 + w * 0.06, -h / 2 - h * 0.06, w * 0.88, h * 0.14);
  ctx.strokeStyle = rgbToCss(mixRgb(band, [0, 0, 0], 0.7), 0.7);
  ctx.lineWidth = Math.max(1, h * 0.03);
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h * 0.12);
  ctx.lineTo(w / 2, -h * 0.12);
  ctx.stroke();

  // Rod ends peeking out, so the pack and the rod in hand are the same object family.
  ctx.fillStyle = rgbToCss(paper, 0.92);
  for (let i = 0; i < 3; i++) {
    const x = -w * 0.26 + i * w * 0.26;
    roundRect(ctx, x, -h / 2 - h * 0.2, w * 0.09, h * 0.2, w * 0.045);
    ctx.fill();
  }

  ctx.restore();
}

export function drawLighter(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
): void {
  const at = viewport.px(state.lighter.at);
  const bodyW = viewport.len(0.05);
  const bodyH = viewport.len(0.075);
  const flame = state.lighter.flame;
  const sputter = state.lighter.sputter;
  const top = at.y - bodyH * 0.3;

  ctx.save();

  // A contact shadow, so the object sits in the room instead of floating over it (§58).
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(at.x, at.y + bodyH * 0.72, bodyW * 0.72, bodyH * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Case: one vertical metal ramp, dark at the edges, lit where the key light lands.
  const key = state.world.light.keyDirectionDeg;
  const metal = ctx.createLinearGradient(at.x - bodyW / 2, 0, at.x + bodyW / 2, 0);
  const base = state.style.lighter.hue;
  metal.addColorStop(0, rgbToCss(mixRgb(base, [12, 12, 16], 0.78)));
  metal.addColorStop(
    0.35 + Math.cos((key * Math.PI) / 180) * 0.1,
    rgbToCss(mixRgb(base, [236, 236, 240], 0.5)),
  );
  metal.addColorStop(1, rgbToCss(mixRgb(base, [12, 12, 16], 0.66)));
  ctx.fillStyle = metal;
  roundRect(ctx, at.x - bodyW / 2, top, bodyW, bodyH, bodyW * 0.22);
  ctx.fill();

  // Cap and hinge: two thin bands are enough to say "this opens".
  ctx.fillStyle = rgbToCss(mixRgb(base, [220, 222, 228], 0.62), 0.95);
  ctx.fillRect(at.x - bodyW / 2, top - bodyH * 0.1, bodyW, bodyH * 0.12);
  ctx.fillStyle = rgbToCss(mixRgb(base, [0, 0, 0], 0.55), 0.8);
  ctx.fillRect(at.x - bodyW / 2, top + bodyH * 0.02, bodyW, Math.max(1, bodyH * 0.02));

  // Spark wheel, catching the light.
  ctx.beginPath();
  ctx.arc(at.x + bodyW * 0.26, top - bodyH * 0.04, bodyW * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = rgbToCss(mixRgb(base, [90, 88, 92], 0.5));
  ctx.fill();

  if (flame > 0.01) {
    const jitter = wander(state.nowMs / 1000, 11) * 0.12 + state.lighter.flicker * 0.4;
    const height =
      state.style.lighter.flameHeight *
      viewport.len(1) *
      flame *
      (1 + jitter * 0.25) *
      (1 - sputter * 0.7);
    const width = height * 0.42;
    const tipY = top - height;

    const gradient = ctx.createLinearGradient(at.x, top, at.x, tipY);
    gradient.addColorStop(0, rgbToCss(mixRgb(state.style.lighter.hue, [255, 255, 255], 0.55), 0.9));
    gradient.addColorStop(0.45, rgbToCss(state.style.lighter.hue, 0.85));
    gradient.addColorStop(1, rgbToCss(mixRgb(state.style.lighter.hue, [60, 40, 90], 0.6), 0));

    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.moveTo(at.x - width / 2, top);
    ctx.quadraticCurveTo(
      at.x - width * 0.62 + jitter * width,
      top - height * 0.55,
      at.x + jitter * width * 0.6,
      tipY,
    );
    ctx.quadraticCurveTo(
      at.x + width * 0.6 + jitter * width,
      top - height * 0.55,
      at.x + width / 2,
      top,
    );
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // The blue throat of a real flame, kept subtle (§58: no neon gradient soup).
    ctx.beginPath();
    ctx.ellipse(at.x, top - height * 0.12, width * 0.34, height * 0.16, 0, 0, Math.PI * 2);
    ctx.fillStyle = rgbToCss([110, 170, 255], 0.35 * flame);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

export function drawCigarette(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  contrast: 'normal' | 'high' = 'normal',
): void {
  const cigarette = state.cigarette;
  if (!cigarette.pose.visible && cigarette.state !== 'IDLE') return;

  const style = state.style.cigarette;
  const pivot = viewport.px(cigarette.pose.pivot);
  const angle = (cigarette.pose.angleDeg * Math.PI) / 180;
  const thickness = viewport.len(cigarette.pose.thickness);

  ctx.save();
  ctx.translate(pivot.x, pivot.y);
  ctx.rotate(angle);

  const rodLength = viewport.len(cigarette.pose.rodLength);
  const filterLength = rodLength * 0.22;

  if (rodLength > 0.5) {
    const rod = ctx.createLinearGradient(0, -thickness / 2, 0, thickness / 2);
    rod.addColorStop(0, rgbToCss(mixRgb(style.paper, [255, 255, 255], 0.25)));
    rod.addColorStop(0.55, rgbToCss(style.paper));
    rod.addColorStop(1, rgbToCss(mixRgb(style.paper, [0, 0, 0], 0.35)));
    ctx.fillStyle = rod;
    roundRect(ctx, 0, -thickness / 2, rodLength, thickness, thickness * 0.45);
    ctx.fill();

    // Brand band and the seam of the paper: two strokes, no text (§4, §29).
    if (contrast === 'high') {
      // A thin lit edge is what makes the rod readable against a busy or bright room (§64),
      // and it is one stroke, not a re-drawn sprite.
      ctx.strokeStyle = rgbToCss(mixRgb(style.paper, [255, 255, 255], 0.7), 0.75);
      ctx.lineWidth = Math.max(1, thickness * 0.14);
      roundRect(ctx, 0, -thickness / 2, rodLength, thickness, thickness * 0.45);
      ctx.stroke();
    }

    ctx.fillStyle = rgbToCss(style.band, 0.9);
    ctx.fillRect(rodLength * 0.62, -thickness / 2, Math.max(1, rodLength * 0.07), thickness);
    ctx.strokeStyle = rgbToCss(mixRgb(style.paper, [0, 0, 0], 0.2), 0.5);
    ctx.lineWidth = Math.max(0.5, thickness * 0.08);
    ctx.beginPath();
    ctx.moveTo(filterLength, -thickness * 0.2);
    ctx.lineTo(rodLength, -thickness * 0.2);
    ctx.stroke();

    const filter = ctx.createLinearGradient(0, 0, filterLength, 0);
    filter.addColorStop(0, rgbToCss(mixRgb(style.filter, [0, 0, 0], 0.2)));
    filter.addColorStop(1, rgbToCss(style.filter));
    ctx.fillStyle = filter;
    roundRect(ctx, 0, -thickness / 2, filterLength, thickness, thickness * 0.45);
    ctx.fill();
  }

  drawAshColumn(ctx, state, viewport, thickness, rodLength);
  drawHeatBleed(ctx, state, viewport, thickness, rodLength);
  drawEmber(ctx, state, viewport, thickness, rodLength);
  ctx.restore();

  drawFallingAsh(ctx, state, viewport);
}

/**
 * Fire travels: the paper just behind the cherry chars and glows, which is what sells the
 * rod as something burning rather than a rectangle with a red dot on it (§17).
 */
function drawHeatBleed(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  thickness: number,
  rodLength: number,
): void {
  const ember = state.cigarette.ember;
  const total = clamp01(ember.brightness + ember.flare * 0.5);
  if (total <= 0.05 || rodLength <= 1) return;

  const reach = Math.min(rodLength * 0.4, viewport.len(0.05) * (1 + total));
  if (reach <= 0.5) return;

  const char = ctx.createLinearGradient(rodLength - reach, 0, rodLength, 0);
  char.addColorStop(0, rgbToCss([24, 18, 16], 0));
  char.addColorStop(0.6, rgbToCss([46, 30, 22], 0.35 * total));
  char.addColorStop(
    1,
    rgbToCss(mixRgb([255, 150, 60], [255, 240, 200], ember.temperature), 0.55 * total),
  );

  ctx.save();
  ctx.fillStyle = char;
  roundRect(ctx, rodLength - reach, -thickness * 0.5, reach, thickness, thickness * 0.45);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = char;
  ctx.fillRect(rodLength - reach * 0.55, -thickness * 0.42, reach * 0.55, thickness * 0.84);
  ctx.restore();
}

/** §18: the column bows as it lengthens, which is what makes a player want to flick it. */
function drawAshColumn(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  thickness: number,
  rodLength: number,
): void {
  const ash = state.cigarette.ash;
  if (ash.length <= 0) return;

  const ashLength = viewport.len(ash.length);
  const bend = ash.bend;
  const style = state.style.cigarette.ash;
  const steps = TIP_GRADIENT_STEPS;

  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const sag = Math.pow(t0, 2) * bend * ashLength * 0.55;
    const x0 = rodLength + ashLength * t0;
    const x1 = rodLength + ashLength * t1;
    const y0 = sag - thickness * 0.5;
    const y1 = sagAt(bend, ashLength, t1) - thickness * 0.5;
    const grit = 0.55 + ((i * 37) % 11) / 22;
    ctx.fillStyle = rgbToCss(mixRgb(style, [40, 38, 40], grit * 0.35), 0.92);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1, y1 + thickness * (1 - t1 * 0.25));
    ctx.lineTo(x0, y0 + thickness * (1 - t0 * 0.25));
    ctx.closePath();
    ctx.fill();
  }

  // Hairline cracks across the column: ash reads as fragile, which is what makes a player
  // want to flick it (§18). Keyed off the segment index, so it never twinkles per frame.
  if (ashLength > thickness) {
    ctx.strokeStyle = rgbToCss(mixRgb(style, [28, 26, 28], 0.55), 0.5);
    ctx.lineWidth = Math.max(0.5, thickness * 0.09);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = rodLength + ashLength * t;
      const sag = sagAt(bend, ashLength, t);
      ctx.beginPath();
      ctx.moveTo(x, sag - thickness * 0.44);
      ctx.lineTo(x + thickness * 0.12, sag + thickness * (0.5 - t * 0.25));
      ctx.stroke();
    }
  }
}

function sagAt(bend: number, ashLength: number, t: number): number {
  return Math.pow(t, 2) * bend * ashLength * 0.55;
}

/** §17: brightness, heat colour, glow radius and the occasional flare. */
function drawEmber(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  thickness: number,
  rodLength: number,
): void {
  const ember = state.cigarette.ember;
  const total = clamp01(ember.brightness + ember.flare * 0.5);
  if (total <= 0.01 && ember.lit === false) return;

  const centre = { x: rodLength, y: 0 };
  const hot = mixRgb([120, 40, 24], [255, 228, 168], ember.temperature);
  const cherry = mixRgb(hot, state.style.scene.ember, 0.6);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // The cherry lights the air around it, but the design's frame keeps that halo small: what
  // carries the light is the smoke above it, not a bloom the size of the table.
  const glowRadius = viewport.len(ember.glowRadius) * 0.55 * (1 + ember.flare * 0.5);
  if (glowRadius > 0.5) {
    const glow = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, glowRadius);
    glow.addColorStop(0, rgbToCss(cherry, clamp01(0.5 * total)));
    glow.addColorStop(0.4, rgbToCss(cherry, clamp01(0.15 * total)));
    glow.addColorStop(1, rgbToCss(cherry, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, glowRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  const core = ctx.createLinearGradient(
    centre.x - thickness * 0.8,
    0,
    centre.x + thickness * 0.4,
    0,
  );
  core.addColorStop(0, rgbToCss(mixRgb(cherry, [30, 26, 28], 0.6), 0.9));
  core.addColorStop(0.7, rgbToCss(cherry, clamp01(0.5 + total * 0.5)));
  core.addColorStop(1, rgbToCss(hot, clamp01(0.35 + total * 0.65)));
  ctx.fillStyle = core;
  roundRect(
    ctx,
    centre.x - thickness * 0.7,
    -thickness * 0.5,
    thickness * 1.1,
    thickness,
    thickness * 0.4,
  );
  ctx.fill();
  ctx.restore();
}

function drawFallingAsh(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
): void {
  const falling = state.cigarette.ash.falling;
  if (falling.length === 0) return;
  const style = state.style.cigarette.ash;
  ctx.save();
  for (const fragment of falling) {
    const at = viewport.px(fragment.origin);
    const size = viewport.len(fragment.size);
    ctx.translate(at.x, at.y);
    ctx.rotate(fragment.rotation);
    ctx.fillStyle = rgbToCss(mixRgb(style, [255, 255, 255], 0.15), 0.9);
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    // Reset to the frame transform, not to identity: on a 2x display identity draws the
    // next fragment at half the size in the wrong place.
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  }
  ctx.restore();
}

/**
 * The scene teaches instead of a tooltip (§10, §28): while the chrome is awake, the anchor the
 * engine thinks the player is about to use gets a faint breathing halo. Nothing appears when
 * the player is idle, and nothing is ever written down.
 */
export function drawAffordanceHint(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
): void {
  if (!state.ui.controlsVisible || state.ui.affordance === 'none') return;

  const anchor =
    state.ui.affordance === 'lighter'
      ? state.anchors.lighter
      : state.ui.affordance === 'flick'
        ? state.anchors.ash
        : state.ui.affordance === 'extinguish' || state.ui.affordance === 'discard'
          ? state.anchors.ashtray
          : state.anchors.body;

  const at = viewport.px(anchor);
  const phase = (Math.sin(state.nowMs / 620) + 1) / 2;
  const radius = viewport.len(0.05 + phase * 0.012);
  const halo = ctx.createRadialGradient(at.x, at.y, radius * 0.2, at.x, at.y, radius);
  halo.addColorStop(0, rgbToCss([255, 214, 150], 0.1 + phase * 0.14));
  halo.addColorStop(1, rgbToCss([255, 106, 26], 0));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
