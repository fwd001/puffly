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
import { drawRain, rainGeometry } from '../weather';
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
});
