/**
 * Lighting is a motion, not a timer — SPEC.md §15.
 *
 * The cherry used to catch on `ignitionMs` alone, so the rod could be held out in front of the
 * player, fully in view, and come alight around a flame it was nowhere near. These three claims are
 * the sentence: the end goes to the fire, the fire is what takes hold, and afterwards the rod is
 * back where it was.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { stageDistance } from '../stage';
import { flamePoint } from '../systems/pose';
import { harness } from './harness';

const held = (h: ReturnType<typeof harness>) => h.state().cigarette.pose;

describe('the rod goes to the flame and comes back (§15)', () => {
  it('arrives at the fire rather than merely waiting', () => {
    const h = harness({ content: DEFAULT_CONTENT, cigaretteId: 'classic' });
    h.tap('cigarette');
    h.tap('lighter');
    h.run(600);
    const pose = held(h);
    const miss = stageDistance(pose.tip, flamePoint(h.state().stage.layout), 390 / 844);
    expect(pose.atFlame, `the end stopped ${miss.toFixed(3)} short`).toBeGreaterThanOrEqual(0.9);
    // The claim is about the picture, so it needs a pixel number: on a 390-wide phone the flame is
    // ~26 px across, and this is the distance from its centre.
    expect(miss * 844).toBeLessThan(20);
  });

  it('will not catch while the end is carried away from the fire', () => {
    const h = harness({ content: DEFAULT_CONTENT, cigaretteId: 'classic' });
    h.tap('cigarette');
    h.tap('lighter');
    h.run(600);
    expect(held(h).atFlame).toBeGreaterThan(0.9);

    // Grab the rod and carry its burning end out of the flame. The lighter is still struck — a tap
    // holds it — but five times the ignition window goes by with nothing catching.
    const body = h.state().anchors.body;
    h.pointerDown(body.x, body.y);
    h.dragTo(0.92, 0.12);
    h.run(4000);
    expect(h.state().lighter.flame, 'the lighter let go on its own').toBeGreaterThan(0.9);
    expect(held(h).atFlame).toBeLessThan(0.2);
    // The state is the claim. `ember.lit` is not: `tickEmber` lights the cherry from brightness
    // alone, so a rod in the LIGHTING state glows whether or not the fire ever took hold.
    expect(h.state().cigarette.state).toBe('LIGHTING');

    // Let go and the same struck flame lights it, because the end is back where the fire is.
    h.pointerUp(0.92, 0.12);
    h.until(() => h.state().cigarette.state === 'BURNING', 4000);
    expect(h.state().cigarette.ember.lit).toBe(true);
  });

  it('comes back to the hand once it has caught', () => {
    const h = harness({ content: DEFAULT_CONTENT, cigaretteId: 'classic' });
    h.tap('cigarette');
    h.tap('lighter');
    h.until(() => h.state().cigarette.state === 'BURNING', 4000);
    h.run(900);
    const pose = held(h);
    const layout = h.state().stage.layout;
    expect(pose.atFlame).toBe(0);
    // Reaching across turns the rod ~155°; the way back has to end at the held angle, or the break
    // goes on being smoked pointing at the lighter.
    expect(Math.abs(pose.angleDeg - layout.heldDeg)).toBeLessThan(2);
  });
});
