/**
 * The pack on the table has to read as a wrapped box — the player's 「那个烟盒很抽象…画的就是更真实
 * 一点」, and the deck's 80% side (S7: 「纸面凹陷」, 「烟盒」 as a real object).
 *
 * Measured off the tones the object asks to be painted with, because at ~40 px a pack is not its
 * outline, it is its value range. A printed card has one mid tone and a band; a box has a hole in
 * the top, paper sticking out of it, and a sheet of cellophane over the whole thing throwing a
 * highlight at the eye. Those three are what this checks for, and none of them is a claim about
 * colour the object would then have to match.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { HIT } from '@puffly/game-core';
import { PACK_SIZE, drawPack } from '../props';
import { createViewport } from '../viewport';
import { createFakeCanvas } from './fakeCanvas';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const VIEW = createViewport({ width: 390, height: 844, dpr: 1 });

function packCalls(): {
  tones: string[];
  /** Every filled rectangle, with the style that was in force when it was asked for. */
  rects: { tone: string; width: number }[];
  gradients: { stops: { offset: number; color: string }[] }[];
} {
  const h = harness({ content: DEFAULT_CONTENT, environmentId: 'quiet-room' });
  const canvas = createFakeCanvas();
  drawPack(canvas.ctx, h.state(), VIEW);
  const tones = canvas.calls
    .filter((call) => call.name === 'set:fillStyle')
    .map((call) => String(call.args[0]));
  return {
    tones,
    ...(() => {
      const pairs: { tone: string; width: number }[] = [];
      let tone = '';
      for (const call of canvas.calls) {
        if (call.name === 'set:fillStyle') tone = String(call.args[0]);
        if (call.name === 'fillRect') pairs.push({ tone, width: Number(call.args[2]) });
      }
      return { rects: pairs };
    })(),
    // Only the gradients that were actually made current and filled. `createLinearGradient` on its
    // own proves nothing: an object can be built with the right stops and never painted, which is
    // exactly how this case first passed with the wrap deleted.
    ...(() => {
      let current: unknown = null;
      const painted: { stops: { offset: number; color: string }[] }[] = [];
      for (const call of canvas.calls) {
        if (call.name === 'set:fillStyle') current = call.args[0];
        if (call.name !== 'fill' && call.name !== 'fillRect') continue;
        const hit = canvas.gradients.find((gradient) => gradient === current);
        if (hit) painted.push({ stops: hit.stops });
      }
      return { gradients: painted };
    })(),
  };
}

/** Parse `rgb(...)` / `rgba(...)` into 0..1 relative luminance and its alpha. */
function read(tones: string[]): { L: number; a: number }[] {
  return tones.map((tone) => {
    const parts = (tone.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0', '0']).map(Number);
    const [r, g, b] = parts as [number, number, number, number];
    const alpha = parts.length > 3 ? parts[3]! : 1;
    return { L: (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255, a: alpha };
  });
}

describe('the pack is a wrapped box, not a printed card (S7)', () => {
  it('holds a hole: something on it is darker than any shading of its own body', () => {
    const { tones } = packCalls();
    const values = read(tones);
    // The contact shadow is near-black too, and it is not the claim: this is about a value that is
    // *painted in*, so it has to be an almost opaque black sitting on the object.
    const holes = values.filter((value) => value.L < 0.05 && value.a >= 0.9);
    const darkest = Math.min(...values.map((value) => value.L));
    console.log(
      `PACK tones=${String(tones.length)} darkest=${darkest.toFixed(3)} opaque blacks=${String(
        holes.length,
      )}`,
    );
    // The opening. A card has no value this low anywhere on it, because nothing on a card is *in*
    // anything.
    expect(holes.length).toBeGreaterThan(0);
  });

  it('carries a wrap: the light on it is a gradient that fades at both ends', () => {
    const { gradients } = packCalls();
    // A cellophane sheet does not have a bright *colour*; it has a highlight that starts nowhere,
    // peaks across the middle of the box and ends nowhere. A flat white rect could not be that,
    // and neither could the body's own shading — whose stops are all opaque.
    const sheens = gradients.filter((gradient) => {
      const alphas = gradient.stops.map((stop) => {
        const parts = (String(stop.color).match(/\d+(\.\d+)?/g) ?? []).map(Number);
        return String(stop.color).startsWith('rgba') ? Number(parts[parts.length - 1]) : 1;
      });
      return (
        alphas.length >= 4 &&
        alphas[0] === 0 &&
        alphas[alphas.length - 1] === 0 &&
        Math.max(...alphas) >= 0.25
      );
    });
    console.log(`PACK wrap sheens=${String(sheens.length)} of ${String(gradients.length)} painted`);
    expect(sheens.length).toBeGreaterThan(0);
  });

  it("has rods in two rows, the back one seen through the box's own shadow", () => {
    const { tones, rects } = packCalls();
    const distinct = new Set(tones).size;
    const narrow = rects.filter((rect) => rect.width < PACK_SIZE.width * VIEW.len(1) * 0.2);
    const translucent = narrow.filter((rect) => {
      const parts = (rect.tone.match(/\d+(\.\d+)?/g) ?? []).map(Number);
      const alpha = rect.tone.startsWith('rgba') ? Number(parts[parts.length - 1]) : 1;
      return alpha >= 0.7 && alpha <= 0.9;
    });
    console.log(
      `PACK distinct=${String(distinct)} rods=${String(narrow.length)} backRow=${String(
        translucent.length,
      )}`,
    );
    // Paper strips standing in the opening, at least two per rod: the front row carries the filter
    // ends and the row behind it is what says the box is deep rather than decorated.
    expect(narrow.length).toBeGreaterThanOrEqual(6);
    expect(distinct).toBeGreaterThanOrEqual(9);
    expect(translucent.length).toBe(3);
  });
});

/**
 * The pack is a control now (S14's 取烟), so two more things have to be true of the picture: the press
 * has to cover the object that is drawn, and a tap has to move something.
 */
interface Geo {
  /** The pack's own centre, in CSS px on the phone's stage. */
  y: number;
  tilt: number;
  /** The highest strip of paper standing in the opening. */
  top: number;
}

type View = ReturnType<typeof harness>['state'] extends () => infer S ? S : never;

function geometryOf(state: View): Geo {
  const canvas = createFakeCanvas();
  drawPack(canvas.ctx, state, VIEW);
  const tops = canvas.calls
    .filter((call) => call.name === 'fillRect')
    .map((call) => Number(call.args[1]));
  return {
    y: Number(canvas.calls.find((call) => call.name === 'translate')?.args[1] ?? 0),
    tilt: Number(canvas.calls.find((call) => call.name === 'rotate')?.args[0] ?? 0),
    top: Math.min(...tops),
  };
}

/**
 * The whole arc of one nudge: where the box rests, how far it travels after a tap, and where it
 * ends up once the impulse is spent.
 *
 * The tap is driven rather than the field written by hand — a number the picture reads and no input
 * ever sets is the half-wired object §37 exists for, and only this route proves the two ends meet.
 */
function packNudge(): { rest: Geo; peak: Geo; settled: Geo; steps: number } {
  const h = harness({ content: DEFAULT_CONTENT, environmentId: 'quiet-room' });
  const rest = geometryOf(h.state());
  lit(h);
  h.tap('pack');
  expect(h.state().pack.fidget, 'the tap left nothing for the picture to read').toBeGreaterThan(
    0.5,
  );
  let peak = rest;
  let travel = 0;
  let steps = 0;
  while (h.state().pack.fidget > 0 && steps < 200) {
    const at = geometryOf(h.state());
    if (rest.y - at.y > travel) {
      travel = rest.y - at.y;
      peak = at;
    }
    h.flush();
    steps += 1;
  }
  return { rest, peak, settled: geometryOf(h.state()), steps };
}

describe('the pack you press and the pack you see are the same box (§37, §60)', () => {
  const halfDiagonal = Math.hypot(PACK_SIZE.width, PACK_SIZE.height) / 2;

  it('the hit radius covers the drawn silhouette and stops there', () => {
    console.log(
      `PACK HIT=${String(HIT.pack)} halfDiagonal=${halfDiagonal.toFixed(4)} ` +
        `box=${PACK_SIZE.width}×${PACK_SIZE.height}`,
    );
    // Under the half-diagonal and the corners of the box answer to nothing — the pack is drawn
    // centred on its own anchor, so this is the exact radius its outline needs.
    expect(HIT.pack).toBeGreaterThanOrEqual(halfDiagonal);
    // Over the rod's own reach and the box starts taking taps meant for the cigarette lying next to
    // it: `pack-tap.test.ts` shows the two verbs agree only while the rod is still on the table.
    expect(HIT.pack).toBeLessThan(HIT.body);
  });

  it('a tapped pack lifts, leans and shakes its contents loose — then settles', () => {
    const { rest, peak, settled, steps } = packNudge();
    console.log(
      `PACK NUDGE lift=${(rest.y - peak.y).toFixed(2)}px tilt=${(peak.tilt - rest.tilt).toFixed(4)} ` +
        `rods=${(rest.top - peak.top).toFixed(2)}px over ${String(steps)} frames`,
    );
    // The amplitude is the claim, not the direction: a field that is read but never moves the box
    // would pass a "not equal" test at some phase of the wave.
    expect(rest.y - peak.y, 'the pack did not lift').toBeGreaterThanOrEqual(2);
    expect(Math.abs(peak.tilt - rest.tilt), 'the pack did not lean').toBeGreaterThanOrEqual(0.03);
    expect(rest.top - peak.top, 'the rods inside did not move').toBeGreaterThanOrEqual(2);
    // And it is a happening: the box comes back to the pixel it started on, so a tap cannot leave
    // the furniture permanently out of place.
    expect(settled).toEqual(rest);
    expect(steps, 'the nudge never ended').toBeLessThan(200);
  });
});
