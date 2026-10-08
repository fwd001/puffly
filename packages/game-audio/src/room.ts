/**
 * A room behind the cues — the deck's 「混响 关」 (S6), 「混响尾巴 ≤ 0.4s」 (S20) and
 * 「低通骤降 + 混响拉长」 (the last of a draw).
 *
 * Why a comb pair and not a convolution: a `ConvolverNode` fed by a generated impulse response would
 * be the better-sounding room, and the deck's own header says 全部为程序化合成音（无采样素材依赖）—
 * a response *file* is a sample, and a generated one is a buffer the size of the room that has to be
 * refilled every time the room changes. Two feedback delays are made of the nodes this seam already
 * allows, and — the reason the shape is checkable rather than hopeful — their decay is arithmetic:
 * energy reaches −60 dB at `tail = delay · ln(0.001) / ln(feedback)`, so the 0.4 s ceiling can be
 * recomputed from the authored constants by a test.
 *
 * It is a send: the cue bus feeds it once, the wet level is the player's setting, and a runtime
 * without `createDelay` gets `null` and plays dry (§63 — a missing node type costs a room, never a
 * game).
 */

import type { AudioContextLike, AudioGainLike, AudioNodeLike } from './web-audio';

/** Two spacings in a ~1.46 ratio, so their resonances do not stack into a single pitch. */
const COMB_SEC: readonly number[] = [0.061, 0.089];
/** −60 dB, the textbook definition of a reverb tail. */
const DECAY_TO = 0.001;
/** The room's own top: the deck caps the tail at 0.4 s, and two combs sum, so each sits under it. */
export const TAIL_BASE_SEC = 0.34;
/** 混响拉长: how much bigger the room opens for the one event that asked for it. */
export const TAIL_STRETCH = 1.8;
/**
 * The deck's own ceiling on this whole layer — 「混响尾巴 ≤ 0.4s」. It binds the stretched room too:
 * 拉长 is a request to open the room for one event, not a licence to break the line above it.
 */
export const TAIL_CEILING_SEC = 0.4;
/** The send's level when the player turned the room on: a room you hear, never a second event. */
export const WET_BASE = 0.15;
/** Above about 0.3 a short click arrives nearly as loud as it was made, which is not a room. */
export const WET_CEILING = 0.3;
/** How long the stretched room holds before it settles back. */
const STRETCH_HOLD_SEC = 0.22;
const STRETCH_SETTLE_TC = 0.12;
/** How fast the level itself changes, so flipping the setting cannot click. */
const WET_TC = 0.05;
/** High frequencies die first in a room, which is what makes it a room and not an echo. */
const DAMPING_HZ = 2400;

/** Where the room's energy has gone −60 dB, given one comb's spacing and its feedback. */
export const tailSeconds = (delaySec: number, feedback: number): number => {
  if (delaySec <= 0 || feedback <= 0 || feedback >= 1) return 0;
  return (delaySec * Math.log(DECAY_TO)) / Math.log(feedback);
};

/** The feedback that puts one comb's tail at `tailSec`. */
export const feedbackFor = (delaySec: number, tailSec: number): number => {
  if (delaySec <= 0 || tailSec <= 0) return 0;
  return Math.exp((Math.log(DECAY_TO) * delaySec) / tailSec);
};

export interface RoomSend {
  /** Where the caller patches the dry signal in. */
  readonly input: AudioGainLike;
  /** 0 for a dry world. The player's setting decides this; nothing else touches it. */
  setWet(amount: number): void;
  wet(): number;
  /** How long the room holds a sound right now, in seconds, from the live params. */
  tail(): number;
  /** 混响拉长: open the room for one event, then let it close again on the audio clock. */
  stretch(atSec: number): void;
  dispose(): void;
}

export function createRoomSend(
  context: AudioContextLike,
  out: AudioNodeLike,
  name: string,
): RoomSend | null {
  const makeDelay = context.createDelay;
  if (typeof makeDelay !== 'function') return null;

  const tagged = <T extends AudioNodeLike>(node: T, suffix: string): T => {
    node.name = `${name}:${suffix}`;
    return node;
  };

  const input = tagged(context.createGain(), 'in');
  const wet = tagged(context.createGain(), 'wet');
  wet.gain.value = 0;
  wet.connect(out);

  const combs = COMB_SEC.map((spacing, index) => {
    const delay = tagged(makeDelay.call(context), `comb${String(index)}.delay`);
    delay.delayTime.value = spacing;
    const damping = tagged(context.createBiquadFilter(), `comb${String(index)}.damp`);
    damping.type = 'lowpass';
    damping.frequency.value = DAMPING_HZ;
    damping.Q.value = 0.5;
    const feedback = tagged(context.createGain(), `comb${String(index)}.fb`);
    feedback.gain.value = feedbackFor(spacing, TAIL_BASE_SEC);

    input.connect(delay);
    delay.connect(damping);
    damping.connect(feedback);
    feedback.connect(delay);
    damping.connect(wet);
    return { spacing, delay, damping, feedback };
  });

  let level = 0;

  return {
    input,
    setWet: (amount: number): void => {
      level = Math.max(0, Math.min(WET_CEILING, amount));
      wet.gain.setTargetAtTime(level, context.currentTime, WET_TC);
    },
    wet: () => level,
    tail: (): number => {
      // The longest of the two combs is what the ear keeps after the sound itself has gone.
      let longest = 0;
      for (const comb of combs) {
        longest = Math.max(
          longest,
          tailSeconds(comb.delay.delayTime.value, comb.feedback.gain.value),
        );
      }
      return longest;
    },
    stretch: (atSec: number): void => {
      for (const comb of combs) {
        // A bigger room is a longer first reflection. Held at the base feedback, though, that factor
        // moves the −60 dB point with it: 0.34 × 1.8 = 0.61 s, past the ceiling the deck writes two
        // lines above the 拉长 request. So the room opens *and* drains faster, which pushes the tail
        // right up to 0.4 and not one millisecond past it. Both params hand back on the audio clock.
        const opened = comb.spacing * TAIL_STRETCH;
        comb.delay.delayTime.setValueAtTime(opened, atSec);
        comb.feedback.gain.setValueAtTime(feedbackFor(opened, TAIL_CEILING_SEC), atSec);
        comb.delay.delayTime.setTargetAtTime(
          comb.spacing,
          atSec + STRETCH_HOLD_SEC,
          STRETCH_SETTLE_TC,
        );
        comb.feedback.gain.setTargetAtTime(
          feedbackFor(comb.spacing, TAIL_BASE_SEC),
          atSec + STRETCH_HOLD_SEC,
          STRETCH_SETTLE_TC,
        );
      }
    },
    dispose: (): void => {
      for (const comb of combs) {
        comb.delay.disconnect();
        comb.damping.disconnect();
        comb.feedback.disconnect();
      }
      input.disconnect();
      wet.disconnect();
    },
  };
}
