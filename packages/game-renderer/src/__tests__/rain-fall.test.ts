/**
 * Rain has to fall, not stutter — SPEC.md §59, and the player's 「背景的抖动…我不知道是什么算法」.
 *
 * The old streaks were 17–59 px long and moved 11–22 px per frame. Two consecutive frames of that
 * share almost nothing, so the eye does not see water going down — it sees dashes appearing and
 * vanishing at scattered spots, at 60 Hz, and only while the weather happens to be rain. That is a
 * shimmer with no name attached to it, which is exactly what was reported: quiet at the start of a
 * break, and then something in the background will not stop.
 *
 * Whether a moving mark reads as motion is a ratio — how far it goes in one frame against how long
 * it is — so that is what this measures, and the last claim measures it off the pixels the
 * production call actually drew, pair by pair.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { STEP_MS, type GameStateView } from '@puffly/game-core';
import { drawDust, drawRain, rainGeometry, rainLines } from '../weather';
import { createViewport } from '../viewport';
import { createFakeCanvas } from './fakeCanvas';
import { harness } from '../../../game-core/src/__tests__/harness';

const FRAME_SECONDS = STEP_MS / 1000;
/** A phone in portrait, which is the layout the claim is about. */
const VIEWPORT = createViewport({ width: 390, height: 844, dpr: 1 });
const STAGE_PX = 844;

function rainyView(nowMs: number, base: GameStateView): GameStateView {
  return {
    ...base,
    nowMs,
    world: { ...base.world, weather: 'rain' as const, ambientGain: 0.6 },
    // No wind, so a streak's x is the same in every frame and the two frames can be paired by it.
    smoke: { ...base.smoke, drift: { ...base.smoke.drift, x: 0 } },
  } as GameStateView;
}

/** The streaks `drawRain` put on the canvas, as the pixels the player would have seen. */
function drawn(
  canvas: ReturnType<typeof createFakeCanvas>,
  state: GameStateView,
): { x: number; y: number; length: number }[] {
  const before = canvas.calls.length;
  drawRain(canvas.ctx, state, VIEWPORT, false);
  const recorded = canvas.calls.slice(before);
  canvas.calls.length = before;
  const tops = recorded.filter((call) => call.name === 'moveTo');
  const bottoms = recorded.filter((call) => call.name === 'lineTo');
  return tops.map((top, i) => {
    const bottom = bottoms[i]!;
    const dx = Number(bottom.args[0]) - Number(top.args[0]);
    const dy = Number(bottom.args[1]) - Number(top.args[1]);
    return { x: Number(top.args[0]), y: Number(top.args[1]), length: Math.hypot(dx, dy) };
  });
}

describe('the rain falls instead of flickering (§59)', () => {
  it('gives every streak a length it can actually be seen moving', () => {
    const streaks = rainGeometry('neon-street', 'rain');
    expect(streaks.length).toBeGreaterThan(20);
    let worst = 0;
    for (const streak of streaks) {
      worst = Math.max(worst, (streak.speed * FRAME_SECONDS) / streak.length);
    }
    console.log(`RAIN step/length worst=${worst.toFixed(3)} n=${String(streaks.length)}`);
    // Shipped: 0.124. The old 0.02..0.07 lengths at 0.75..1.55 speed: 0.775, which is three quarters
    // of the streak gone between one frame and the next.
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThan(0.4);
  });

  it('still comes down, so the flicker was not cured by a freeze', () => {
    const streaks = rainGeometry('neon-street', 'rain');
    // `travel` is in stage units, so the stage height converts it to the pixels on a phone.
    const slowest = Math.min(...streaks.map((s) => s.speed)) * FRAME_SECONDS * STAGE_PX;
    const fastest = Math.max(...streaks.map((s) => s.speed)) * FRAME_SECONDS * STAGE_PX;
    console.log(`RAIN px/frame ${slowest.toFixed(1)}..${fastest.toFixed(1)}`);
    // Under ~2 px a frame reads as a still photograph with dust on it; over ~14 px a 1 px line
    // reads as a strobe again. The old streaks were at 11..22.
    expect(slowest).toBeGreaterThan(2);
    expect(fastest).toBeLessThan(14);
  });

  it('moves each streak down a little between two frames, in the pixels it draws', () => {
    const h = harness({ content: DEFAULT_CONTENT, environmentId: 'neon-street' });
    const base = h.state() as GameStateView;
    const canvas = createFakeCanvas();
    const before = drawn(canvas, rainyView(0, base));
    const after = drawn(canvas, rainyView(STEP_MS, base));
    expect(before.length).toBeGreaterThan(20);

    // The pairing is the ruler, so check it holds before using it: with no wind a streak keeps its
    // exact column, and no two streaks may share one, or the "same streak" is really two different
    // ones. Rounded to whole pixels six of them do collide, which is why the key is the float.
    const column = (s: { x: number }): string => s.x.toFixed(6);
    const columns = new Set(before.map(column));
    expect(columns.size).toBe(before.length);
    const next = new Map(after.map((s) => [column(s), s]));

    const moves: string[] = [];
    let paired = 0;
    for (const streak of before) {
      const moved = next.get(column(streak));
      if (!moved) continue;
      paired++;
      const step = moved.y - streak.y;
      // The line's own length is measured from the same stroke, so this ratio is the shipped
      // picture's, not a re-derivation of the generator's numbers.
      const ratio = step / streak.length;
      if (!(step > 0) || ratio >= 0.25) {
        moves.push(
          `step=${step.toFixed(1)}px length=${streak.length.toFixed(1)}px ratio=${ratio.toFixed(3)}`,
        );
      }
    }
    console.log(
      `RAIN paired=${String(paired)}/${String(before.length)} violations=${String(moves.length)}`,
    );
    moves.slice(0, 4).forEach((line) => console.log(`RAIN bad ${line}`));
    // Every streak has to go somewhere, or the sheet is a photograph.
    expect(paired).toBeGreaterThan(before.length * 0.9);
    // And it has to stay mostly the same line: past a quarter of its own length in one frame,
    // consecutive frames stop overlapping and the eye sees one mark replace another.
    expect(moves).toEqual([]);
  });

  it('falls as one sheet, not as fifty-four separate random objects', () => {
    // 「别抖动 就是随机的…要不然让它慢慢地去动」. Speed is what reads as random here: a wide band of
    // speeds over the same height is fifty-four independent things to track, and a narrow band is
    // one weather front. The ratio is the shape of that difference, not an absolute tempo.
    const streaks = rainGeometry('neon-street', 'rain');
    const speeds = streaks.map((s) => s.speed);
    const ratio = Math.max(...speeds) / Math.min(...speeds);
    console.log(
      `RAIN speed spread ${Math.min(...speeds).toFixed(3)}..${Math.max(...speeds).toFixed(3)} ratio=${ratio.toFixed(3)}`,
    );
    expect(ratio).toBeGreaterThan(1);
    // Measured, not read off the formula: the fbm draws never reach the ends of their own range, so
    // the shipped band is 1.202 (0.274..0.329), the wider band before it was 1.356 (0.505..0.685),
    // and the original stutter was 1.623 (0.889..1.443). 1.4 would have been inside the noise —
    // it left the widened band green, which is how this line got moved down to 1.3.
    expect(ratio).toBeLessThan(1.3);
  });
});

/**
 * Streaks are the sky seen from somewhere. Half of the shipped places are under a roof, and water
 * drawn across a stairwell is exactly the unexplained "背景的粒子" a player ends up complaining
 * about — so the field on the place decides it, not a list the renderer keeps (§77: a new place is
 * one entry, and the first thing a new place fails to appear in is a switch nobody edited).
 */
describe('rain belongs to a place that can see the sky (§25)', () => {
  const streaksPer = (environmentId: string, weather: 'rain' | 'storm'): number => {
    const h = harness({ content: DEFAULT_CONTENT, environmentId });
    const s = h.state() as GameStateView;
    const view = {
      ...s,
      nowMs: 40000,
      world: { ...s.world, weather, ambientGain: 0.6 },
    } as GameStateView;
    const canvas = createFakeCanvas();
    drawRain(canvas.ctx, view, VIEWPORT, false);
    return canvas.calls.filter((call) => call.name === 'lineTo').length;
  };

  it('draws water only where the place declares it can be seen', () => {
    const seen: string[] = [];
    const hidden: string[] = [];
    for (const environment of DEFAULT_CONTENT.environments) {
      const drawn = streaksPer(environment.id, 'rain');
      (environment.background.weatherVisible ? seen : hidden).push(environment.id);
      if (environment.background.weatherVisible) {
        expect(drawn, environment.id).toBeGreaterThan(20);
      } else {
        expect(drawn, environment.id).toBe(0);
      }
    }
    console.log(`RAIN visible=${seen.join(',')} | hidden=${hidden.join(',')}`);
    // Both families have to exist, or the claim above is one list proving nothing.
    expect(seen.length).toBeGreaterThan(1);
    expect(hidden.length).toBeGreaterThan(1);
  });

  it('leaves the indoor air alive anyway', () => {
    // Nothing in the room is the weather now, so the room must still be a room: dust hangs in the
    // light, and the storm outside is only felt as light and sound. Without this the claim above
    // could be satisfied by a renderer that simply stopped drawing.
    const indoors = DEFAULT_CONTENT.environments.find((e) => !e.background.weatherVisible);
    expect(indoors).toBeTruthy();
    const h = harness({ content: DEFAULT_CONTENT, environmentId: indoors!.id });
    const s = h.state() as GameStateView;
    const view = {
      ...s,
      nowMs: 40000,
      world: { ...s.world, weather: 'storm' as const, ambientGain: 0.7 },
    } as GameStateView;
    const canvas = createFakeCanvas();
    drawRain(canvas.ctx, view, VIEWPORT, false);
    expect(canvas.calls.filter((call) => call.name === 'lineTo').length).toBe(0);
    const dust = createFakeCanvas();
    drawDust(dust.ctx, view, VIEWPORT, false);
    expect(dust.calls.filter((call) => call.name === 'arc').length).toBeGreaterThan(8);
  });
});

/**
 * The frame `rainLines` hands out is what both painters draw: the canvas maps it through
 * `viewport.px`, the 3D layer through the camera. The pixel claims above exercise the same copy
 * end-to-end, so these two only pin the fields the 3D side alone reads — its axis is depth, and a
 * streak of the wrong slant or an alpha of the wrong band would never show up in the 2D pixels.
 */
describe('the frame the 3D layer reads (`rainLines`)', () => {
  const stateFor = (environmentId: string, weather: 'rain' | 'storm' | 'clear'): GameStateView => {
    const h = harness({ content: DEFAULT_CONTENT, environmentId });
    const s = h.state() as GameStateView;
    return {
      ...s,
      nowMs: 40000,
      world: { ...s.world, weather, ambientGain: 0.6 },
      smoke: { ...s.smoke, drift: { ...s.smoke.drift, x: 0.4 } },
    } as GameStateView;
  };

  it('answers null where the painted layer paints nothing at all', () => {
    expect(rainLines(stateFor('neon-street', 'clear'), 40, false)).toBeNull();
    const indoors = DEFAULT_CONTENT.environments.find((e) => !e.background.weatherVisible);
    expect(rainLines(stateFor(indoors!.id, 'rain'), 40, false)).toBeNull();
  });

  it('carries the slant, alpha and width the streaks are drawn in', () => {
    const frame = rainLines(stateFor('neon-street', 'rain'), 40, false);
    expect(frame).not.toBeNull();
    expect(frame!.lines.length).toBeGreaterThan(20);
    // drift.x 0.4 at the painter's ×2.2 is 0.88, and every line's own rise has to carry it.
    const slant = Math.max(-0.5, Math.min(0.5, 0.4 * 2.2));
    for (const line of frame!.lines) {
      expect(line.y2 - line.y1).toBeGreaterThan(0);
      expect(line.x2 - line.x1).toBeCloseTo(slant * (line.y2 - line.y1), 10);
    }
    expect(frame!.alpha).toBeCloseTo(0.16 + 0.6 * 0.16, 10);
    expect(frame!.widthUnits).toBeCloseTo(0.0016, 10);
    // Reduced motion dims the sheet to its measured floor, not to nothing.
    const calm = rainLines(stateFor('neon-street', 'rain'), 40, true);
    expect(calm!.alpha).toBeCloseTo(0.1, 10);
  });
});
