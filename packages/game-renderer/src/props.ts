/**
 * Props layer: the tray, the pack, the lighter, and the cigarette itself.
 *
 * The cigarette is drawn from simulation numbers — rod fraction, ember brightness, ash
 * column length and bend — never from a sprite sheet, because §87 says the smoke is not a
 * picture and the fire is not a GIF. The ash column is drawn as a slightly bowed stack so
 * a long column visibly *asks* to be flicked (§6, §18).
 */

import { clamp01, mixRgb, rgbToCss, type Rgb } from '@puffly/shared';
import { emberHeat, emberPresence, type GameStateView } from '@puffly/game-core';
import { noise2, wander } from './noise';
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

/**
 * How big the two left-hand props are drawn, in stage units. Exported because the promise that
 * keeps them apart is checked against these numbers: a size that only the draw function knows is a
 * size no test can reason about.
 */
export const LIGHTER_SIZE = { width: 0.05, height: 0.075 } as const;
// Portrait, because that is the one silhouette a pack cannot be mistaken for. Lying it on its
// side (the previous 0.095 x 0.062) made it the same shape as a tin of something, and the tin is
// the thing the player then asks the name of.
export const PACK_SIZE = { width: 0.058, height: 0.088 } as const;

/** The lighter's case hangs above its anchor; the pack is centred on its own. */
export const lighterBox = (at: { x: number; y: number }, len: (v: number) => number) => {
  const w = len(LIGHTER_SIZE.width);
  const h = len(LIGHTER_SIZE.height);
  return { x0: at.x - w / 2, x1: at.x + w / 2, y0: at.y - h * 0.3, y1: at.y + h * 0.7 };
};

export const packBox = (centre: { x: number; y: number }, len: (v: number) => number) => {
  const w = len(PACK_SIZE.width);
  const h = len(PACK_SIZE.height);
  return { x0: centre.x - w / 2, x1: centre.x + w / 2, y0: centre.y - h / 2, y1: centre.y + h / 2 };
};

export function drawPack(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
): void {
  const centre = viewport.px(state.stage.layout.pack);
  const w = viewport.len(PACK_SIZE.width);
  const h = viewport.len(PACK_SIZE.height);
  const band = state.style.cigarette.band;
  const paper = state.style.cigarette.paper;

  // A tapped pack rocks and its contents lift: the same decaying impulse the lighter's cap answers
  // with, read here rather than owned here, so the picture and the state never disagree about when
  // the nudge happened (§60 — a tap that moves nothing reads as a tap that was swallowed).
  const fidget = clamp01(state.pack.fidget);
  const rock = Math.sin(fidget * Math.PI);

  ctx.save();
  ctx.translate(centre.x, centre.y - rock * h * 0.06);
  ctx.rotate(-0.05 + rock * 0.05);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, h * 0.52, w * 0.62, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body: the band colour, lit across from the scene's key direction, with the corners the
  // cellophane rounds off.
  const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  body.addColorStop(0, rgbToCss(mixRgb(band, [0, 0, 0], 0.58)));
  body.addColorStop(0.42, rgbToCss(mixRgb(band, [255, 255, 255], 0.16)));
  body.addColorStop(1, rgbToCss(mixRgb(band, [0, 0, 0], 0.44)));
  ctx.fillStyle = body;
  roundRect(ctx, -w / 2, -h * 0.34, w, h * 0.84, w * 0.1);
  ctx.fill();

  // The top face. The room is looked down into — the tray is an ellipse for the same reason — so a
  // box that shows only its front is a flat card.
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h * 0.34);
  ctx.lineTo(-w * 0.36, -h * 0.5);
  ctx.lineTo(w * 0.5, -h * 0.5);
  ctx.lineTo(w / 2, -h * 0.34);
  ctx.closePath();
  ctx.fillStyle = rgbToCss(mixRgb(band, [255, 255, 255], 0.3));
  ctx.fill();

  // The opening is a hole. Without this the rods stand on paper and the pack reads as a printed
  // card: what you actually see past them is the inside of the box, in shadow, and it is the only
  // dark value on the object.
  ctx.fillStyle = rgbToCss(mixRgb(band, [3, 3, 5], 0.94), 0.95);
  ctx.fillRect(-w * 0.4, -h * 0.5, w * 0.8, h * 0.13);

  // Two rows of rods, the back row shorter and cooler: a pack holds about nine in a row and what
  // reads at this size is *depth*, not count. The front row carries the filter ends, because the
  // pack and the rod in hand have to be recognisably the same object.
  const rodW = w * 0.15;
  const RISES = [0.2, 0.27, 0.16];
  RISES.forEach((rise, i) => {
    // Staggered, because a shaken pack's rods do not all move by the same amount and the difference
    // is what reads as *loose*.
    const lift = rise + rock * 0.05 * (1 + i * 0.5);
    const x = -w * 0.27 + i * w * 0.27 - rodW / 2;
    ctx.fillStyle = rgbToCss(mixRgb(paper, [150, 156, 168], 0.4), 0.8);
    ctx.fillRect(x + rodW * 0.42, -h * (0.44 + lift * 0.62), rodW * 0.7, h * (0.14 + lift * 0.4));
    ctx.fillStyle = rgbToCss(paper, 0.95);
    ctx.fillRect(x, -h * (0.46 + lift), rodW, h * (lift + 0.14));
    ctx.fillStyle = rgbToCss(state.style.cigarette.filter, 0.95);
    ctx.fillRect(x, -h * (0.46 + lift), rodW, h * 0.07);
  });

  // The lid, folded back over the rods — a hinged flip, not a removed cap.
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h * 0.34);
  ctx.lineTo(w / 2, -h * 0.34);
  ctx.lineTo(w * 0.56, -h * 0.56);
  ctx.lineTo(-w * 0.44, -h * 0.56);
  ctx.closePath();
  ctx.fillStyle = rgbToCss(mixRgb(band, [0, 0, 0], 0.3));
  ctx.fill();
  // Foil showing at the fold, which is the brightest thing on a real pack.
  ctx.fillStyle = rgbToCss(mixRgb(paper, [186, 188, 196], 0.28), 0.9);
  ctx.fillRect(-w * 0.42, -h * 0.53, w * 0.84, Math.max(1, h * 0.045));

  // The cellophane. A soft pack is wrapped, and the wrap is what the eye actually catches on one:
  // a sheen that runs diagonally because the sheet is stretched over an edge, a seam folded down
  // the far side, and a pull tab where the flap meets it. Drawn over the box rather than as the
  // box, so the pack keeps its colour underneath and the highlight stays a highlight.
  const sheen = ctx.createLinearGradient(-w * 0.5, h * 0.5, w * 0.5, -h * 0.5);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.34, rgbToCss(mixRgb(paper, [255, 255, 255], 0.7), 0.16));
  sheen.addColorStop(0.44, 'rgba(255,255,255,0.3)');
  sheen.addColorStop(0.58, rgbToCss(mixRgb(paper, [255, 255, 255], 0.7), 0.1));
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  roundRect(ctx, -w / 2, -h * 0.34, w, h * 0.84, w * 0.1);
  ctx.fill();
  // The folded seam, one step in from the right edge, and the tab that breaks it out.
  ctx.fillStyle = rgbToCss(mixRgb(paper, [190, 194, 204], 0.4), 0.34);
  ctx.fillRect(w * 0.3, -h * 0.34, w * 0.055, h * 0.84);
  ctx.fillStyle = rgbToCss(mixRgb(paper, [228, 230, 236], 0.5), 0.62);
  ctx.fillRect(w * 0.2, -h * 0.4, w * 0.15, h * 0.075);

  // The band across the front, and one hairline above it. Colour only: §3 says no mark, no word.
  ctx.fillStyle = rgbToCss(mixRgb(band, [255, 255, 255], 0.5), 0.9);
  ctx.fillRect(-w / 2, -h * 0.06, w, h * 0.17);
  ctx.strokeStyle = rgbToCss(mixRgb(band, [0, 0, 0], 0.72), 0.6);
  ctx.lineWidth = Math.max(1, h * 0.018);
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h * 0.06);
  ctx.lineTo(w / 2, -h * 0.06);
  ctx.stroke();

  ctx.restore();
}

/**
 * How far a flip-top actually throws: past vertical, short of lying flat along the tank. Exported
 * because `lid-hinge.test.ts` checks the drawn shell against `cos` of this angle, and a second copy
 * of the number in a test file is two numbers the day someone tunes one of them.
 */
export const LID_THROW_DEG = 78;

export function drawLighter(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
): void {
  const at = viewport.px(state.stage.layout.lighter);
  const bodyW = viewport.len(LIGHTER_SIZE.width);
  const bodyH = viewport.len(LIGHTER_SIZE.height);
  const flame = state.lighter.flame;
  const sputter = state.lighter.sputter;
  // A flourish throws the case a little way off the table. Applied to the anchor rather than with
  // `ctx.rotate`/`translate` so every coordinate this function emits is still in canvas space — the
  // placement guard reads them back, and it reads them at rest, where this is zero.
  const fidget = clamp01(state.lighter.fidget);
  at.y -= Math.sin(fidget * Math.PI) * bodyH * 0.22;
  const top = at.y - bodyH * 0.3;

  ctx.save();

  // A contact shadow, so the object sits in the room instead of floating over it (§58).
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(at.x, at.y + bodyH * 0.72, bodyW * 0.72, bodyH * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  // The form is the flip-top, because that is the lighter almost everyone on earth recognises: a
  // fuel tank, a chimney with a wick in it, a knurled wheel peeking out on one side, and one cap on
  // a hinge at the back that throws open. The cap is driven by `state.lighter.lid` rather than by
  // the flame, so the object reads as open the instant it is struck, and the tank keeps the exact
  // footprint `lighterBox` promises — that box is what a finger is aimed at.
  const key = state.world.light.keyDirectionDeg;
  const base = state.style.lighter.hue;
  const lid = clamp01(state.lighter.lid);
  const halfW = bodyW / 2;

  // Three bands, top down. The cap is a *cover*, so its bottom edge is the top of the tank and the
  // chimney it hides belongs to the tank — not to a second box stacked on the first, which is what
  // made the previous version read as a tin.
  const capH = bodyH * 0.44;
  const chimH = bodyH * 0.11;
  const seamY = top + capH;
  const chimTop = seamY - chimH;
  const tankBottom = top + bodyH;

  // One metal ramp, restarted per band. `shift` moves the specular off the tank's so the seam reads
  // as a step in the silhouette instead of a line drawn across one continuous cylinder.
  const ramp = (darken: number, shift: number): void => {
    const metal = ctx.createLinearGradient(at.x - halfW, 0, at.x + halfW, 0);
    metal.addColorStop(0, rgbToCss(mixRgb(base, [10, 10, 14], Math.min(0.95, 0.8 + darken))));
    metal.addColorStop(
      clamp01(0.33 + Math.cos((key * Math.PI) / 180) * 0.1 + shift),
      rgbToCss(mixRgb(base, [238, 238, 242], Math.max(0.14, 0.52 - darken * 0.2))),
    );
    metal.addColorStop(1, rgbToCss(mixRgb(base, [10, 10, 14], Math.min(0.95, 0.7 + darken))));
    ctx.fillStyle = metal;
  };

  // The cap. It hinges at the back of the case, at the shoulder, so in this front view it does not
  // swing sideways like a door and it does not shrink: it *turns*. One length, one pivot, and the
  // angle is the only input — the height it still occupies is `length × cos(angle)`, the skirt's
  // lower edge never leaves the hinge, and the far end narrows only by what perspective asks for.
  // That is why this block is drawn before the chimney: a shell tipped back is behind it, and a
  // shell drawn in front of the chimney at 78° would hide the one part the whole gesture uncovers.
  // Every point is still emitted in canvas space, because the placement guard reads them back.
  // Closed, the cap's skirt reaches the tank's shoulder and hides the chimney entirely; opening it
  // is the skirt lifting off the hinge, not the whole object sliding up. The cap is also a hair
  // wider than the tank because it fits *over* it — that overhang is the silhouette cue that says
  // "this part comes off", and without it the closed lighter reads as one turned can.
  const capHalf = halfW * 1.035;
  const lidAngle = (lid * LID_THROW_DEG * Math.PI) / 180;
  const lean = Math.cos(lidAngle);
  // The hinge end is pinned to the shoulder and the shell is rigid, so the only thing that changes
  // is how much of its own length is still standing up. At full throw the band left above the
  // shoulder is `0.22 × capH` — just under the chimney, which is the point: the chimney and the
  // wick come out from behind it rather than out of the middle of it.
  const capBottom = seamY;
  const capTop = seamY - capH * lean;
  const topHalf = capHalf * (1 - 0.09 * (1 - lean));
  const r = Math.min(bodyW * 0.13, capH * 0.16);
  const capCorners: Array<[number, number]> = [
    [at.x - capHalf, capBottom],
    [at.x - capHalf, capTop + r],
    [at.x - capHalf + r * 0.42, capTop + r * 0.12],
    [at.x - topHalf + r * 0.6, capTop],
    [at.x + topHalf - r * 0.6, capTop],
    [at.x + capHalf - r * 0.42, capTop + r * 0.12],
    [at.x + capHalf, capTop + r],
    [at.x + capHalf, capBottom],
  ];
  ctx.beginPath();
  capCorners.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ramp(0.16, 0.24);
  ctx.fill();
  // The inside of the cap is a hollow shell, and that is the detail that says something was
  // *covering* the chimney. How much of it is facing the camera is exactly how far the shell has
  // tipped, so the band grows as `1 − cos` and is nothing at all while the lid is shut.
  if (lid > 0.02) {
    const shrink = bodyW * 0.11;
    const shows = 1 - lean;
    const innerTop = capTop + chimH * (0.5 + 1.4 * shows);
    ctx.beginPath();
    ctx.moveTo(at.x - capHalf + shrink, capBottom - bodyH * 0.015);
    ctx.lineTo(at.x - capHalf + shrink * 1.7, innerTop);
    ctx.lineTo(at.x + capHalf - shrink * 1.7, innerTop);
    ctx.lineTo(at.x + capHalf - shrink, capBottom - bodyH * 0.015);
    ctx.closePath();
    // Not black: the flame is drawn over this with `lighter`, and a dark enough shell turns the
    // base of the flame into a blown-out disc instead of a flame.
    ctx.fillStyle = rgbToCss(mixRgb(base, [26, 23, 26], 0.72), clamp01(lid * 0.62));
    ctx.fill();
  }
  // A specular riding the far edge, placed by the key light rather than stretched across the whole
  // width: a full-width bar is what made the closed cap look like the rim of a tin.
  const spec = Math.cos((key * Math.PI) / 180) * topHalf * 0.26;
  ctx.lineWidth = Math.max(0.7, bodyH * 0.012);
  ctx.strokeStyle = rgbToCss(mixRgb(base, [240, 242, 248], 0.72), 0.5);
  ctx.beginPath();
  ctx.moveTo(at.x + spec - topHalf * 0.52, capTop + Math.max(0.7, bodyH * 0.006));
  ctx.lineTo(at.x + spec + topHalf * 0.52, capTop + Math.max(0.7, bodyH * 0.006));
  ctx.stroke();

  // The chimney, which only becomes visible as the cap lifts: a narrower band of darker metal with
  // two holes in it, so what the cap uncovers is a part with a job and not a shadow.
  ramp(0.4, 0.06);
  ctx.fillRect(at.x - bodyW * 0.3, chimTop, bodyW * 0.6, chimH);
  // The wick, because that is what the flame is actually standing on.
  ctx.fillStyle = rgbToCss(mixRgb([238, 230, 214], base, 0.35));
  ctx.fillRect(at.x - bodyW * 0.09, chimTop - bodyH * 0.05, bodyW * 0.18, bodyH * 0.07);

  // The tank.
  ramp(0, 0);
  roundRect(ctx, at.x - halfW, seamY, bodyW, tankBottom - seamY, bodyW * 0.16);
  ctx.fill();
  // A foot, so the case has a base rather than only a bottom edge.
  ctx.fillStyle = rgbToCss(mixRgb(base, [8, 8, 12], 0.72), 0.5);
  ctx.fillRect(at.x - halfW, tankBottom - bodyH * 0.07, bodyW, bodyH * 0.07);
  // The seam is the strongest cue the object has while it is closed, so it is drawn as a gap and a
  // shoulder rather than one line: dark where the cap's skirt ends, bright where the tank's top
  // edge catches the light just below it.
  ctx.fillStyle = rgbToCss(mixRgb(base, [0, 0, 0], 0.72), 0.8);
  ctx.fillRect(at.x - halfW, seamY, bodyW, Math.max(1, bodyH * 0.022));
  ctx.fillStyle = rgbToCss(mixRgb(base, [232, 232, 238], 0.5), 0.4);
  // Inset, because the tank's own corners are rounded: a full-width line at the shoulder pokes past
  // them and reads as a bar laid across the front of the case.
  ctx.fillRect(
    at.x - bodyW * 0.42,
    seamY + Math.max(1, bodyH * 0.022),
    bodyW * 0.84,
    Math.max(0.7, bodyH * 0.008),
  );
  // The hinge barrel, one knuckle at each end of the seam. Kept inside the silhouette: a tab that
  // breaks the outline reads as a handle rather than a joint.
  ctx.fillStyle = rgbToCss(mixRgb(base, [30, 29, 34], 0.6), 0.9);
  for (const side of [-1, 1]) {
    ctx.fillRect(
      at.x + side * halfW - (side > 0 ? bodyW * 0.1 : 0),
      seamY + Math.max(1, bodyH * 0.02),
      bodyW * 0.1,
      Math.max(1.4, bodyH * 0.04),
    );
  }

  // The flint wheel, half out of the chimney's right side: the part that says "thumb this".
  const wheelR = bodyW * 0.15;
  const wheelX = at.x + bodyW * 0.28;
  const wheelY = chimTop + chimH * 0.45;
  ctx.beginPath();
  ctx.arc(wheelX, wheelY, wheelR, 0, Math.PI * 2);
  ctx.fillStyle = rgbToCss(mixRgb(base, [66, 64, 70], 0.62));
  ctx.fill();
  // Knurling. At this size five short strokes are enough to stop it reading as a flat dot.
  ctx.lineWidth = Math.max(0.6, bodyW * 0.028);
  ctx.strokeStyle = rgbToCss(mixRgb(base, [18, 18, 22], 0.72), 0.8);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.42;
    ctx.beginPath();
    ctx.moveTo(wheelX + Math.cos(a) * wheelR * 0.4, wheelY + Math.sin(a) * wheelR * 0.4);
    ctx.lineTo(wheelX + Math.cos(a) * wheelR * 0.94, wheelY + Math.sin(a) * wheelR * 0.94);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(wheelX, wheelY, wheelR * 0.97, 0, Math.PI * 2);
  ctx.strokeStyle = rgbToCss(mixRgb(base, [242, 242, 246], 0.6), 0.5);
  ctx.stroke();

  if (flame > 0.01) {
    // The flame stands on the wick, not on the top of the closed case. With the cap thrown
    // back those two are ~13 px apart on a phone, and the gap read as fire from nowhere.
    const flameBase = chimTop - bodyH * 0.05;
    const jitter = wander(state.nowMs / 1000, 11) * 0.12 + state.lighter.flicker * 0.4;
    const height =
      state.style.lighter.flameHeight *
      viewport.len(1) *
      flame *
      (1 + jitter * 0.25) *
      (1 - sputter * 0.7);
    const width = height * 0.42;
    // A flame is narrowest where it leaves the wick and widest a little way up. Starting the path at
    // the full `width` gave the base a flat bottom the same span as the case, which at this size is
    // a white disc rather than a flame.
    const baseW = Math.min(width, bodyW * 0.2);
    const tipY = flameBase - height;

    const gradient = ctx.createLinearGradient(at.x, flameBase, at.x, tipY);
    gradient.addColorStop(0, rgbToCss(mixRgb(state.style.lighter.hue, [255, 252, 240], 0.42), 0.7));
    gradient.addColorStop(0.45, rgbToCss(state.style.lighter.hue, 0.85));
    gradient.addColorStop(1, rgbToCss(mixRgb(state.style.lighter.hue, [60, 40, 90], 0.6), 0));

    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.moveTo(at.x - baseW / 2, flameBase);
    ctx.quadraticCurveTo(
      at.x - width * 0.62 + jitter * width,
      flameBase - height * 0.5,
      at.x + jitter * width * 0.6,
      tipY,
    );
    ctx.quadraticCurveTo(
      at.x + width * 0.6 + jitter * width,
      flameBase - height * 0.5,
      at.x + baseW / 2,
      flameBase,
    );
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // The blue throat of a real flame, kept subtle (§58: no neon gradient soup).
    ctx.beginPath();
    ctx.ellipse(at.x, flameBase - height * 0.2, width * 0.3, height * 0.13, 0, 0, Math.PI * 2);
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
  /** S6's 写实度 as the frame reads it; 1 is the shipped default's position on that dial. */
  cartoon = 1,
): void {
  const cigarette = state.cigarette;
  if (!cigarette.pose.visible && cigarette.state !== 'IDLE') return;

  const style = state.style.cigarette;
  const pivotPoint = viewport.px(cigarette.pose.pivot);
  const tipPoint = viewport.px(cigarette.pose.tip);
  const thickness = viewport.len(cigarette.pose.thickness);

  // The stage maps x and y by *different* scales — a normalised square stretched over a tall
  // box — so the angle the rod is authored at is not the angle it makes on screen, and a
  // normalised length is not one number in pixels. Drawing the rod with `rotate(angleDeg)` and
  // `len(rodLength)` put its burning end 52 px away from `pose.tip` on a 390 px phone, which is
  // the point the smoke is born at, the cherry's own glow is centred on, and a tap is measured
  // against. The thread was rising out of thin air beside the rod. So the frame is built from
  // the two endpoints the core already agrees on, and everything downstream — ash, char, cherry
  // — hangs off the geometry that actually landed on screen.
  const angle = Math.atan2(tipPoint.y - pivotPoint.y, tipPoint.x - pivotPoint.x);
  const rodLength = Math.hypot(tipPoint.x - pivotPoint.x, tipPoint.y - pivotPoint.y);
  const ashPoint = viewport.px(cigarette.pose.ashTip);
  const ashLength = Math.hypot(ashPoint.x - tipPoint.x, ashPoint.y - tipPoint.y);

  ctx.save();
  ctx.translate(pivotPoint.x, pivotPoint.y);
  ctx.rotate(angle);

  const filterLength = rodLength * 0.22;

  /**
   * S7's silent chain — 「余烬变亮 → 炭化线推进 → 纸面凹陷」 — ended in a rod whose paper never moved,
   * and S15 names the same thing from the player's side: 按住不放 · 吸入时纸面会塌陷. Drawing the pull as
   * nothing at all left the third beat of that chain to the ash and the colour alone.
   *
   * It is read off the draw the core is already doing (`active`, `intensity`), never off a clock, so
   * the same session replays into the same collapse (§71). At zero the path is the straight band this
   * file drew before: every control point falls back onto the line it was already on.
   */
  const puffing = state.cigarette.puff;
  const dip = puffing.active ? thickness * DIP_SHARE * puffing.intensity : 0;

  if (rodLength > 0.5) {
    const rod = ctx.createLinearGradient(0, -thickness / 2, 0, thickness / 2);
    rod.addColorStop(0, rgbToCss(mixRgb(style.paper, [255, 255, 255], 0.25)));
    rod.addColorStop(0.55, rgbToCss(style.paper));
    rod.addColorStop(1, rgbToCss(mixRgb(style.paper, [0, 0, 0], 0.35)));
    ctx.fillStyle = rod;
    rodBodyPath(ctx, rodLength, thickness, dip);
    ctx.fill();

    // Brand band and the seam of the paper: two strokes, no text (§4, §29).
    if (contrast === 'high') {
      // A thin lit edge is what makes the rod readable against a busy or bright room (§64),
      // and it is one stroke, not a re-drawn sprite.
      ctx.strokeStyle = rgbToCss(mixRgb(style.paper, [255, 255, 255], 0.7), 0.75);
      ctx.lineWidth = Math.max(1, thickness * 0.14);
      rodBodyPath(ctx, rodLength, thickness, dip);
      ctx.stroke();
    }

    // The band is a rectangle painted across the paper, so it is cut to the height the paper actually
    // has where it sits — read off the emitted curve, not from a second copy of the dent's formula.
    const bandLeft = rodLength * 0.62;
    const bandWidth = Math.max(1, rodLength * 0.07);
    const bandGive = paperGive(rodLength, thickness, dip, bandLeft + bandWidth / 2);
    ctx.fillStyle = rgbToCss(style.band, 0.9);
    ctx.fillRect(bandLeft, -thickness / 2 + bandGive, bandWidth, thickness - 2 * bandGive);
    ctx.strokeStyle = rgbToCss(mixRgb(style.paper, [0, 0, 0], 0.2), 0.5);
    ctx.lineWidth = Math.max(0.5, thickness * 0.08);
    ctx.beginPath();
    ctx.moveTo(filterLength, -thickness * 0.2);
    // The seam is the paper's own edge, so it goes down with the paper rather than staying flat over it.
    ctx.quadraticCurveTo(
      rodLength * WAIST,
      -thickness * 0.2 + dip * 2,
      rodLength,
      -thickness * 0.2 + paperGive(rodLength, thickness, dip, rodLength),
    );
    ctx.stroke();

    const filter = ctx.createLinearGradient(0, 0, filterLength, 0);
    filter.addColorStop(0, rgbToCss(mixRgb(style.filter, [0, 0, 0], 0.2)));
    filter.addColorStop(1, rgbToCss(style.filter));
    ctx.fillStyle = filter;
    roundRect(ctx, 0, -thickness / 2, filterLength, thickness, thickness * 0.45);
    ctx.fill();
  }

  drawAshColumn(ctx, state, thickness, rodLength, ashLength);
  drawHeatBleed(ctx, state, viewport, thickness, rodLength);
  drawEmber(ctx, state, viewport, thickness, rodLength, cartoon);
  ctx.restore();

  drawFallingAsh(ctx, state, viewport);
}

/**
 * How far past the smooth char front the grains bite, as a share of the rod's thickness, and the
 * seed the grain field is sampled from. S12's realistic half — 「炭化线沿纸面逐段推进，边界有颗粒状
 * 毛边」 — and neither number is free: the whole thickness would read as a second rod lying beside
 * the first, and a tenth would not be visible at the 8–10 px a phone draws this at.
 */
const CHAR_BIT = 0.46;
const CHAR_GRAIN_SEED = 1332;

/**
 * Fire travels: the paper just behind the cherry chars and glows, which is what sells the
 * rod as something burning rather than a rectangle with a red dot on it (§17).
 *
 * The colour ramp alone did not do that. It ended in a rounded cap, so the boundary between char
 * and paper was one smooth arc — and a burn line that smooth is a *paint stroke*, not fire. Paper is
 * a fibre: the line eats across it grain by grain, each millimetre at its own depth. The grains are
 * keyed to their index through a fixed noise field, never to the clock, so the same millimetre of
 * paper chars the same way in every frame; advancing the burn carries the whole field forward with
 * it, which is what 逐段推进 means and what a per-frame twinkle would not be.
 */
function drawHeatBleed(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  thickness: number,
  rodLength: number,
): void {
  const ember = state.cigarette.ember;
  const total = emberPresence(ember);
  if (total <= 0.05 || rodLength <= 1) return;

  const reach = Math.min(rodLength * 0.4, viewport.len(0.05) * (1 + total));
  if (reach <= 0.5) return;

  const char = ctx.createLinearGradient(rodLength - reach, 0, rodLength, 0);
  char.addColorStop(0, rgbToCss([24, 18, 16], 0));
  char.addColorStop(0.6, rgbToCss([46, 30, 22], 0.35 * total));
  char.addColorStop(
    1,
    rgbToCss(mixRgb([255, 150, 60], [255, 240, 200], emberHeat(ember.temperature)), 0.55 * total),
  );

  ctx.save();
  ctx.fillStyle = char;
  roundRect(ctx, rodLength - reach, -thickness * 0.5, reach, thickness, thickness * 0.45);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = char;
  ctx.fillRect(rodLength - reach * 0.55, -thickness * 0.42, reach * 0.55, thickness * 0.84);

  // The toothed front itself: a row of char grains sitting *this side* of the ramp's edge, where
  // the paper has not gone yet. Small and dark by construction — the cherry's own glow is the ramp.
  const boundary = rodLength - reach;
  const size = Math.max(1, thickness * 0.16);
  const grains = Math.max(9, Math.min(38, Math.round((thickness / size) * 5)));
  ctx.fillStyle = rgbToCss([30, 21, 17]);
  for (let i = 0; i < grains; i += 1) {
    const across = noise2(i * 0.53, 0.5, CHAR_GRAIN_SEED);
    const bite = noise2(i * 0.31, 1.7, CHAR_GRAIN_SEED);
    const side = size * (0.6 + 0.8 * bite);
    ctx.globalAlpha = (0.26 + 0.5 * bite) * total;
    ctx.fillRect(
      boundary - bite * thickness * CHAR_BIT,
      -thickness * 0.5 + across * thickness,
      side,
      side,
    );
  }
  ctx.restore();
}

/** §18: the column bows as it lengthens, which is what makes a player want to flick it. */
/**
 * @param ashLengthPx the column's length as it landed on screen, measured between the two points
 * the core calls the cherry and the far end of the ash. Deriving it from `ash.length` again here
 * would put the ash's tip somewhere the core has never heard of, and the falling-ash cue is
 * aimed at that point.
 */
function drawAshColumn(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  thickness: number,
  rodLength: number,
  ashLengthPx: number,
): void {
  const ash = state.cigarette.ash;
  if (ash.length <= 0) return;

  const ashLength = ashLengthPx;
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

const EMBER_COOL: Rgb = [120, 40, 24];
const EMBER_MID: Rgb = [255, 120, 40];
const EMBER_HOT: Rgb = [255, 228, 168];

/** How far past the authored radius the cartoon end throws the cherry's halo. */
const GLOW_REACH = 0.4;

/** §17: brightness, heat colour, glow radius and the occasional flare. */
function drawEmber(
  ctx: CanvasRenderingContext2D,
  state: GameStateView,
  viewport: Viewport,
  thickness: number,
  rodLength: number,
  cartoon: number,
): void {
  const ember = state.cigarette.ember;
  const total = emberPresence(ember);
  if (total <= 0.01 && ember.lit === false) return;

  const centre = { x: rodLength, y: 0 };
  // S7's first 写实 item, in three stops rather than two: 暗红 → 橙 → 白芯. A single straight mix from
  // dark red to near-white put the coolest cherry the simulation can write (0.4) at a pale tan and
  // reserved 暗红 for a temperature that never happens; measured before this, a cherry at rest read
  // (216, 174, 126) and only an inhale was orange. The middle stop is where a resting cherry sits.
  const heat = emberHeat(ember.temperature);
  const hot =
    heat < 0.5
      ? mixRgb(EMBER_COOL, EMBER_MID, heat / 0.5)
      : mixRgb(EMBER_MID, EMBER_HOT, (heat - 0.5) / 0.5);
  const cherry = mixRgb(hot, state.style.scene.ember, 0.6);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // S7 puts this halo on the *cartoon* side of its own split: 「余烬带一层柔和辉光扩散，不完全物理，
  // 偏向『看得见热』」, and its last line names 辉光 among the things that go through the easing curves
  // rather than the physics. So the radius the simulation authored is the floor the 写实 end draws and
  // the cartoon end spreads past it — the 0.55 this used to carry shrank the picture *below* the
  // physics at every setting, which is the one reading the deck never offered.
  const spread = (1 + GLOW_REACH * cartoon) * (1 + ember.flare * 0.5);
  const glowRadius = viewport.len(ember.glowRadius) * spread;
  if (glowRadius > 0.5) {
    const glow = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, glowRadius);
    // The mid stop walks outward with the spread, so a wider halo is a *gentler* one rather than a
    // bigger disc of the same light: the light holds past the cherry and then leaves.
    const mid = 0.4 + 0.06 * cartoon;
    glow.addColorStop(0, rgbToCss(cherry, clamp01(0.5 * total)));
    glow.addColorStop(mid, rgbToCss(cherry, clamp01(0.15 * total)));
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
    // A piece that broke off the column is drawn as long as the core says it is; a grain keeps the
    // body it always had. `length` is state rather than a stretch factor here for the same reason
    // the rod's tip is: a shape the renderer invented would not be the ash the sim is carrying.
    const reach = fragment.length > 0 ? viewport.len(fragment.length) / 2 : size;
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(fragment.rotation);
    ctx.fillStyle = rgbToCss(mixRgb(style, [255, 255, 255], 0.15), 0.9);
    ctx.beginPath();
    ctx.ellipse(0, 0, reach, size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    // Restored rather than re-set to the frame transform: the frame transform is no longer one
    // fixed matrix — the ignition push (S7) is a camera the whole frame shares — and a hard
    // setTransform here would silently drop it for every fragment after the first.
    ctx.restore();
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

/** How deep the paper gives under a full draw, as a share of the rod's own thickness. */
export const DIP_SHARE = 0.22;

/** Where the tube pinches: just behind the cherry, which is where the air is actually leaving. */
export const WAIST = 0.78;

/**
 * How far the paper has given inward at one x, sampled from the very curve `rodBodyPath` emits.
 *
 * There is a reason this reads the curve instead of using a formula: the first version of the dent
 * shrank the brand band by a bell of its own, and the bell disagreed with the Bézier by 0.15 px at the
 * band's centre — a stripe standing a hair outside a collapsed tube, which is exactly how a fake dent
 * reads as a bug. One sampler, one shape.
 */
function paperGive(length: number, thickness: number, dip: number, x: number): number {
  if (dip <= 0) return 0;
  const half = thickness / 2;
  const r = Math.min(thickness * 0.45, length / 2, half);
  const x0 = r;
  const x1 = length - r;
  const cy = -half + dip * 2;
  let closest = -half;
  let bestDx = Infinity;
  for (let step = 0; step <= 32; step += 1) {
    const t = step / 32;
    const mt = 1 - t;
    const px = mt * mt * x0 + 2 * mt * t * (length * WAIST) + t * t * x1;
    const py = mt * mt * -half + 2 * mt * t * cy + t * t * -half;
    const dx = Math.abs(px - x);
    if (dx < bestDx) {
      bestDx = dx;
      closest = py;
    }
  }
  return half + closest;
}

/**
 * The rod's paper as a tube that can be sucked inward (S7, S15: 吸入时纸面会塌陷).
 *
 * Both faces bow toward the axis, because an emptying paper tube pinches rather than dents one side.
 * At `dip` = 0 every control point falls back onto the straight line `roundRect` drew, so an idle rod
 * is the identical shape it has always been and no other check in this file moves.
 */
function rodBodyPath(
  ctx: CanvasRenderingContext2D,
  length: number,
  thickness: number,
  dip: number,
): void {
  const half = thickness / 2;
  const r = Math.min(thickness * 0.45, length / 2, half);
  const waist = length * WAIST;
  ctx.beginPath();
  ctx.moveTo(r, -half);
  ctx.quadraticCurveTo(waist, -half + dip * 2, length - r, -half);
  ctx.quadraticCurveTo(length, -half, length, -half + r);
  ctx.lineTo(length, half - r);
  ctx.quadraticCurveTo(length, half, length - r, half);
  ctx.quadraticCurveTo(waist, half - dip * 2, r, half);
  ctx.quadraticCurveTo(0, half, 0, half - r);
  ctx.lineTo(0, -half + r);
  ctx.quadraticCurveTo(0, -half, r, -half);
  ctx.closePath();
}
