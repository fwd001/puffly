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
import { PACK_SIZE, drawPack } from '../props';
import { createViewport } from '../viewport';
import { createFakeCanvas } from './fakeCanvas';
import { harness } from '../../../game-core/src/__tests__/harness';

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
