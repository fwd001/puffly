/**
 * The stage says what it is doing in machine values, not in words.
 *
 * `tests/smoke/touch-device.mjs` drives a real browser and needs to know which gesture the scene is
 * nudging and which stage of the break it is in. The only other carrier of that information is the
 * hint word over the object, which the three-tier copy table translates — so a browser check that
 * read the word would pass on one machine's language and fail on another's, which is the failure
 * this file exists to prevent. The mirrors below are the seam: the shell publishes what the core
 * already decided, and nothing in the checks has to guess from prose.
 *
 * What a source read can buy and no more: it proves the binding exists and names the field it reads.
 * It cannot prove the attribute reaches the DOM, and a wrong value inside `summary` still passes.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toCanvasFraction, toStagePoint } from '../composables/useInputAdapters';
import { shellSource } from './sourceProbe';

const APP = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');

/** The four facts the browser layer reads off the stage, and the summary field each one mirrors. */
const MIRRORS: Record<string, string> = {
  'data-cues': 'summary.cueChannel',
  'data-break': 'summary.clock',
  'data-phase': 'summary.phase',
  'data-affordance': 'summary.affordance',
  'data-aim': 'summary.aim',
  'data-stage-box': 'summary.stageBox',
  'data-prop-scale': 'summary.propScale',
};

describe('the stage mirrors the break instead of describing it', () => {
  it('binds every mirror to a field the shell already computed', () => {
    for (const [attribute, field] of Object.entries(MIRRORS)) {
      const binding = new RegExp(`:${attribute}="${field}"`);
      expect(APP, `the stage no longer publishes ${attribute}`).toMatch(binding);
    }
    // The affordance is the core's own union, not a word the shell invented on the way past.
    const summary = shellSource();
    expect(summary, 'affordance stopped coming from the state view').toMatch(
      /affordance: state\.ui\.affordance/,
    );
    // The hint word stays a *word*: nothing is allowed to read prose as a signal.
    expect(APP, 'the hint stopped being the player-only copy').toMatch(
      /class="hint"\s*\n\s*aria-hidden="true"/,
    );
  });

  it('aims through the same letterbox the pointer reads through', () => {
    // The mirror is only trustworthy if it is the pointer's own mapping run backwards. A stage box
    // with an offset and a canvas scaled by device-pixel ratio are both in play here, because those
    // are the two things a typed-in table of positions used to get wrong.
    const viewport = {
      cssWidth: 400,
      cssHeight: 800,
      stage: { x: 0, y: 60, width: 400, height: 680 },
    };
    const rect = { left: 12, top: 20, width: 600, height: 1200 } as DOMRect;
    for (const at of [
      { x: 0, y: 0 },
      { x: 0.26, y: 0.705 },
      { x: 1, y: 1 },
    ]) {
      const nx = at.x;
      const ny = at.y;
      const fraction = toCanvasFraction(nx, ny, viewport);
      const client = {
        x: rect.left + fraction.x * rect.width,
        y: rect.top + fraction.y * rect.height,
      };
      const back = toStagePoint(client.x, client.y, rect, viewport);
      expect(back.x, `x round trip at ${String(nx)}`).toBeCloseTo(nx, 6);
      expect(back.y, `y round trip at ${String(ny)}`).toBeCloseTo(ny, 6);
    }
    // And the letterbox is real: a stage point is *not* the same canvas fraction here, which is the
    // whole reason this mirror exists rather than a copy of the numbers.
    expect(toCanvasFraction(0, 0, viewport).y).not.toBeCloseTo(0, 6);
  });

  it('derives the phase from the cigarette, not from a branch in the markup', () => {
    const summary = shellSource();
    expect(summary, 'phase stopped being a reading of the state machine').toMatch(
      /phase: phaseOf\(state\.cigarette\.state\)/,
    );
  });
});
