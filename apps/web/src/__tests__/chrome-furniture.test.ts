/**
 * The core keeps a clearance line for the shell's bottom furniture, and that furniture is measured
 * in pixels, here, in CSS. These two checks are the seam: the constant must equal what the button
 * actually paints, and the resize path must actually tell the core how tall the stage is.
 *
 * They live in the shell rather than in `stage.test.ts` because the pure layer may not read files
 * at all (SPEC.md §47) — and a rule nothing can check is a rule that quietly rots.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHROME_BAND_PX, CHROME_EDGE_PX } from '@puffly/game-core';

const PILL = readFileSync(new URL('../components/CtaPill.vue', import.meta.url), 'utf8');
const SHELL = readFileSync(new URL('../composables/usePuffly.ts', import.meta.url), 'utf8');

describe('the chrome the core clears is the chrome the shell draws', () => {
  it('matches the band the pill actually paints', () => {
    const bottom = Number(/bottom: calc\((\d+)px/.exec(PILL)?.[1]);
    const height = Number(/min-height: (\d+)px/.exec(PILL)?.[1]);
    expect(bottom, 'the offset under the pill').toBeGreaterThan(0);
    expect(height, 'the height of the pill').toBeGreaterThan(0);
    expect(CHROME_BAND_PX).toBe(bottom + height);
    // The pad is what stops a prop sitting flush against the shadow the button casts.
    expect(CHROME_EDGE_PX).toBeGreaterThan(CHROME_BAND_PX);
  });

  it('is handed the height by every resize, or the line stays decorative', () => {
    const calls = [...SHELL.matchAll(/setStageAspect\(([^)]*)\)/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) {
      expect(call[1], 'each call tells the engine how tall the stage is').toContain(
        'viewport.stage.height',
      );
    }
  });
});
