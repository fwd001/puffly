/**
 * What the hand is told — S6's three named rows: 点火 短促, 吸入 渐强, 烟灰 细碎, plus the two the
 * timeline (S7) adds for the end of a rod: 掐灭's 触觉重击 and a stub landing in the tray.
 *
 * A pure module for the same reason `archiveModel.ts` is one: apps/web has no component harness, and
 * the claim here is about *shapes*, which is arithmetic — three events that are supposed to feel
 * different have to come out different, and the 渐强 one has to come out longer as the draw gets
 * deeper, not merely louder.
 *
 * The honest limit: `navigator.vibrate()` takes durations and nothing else. There is no amplitude in
 * the Web Vibration API, so "how hard" is written as how long each pulse is and how many of them
 * arrive. That is what the deck's 触觉 0.7 can mean in a browser; a native shell with a real
 * intensity channel would read the same number and map it to amplitude instead.
 *
 * The one rule that makes that writable as a test: **every contact gets longer as the slider rises,
 * every gap gets shorter.** A hard 细碎 is therefore tighter rather than slower, and a grain pattern
 * can occupy less total time while feeling sharper.
 */

import { SessionEventType } from '@puffly/game-core';

/** The five shapes. Only the first three are S6's rows; the last two are S7's ending beats. */
export type HapticShape = 'spark' | 'swell' | 'grit' | 'thud' | 'settle';

/**
 * Which discrete happening says which shape — a table rather than a chain of branches in the shell,
 * because a chain can only be checked by reading the shell, and this can be checked by asking it.
 *
 * `swell` is deliberately absent: the 渐强 is a climb across one draw and arrives from the frame
 * loop (`swellRung`), not from an event. Mapping it here too would fire it on the release as well,
 * which is a fifth pulse on a four-step crescendo.
 */
export function shapeForEvent(type: string): HapticShape | null {
  switch (type) {
    case SessionEventType.LIGHT:
      return 'spark';
    case SessionEventType.ASH:
    case SessionEventType.ASH_FALL:
      // The flick and the column giving way on its own are the same thing to the hand. The collapse
      // used to be silent, which made it something that happened to the rod.
      return 'grit';
    case SessionEventType.EXTINGUISH:
      return 'thud';
    case SessionEventType.DISCARD:
      return 'settle';
    default:
      return null;
  }
}

/** How deep into the draw the swell is allowed to have climbed. Four steps, so a tremor cannot spam. */
export const SWELL_RUNGS = 4;

/** A vibration of at least one millisecond, or it is not a pulse. */
const round = (value: number): number => Math.max(1, Math.round(value));

/**
 * Which step of the draw a given intensity is on. The caller fires only when this number *rises*,
 * which is what makes 渐强 one gesture rather than a motor.
 */
export const swellRung = (intensity: number): number => {
  if (!(intensity > 0)) return 0;
  return Math.min(SWELL_RUNGS, Math.floor(intensity * SWELL_RUNGS) + 1);
};

/**
 * One shape, one strength (0..1), and the one number that shape scales with: how full the draw is
 * for `swell`, how tall the ash column is for `grit`. `null` means send nothing.
 */
export function hapticPattern(shape: HapticShape, strength: number, level = 1): number[] | null {
  const s = Math.min(1, Math.max(0, Number.isFinite(strength) ? strength : 0));
  if (s <= 0) return null;
  const l = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));

  switch (shape) {
    case 'spark':
      // 短促: one tick, and a light one. The wheel and the catch are heard, not felt.
      return [round(10 + 16 * s)];
    case 'swell':
      // 渐强: the pulse lengthens with the draw. Rung 1 is a brush; rung 4 is a hold.
      return [round(5 + 30 * s * Math.max(0.25, l))];
    case 'grit': {
      // 细碎: four to six grains, the deck's own count, tighter and more distinct the harder it is.
      const pulses = 4 + Math.round(2 * l);
      const on = round(3 + 8 * s);
      const gap = round(30 - 14 * s);
      const pattern: number[] = [];
      for (let i = 0; i < pulses; i += 1) {
        pattern.push(on);
        // No trailing gap: the pattern ends when the last grain lands.
        if (i < pulses - 1) pattern.push(gap);
      }
      return pattern;
    }
    case 'thud':
      // 掐灭 触觉重击 (S7): the one long press, because this is the end of the rod.
      return [round(40 + 45 * s)];
    case 'settle':
      // A stub dropped in the tray: two contacts, the second one further away.
      return [round(12 + 14 * s), round(34 - 10 * s), round(8 + 10 * s)];
  }
}
