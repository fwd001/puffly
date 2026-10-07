/**
 * The hand has to look like a hand — SPEC.md §59, §21.
 *
 * The report was unspecific and mostly right: 「背景的抖动 我不知道是什么算法 就感觉很奇怪 看不懂」.
 * Measured on a real rendered frame, the largest single-frame change in the whole picture sits *on
 * the rod* — a 137/765 jump at the cherry's own pixel, and the same 137 with the smoke switched
 * off entirely. So it is not the smoke shivering; it is the resting lean. Two sines at 1.8 Hz and
 * 4.3 Hz beat against each other with an amplitude of `0.8 + wind*2.2` degrees, which means a
 * bright white 148 px bar slides a fraction of a pixel every frame for the whole break, driven by
 * the weather. Motion with no cause the player can look at is what "看不懂是什么算法" describes.
 *
 * One claim in the report did not survive measurement and is deliberately not encoded here: that
 * the shiver *grows* over a break. The lean's excursion at 20 s and at 100-120 s came out 1.761
 * and 1.793 degrees — a ratio of 1.02. What is bad is bad from the first second; the sense of
 * arrival is the cherry getting bright, not the wind climbing.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { updateWobble, type CigarettePose } from '../systems/pose';
import { harness, lit } from './harness';

const STEP_MS = 1000 / 60;

const blankPose = (): CigarettePose => ({
  pivot: { x: 0.5, y: 0.5 },
  tip: { x: 0.5, y: 0.5 },
  ashTip: { x: 0.5, y: 0.5 },
  angleDeg: 0,
  wobbleDeg: 0,
  rodLength: 0.34,
  ashLength: 0,
  length: 0.34,
  thickness: 0.016,
  visible: true,
  inTray: false,
  dragged: false,
});

const peakToPeak = (values: number[]): number => Math.max(...values) - Math.min(...values);

const biggestStep = (values: number[]): number => {
  let step = 0;
  for (let i = 1; i < values.length; i++) {
    step = Math.max(step, Math.abs(values[i]! - values[i - 1]!));
  }
  return step;
};

describe('the resting lean is a hand, not a shiver (§59)', () => {
  it('turns slowly enough that one swing reads as one movement', () => {
    const pose = blankPose();
    const series: number[] = [];
    for (let frame = 0; frame < 60 * 60; frame++) {
      updateWobble(pose, frame * STEP_MS, 1);
      series.push(pose.wobbleDeg);
    }
    // Bounded by the amplitude it is handed, and slow enough that a bright edge does not crawl.
    // The shipped pair of sines measures 0.0188 deg per frame at amplitude 1: at the far end of a
    // 148 px rod that is a new sub-pixel of edge coverage every frame, forever.
    expect(peakToPeak(series)).toBeLessThanOrEqual(2.05);
    expect(biggestStep(series)).toBeLessThan(0.01);
  });

  it('never leans far enough to read as the picture moving', () => {
    const h = harness({ content: DEFAULT_CONTENT, cigaretteId: 'classic' });
    lit(h);
    const angles: number[] = [];
    for (let frame = 0; frame < 60 * 180; frame++) {
      h.run(STEP_MS);
      angles.push(h.state().cigarette.pose.angleDeg);
    }
    const whole = peakToPeak(angles);
    console.log(`LEAN whole=${whole.toFixed(3)} deg over 180 s`);
    // 1.761 measured on the shipped wiring. Half a degree is about what a still hand drifts at
    // this radius without the picture starting to swim.
    expect(whole).toBeLessThanOrEqual(1.2);
  });

  it('is not driven by the weather', () => {
    const leanOf = (environmentId: string): number => {
      const h = harness({ content: DEFAULT_CONTENT, cigaretteId: 'classic', environmentId });
      lit(h);
      const angles: number[] = [];
      for (let frame = 0; frame < 60 * 120; frame++) {
        h.run(STEP_MS);
        angles.push(h.state().cigarette.pose.angleDeg);
      }
      return peakToPeak(angles);
    };
    const calm = leanOf('quiet-room');
    const gusty = leanOf('night-city');
    console.log(`LEAN calm=${calm.toFixed(3)} gusty=${gusty.toFixed(3)}`);
    // Wind bends smoke (§25). It does not shake a held cigarette: whatever the room is doing, the
    // hand's own lean is the same size.
    expect(gusty).toBeLessThan(Math.max(calm * 1.35, 0.05));
  });
});
