/**
 * The cherry's halo — SPEC.md S7 卡通: 「余烬带一层柔和辉光扩散，不完全物理，偏向『看得见热』」, and the
 * 屏息 row's 「余烬回暗」.
 *
 * The picture used to draw this halo at 0.55 of the radius the simulation authored, at every setting.
 * That is not the 写实 end of the deck's split (the authored number *is* the physics) and it is not the
 * cartoon end either (the deck asks that one for *more* spread, not less): it was a third thing the
 * design never offered, and the widget's collapsed state — S18 keeps 「只保留余烬辉光与烟羽」 — was the
 * place that paid for it. So the authored radius is now the floor and the cartoon dial reaches past it,
 * with the mid stop walking outward so a wider halo is a gentler one rather than a bigger disc.
 *
 * Measured off the gradient the object asks for, at the three positions of the dial rather than at the
 * one the content ships with, because the claim is about a direction.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import type { GameStateView } from '@puffly/game-core';
import { drawCigarette } from '../props';
import { createViewport } from '../viewport';
import { cartoonScale } from '../renderer';
import { createFakeCanvas } from './fakeCanvas';
import { harness, lit } from '../../../game-core/src/__tests__/harness';

const VIEW = createViewport({ width: 390, height: 844, dpr: 1 });

interface Glow {
  /** The radius it asked for, in CSS px on the phone's stage. */
  radius: number;
  /** Where the middle of the falloff sits, as a share of that radius. */
  mid: number;
  /** What the simulation authored for this same frame, in the same px. */
  authored: number;
}

/** The cherry's halo from one real frame, or `null` when the cherry is not drawn at all. */
function glowOf(state: GameStateView, cartoon: number): Glow | null {
  const canvas = createFakeCanvas();
  drawCigarette(canvas.ctx, state, VIEW, 'normal', cartoon);
  // The gradients come back out of the fake in creation order, so the radial one is found by walking
  // the calls: `drawCigarette` asks for exactly one, and every other fill on the rod is linear.
  let radialAt = -1;
  let radialCall: number[] = [];
  let created = 0;
  for (const call of canvas.calls) {
    if (call.name !== 'createLinearGradient' && call.name !== 'createRadialGradient') continue;
    if (call.name === 'createRadialGradient' && radialAt < 0) {
      radialAt = created;
      radialCall = call.args.map(Number);
    }
    created += 1;
  }
  const stops = canvas.gradients[radialAt]?.stops;
  if (radialAt < 0 || stops === undefined || stops.length !== 3) return null;
  return {
    // `createRadialGradient(x0, y0, r0, x1, y1, r1)` — the sixth argument is the outer ring.
    radius: Number(radialCall[5] ?? 0),
    mid: Number(stops[1]?.offset ?? 0),
    authored: VIEW.len(state.cigarette.ember.glowRadius),
  };
}

/** A rod at the brightest the breath can make it, and the same rod on its way out. */
function peakAndDeath(): { peak: GameStateView; dying: GameStateView[] } {
  const h = harness({ content: DEFAULT_CONTENT, cigaretteId: 'classic' });
  lit(h);
  h.press('cigarette');
  h.run(1200);
  const peak = JSON.parse(JSON.stringify(h.state())) as GameStateView;
  h.release('cigarette');
  h.tap('ashtray');
  h.until(() => !h.state().cigarette.ember.lit, 4000);
  const dying: GameStateView[] = [];
  for (let frame = 0; frame < 90; frame++) {
    dying.push(JSON.parse(JSON.stringify(h.state())) as GameStateView);
    // `flush`, not `run(16)`: one step is 17 ms, so a 16 ms request is a no-op and the whole walk
    // would sample the same frozen frame ninety times.
    h.flush();
  }
  return { peak, dying };
}

describe('the halo is the cartoon side of the deck’s split (S7)', () => {
  const { peak, dying } = peakAndDeath();

  it('the 写实 end draws the radius the simulation authored, not a fraction of it', () => {
    const glow = glowOf(peak, 0);
    expect(glow, 'a lit cherry drew no halo at all').not.toBeNull();
    console.log(
      `GLOW authored=${String(Math.round(glow?.authored ?? 0))}px physical=${String(
        Math.round(glow?.radius ?? 0),
      )}px`,
    );
    // ≥ the authored number: the floor is the physics. The slack is the flare, which the same frame
    // is allowed to add on top and which the 写实 end must not be punished for.
    expect(glow?.radius).toBeGreaterThanOrEqual(glow?.authored ?? 0);
    expect(glow?.radius).toBeLessThan((glow?.authored ?? 0) * 1.15);
  });

  it('and the cartoon end spreads it, while the falloff walks outward', () => {
    const physical = glowOf(peak, 0);
    const shipped = glowOf(peak, cartoonScale(0.8));
    const cartoon = glowOf(peak, 2);
    console.log(
      `GLOW spread physical=${String(Math.round(physical?.radius ?? 0))}px ` +
        `shipped=${String(Math.round(shipped?.radius ?? 0))}px cartoon=${String(
          Math.round(cartoon?.radius ?? 0),
        )}px mid=${(physical?.mid ?? 0).toFixed(2)}→${(cartoon?.mid ?? 0).toFixed(2)}`,
    );
    expect(cartoon?.radius).toBeGreaterThan((physical?.radius ?? 0) * 1.5);
    expect(shipped?.radius).toBeGreaterThan((physical?.radius ?? 0) * 1.1);
    // Wider *and* gentler: the same light held out to a larger radius is what 「柔和」 reads as, and a
    // mid stop that stayed put would only be a bigger disc.
    expect(cartoon?.mid).toBeGreaterThan(physical?.mid ?? 0);
  });

  it('the dying cherry goes back in, it does not bloom on the way out (S7: 余烬回暗)', () => {
    const seen: number[] = [];
    for (const frame of dying) {
      const glow = glowOf(frame, 1);
      if (glow) seen.push(glow.radius);
    }
    const first = seen[0] ?? 0;
    const last = seen[seen.length - 1] ?? 0;
    console.log(
      `GLOW death frames=${String(seen.length)} first=${String(Math.round(first))}px last=${String(
        Math.round(last),
      )}px peak=${String(Math.round(peakGlowRadius(peak)))}px`,
    );
    expect(seen.length, 'the death never drew a halo to measure').toBeGreaterThan(3);
    expect(last).toBeLessThan(first);
    // Smaller than the brightest the breath ever made it, in the same units.
    expect(first).toBeLessThan(peakGlowRadius(peak));
    // …and by the end it is near the *floor* of what the simulation can author, not merely smaller
    // than where it started. This is the half that tells 回暗 from a draw that simply stopped: the
    // radius also falls when it tracks nothing but the player's grip, and a cherry cooling to its
    // baseline is the deck's sentence. Measured: the last frame sits at 0.26 of the peak's halo, and
    // a glow keyed on the grip alone ends at 0.81 of it.
    expect(last).toBeLessThanOrEqual(peakGlowRadius(peak) * 0.5);
  });

  it('the dial the renderer holds is the one the props get', () => {
    // A source read, and only what one can buy: that the one production call site passes the frame's
    // own 写实度 through rather than letting the props guess. That the number then moves the picture is
    // judged above.
    const renderer = readFileSync(new URL('../renderer.ts', import.meta.url), 'utf8');
    const call = /drawCigarette\([^;]*\);/.exec(renderer);
    expect(call, 'the renderer no longer draws the rod').not.toBeNull();
    expect(call?.[0]).toContain('cartoon');
  });
});

function peakGlowRadius(peak: GameStateView): number {
  const glow = glowOf(peak, 1);
  return glow?.radius ?? 0;
}
