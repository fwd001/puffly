/**
 * Ash system — SPEC.md §18.
 *
 * Grows, bends, becomes critical, and then either the player flicks it or gravity
 * takes it. Falling fragments are simulated here (not in a canned animation) so a
 * renderer on any platform draws the same fall (§79).
 */

import { clamp01, degToRad } from '@puffly/shared';
import { ASH, BURN, THRESHOLDS } from '../constants';
import { emit, record } from '../emit';
import { ashProducedGrams } from '../runtime';
import { isLit } from '../stateMachine';
import { SessionEventType } from '../types/events';
import { CIGARETTE_LENGTH, offset } from '../types/geometry';
import type { AshFragment } from '../types/state';
import { ashDustBurst } from './emissions';
import type { EngineRuntime } from '../runtime';

/** How long a settled fragment stays on screen before the renderer forgets it. */
const FRAGMENT_MEMORY_MS = 2200;

function makeStump(rt: EngineRuntime, shards: number, bend: number, grams: number): AshFragment {
  const { pose, ash } = rt.state.cigarette;
  // The column leaves the rod as the body it was: lying along the bend it had sagged into, and
  // about as long as it stood. S7's 「先从灰柱断裂」 is this frame, not the scatter after it.
  const origin = offset(pose.tip, ash.length * 0.62, pose.angleDeg + bend);
  return {
    id: rt.ids.next('ashf'),
    seed: rt.rng.int(1, 0x7ffffffe),
    origin,
    size: ASH.stumpThickness,
    length: ash.length,
    breaksAtMs: rt.state.nowMs + rt.rng.range(ASH.breakFuseMinMs, ASH.breakFuseMaxMs),
    shards,
    grams,
    rotation: degToRad(pose.angleDeg + bend),
    spin: rt.rng.range(-1.6, 1.6),
    vx: rt.rng.range(-0.012, 0.012) + rt.state.world.wind * 0.05,
    vy: rt.rng.range(-0.01, 0.02),
    settledAtMs: 0,
  };
}

/**
 * The piece comes apart where it currently is, carrying its own fall. A flake that broke into grains
 * at the rod again would be the old single frame with an extra step in front of it.
 */
function shatter(rt: EngineRuntime, stump: AshFragment): AshFragment[] {
  const grains: AshFragment[] = [];
  // The mass goes with the pieces rather than being counted twice: a stump that broke up carries
  // nothing afterwards, and a grain that lands in the tray is the only thing that adds to it.
  const perGrain = stump.shards > 0 ? stump.grams / stump.shards : 0;
  for (let i = 0; i < stump.shards; i++) {
    grains.push({
      id: rt.ids.next('ashf'),
      seed: rt.rng.int(1, 0x7ffffffe),
      origin: {
        x: stump.origin.x + rt.rng.range(-ASH.shardDrift, ASH.shardDrift),
        y: stump.origin.y + rt.rng.range(-ASH.shardDrift, ASH.shardDrift),
      },
      size: rt.rng.range(0.004, 0.012),
      length: 0,
      breaksAtMs: 0,
      shards: 0,
      grams: perGrain,
      rotation: rt.rng.range(-Math.PI, Math.PI),
      spin: rt.rng.range(-3, 3),
      vx: stump.vx + rt.rng.range(-0.008, 0.008),
      vy: stump.vy + rt.rng.range(0, 0.01),
      settledAtMs: 0,
    });
  }
  return grains;
}

export function dropAsh(
  rt: EngineRuntime,
  cause: 'flick' | 'natural' | 'event',
  announce = true,
): void {
  const ash = rt.state.cigarette.ash;
  const length = ash.length;
  if (length <= 0) return;

  // 拍板 ②: what falls is a body with a mass, and the mass is exactly the ash this stick has made and
  // has not yet let go. Taking the difference rather than a share of the length is what closes the
  // book: the rod cannot hand over more than it produced, and however the player flicks, the sum of
  // the drops plus what still stands is the one gram figure the content names.
  const grams = Math.max(
    0,
    ashProducedGrams(rt.cigarette, rt.state.cigarette.rodRemaining) - ash.droppedGrams,
  );

  const ratio = clamp01(length / Math.max(ash.maxLength, 0.0001));
  const count = Math.max(1, Math.round(ASH.fragmentsPerFlick * (0.5 + ratio)));
  ash.falling.push(makeStump(rt, count, ash.bend, grams));

  ash.length = 0;
  ash.ratio = 0;
  ash.bend = 0;
  ash.ready = false;
  ash.dropped += 1;
  ash.droppedGrams += grams;
  rt.progress.ashGrams = (rt.progress.ashGrams ?? 0) + grams;
  rt.ashCarry = 0;
  rt.progress.ashDropped += 1;

  emit(rt, {
    kind: 'burst',
    atMs: rt.state.nowMs,
    burst: ashDustBurst(rt, rt.state.cigarette.pose.tip, ratio),
  });
  if (announce) {
    record(rt, cause === 'flick' ? SessionEventType.ASH : SessionEventType.ASH_FALL, {
      cause,
      length: Math.round(length * 1000) / 1000,
      fragments: count,
      grams: Math.round(grams * 1000) / 1000,
    });
  }
}

/**
 * Whether the weather may take the column that is standing.
 *
 * A gust knocking the ash off is §22's flavour, and it stays available for as long as the rod has
 * another flickable column in it: what a rod can still turn into ash is its whole length times the
 * ash it yields per unit, times the fraction of it that has not burned, and the column a player is
 * nudged to flick is `maxLength × ashCriticalRatio`. Below that the standing column is the last one
 * the rod will ever make, so it stays standing. Without this the knock-offs are on the wall clock
 * while the ash is on the rod's, and a rod that burns for twelve minutes rather than three simply
 * meets too much weather per millimetre of ash — 磕灰 stops being reachable at all.
 */
export function weatherMayTakeAsh(rt: EngineRuntime): boolean {
  const { ash, rodRemaining } = rt.state.cigarette;
  const needed = ash.maxLength * THRESHOLDS.ashCriticalRatio;
  const stillToCome = CIGARETTE_LENGTH * BURN.ashYield * rodRemaining;
  return stillToCome >= needed;
}

/** The player flicked it. Returns false when there was nothing to flick. */
export function flickAsh(rt: EngineRuntime): boolean {
  const ash = rt.state.cigarette.ash;
  if (ash.length < ash.maxLength * THRESHOLDS.ashVisibleFraction) return false;
  dropAsh(rt, 'flick');
  return true;
}

function tickFragments(rt: EngineRuntime, dtMs: number): void {
  const ash = rt.state.cigarette.ash;
  if (ash.falling.length === 0) return;
  const dt = dtMs / 1000;
  const wind = rt.state.world.wind * ASH.gravityPerSecond * 0.1;

  for (const fragment of ash.falling) {
    if (fragment.settledAtMs > 0) continue;
    fragment.vy += ASH.gravityPerSecond * dt;
    fragment.vx += wind * dt;
    fragment.origin.x += fragment.vx * dt;
    fragment.origin.y += fragment.vy * dt;
    fragment.rotation += fragment.spin * dt;
    // The tray is wherever *this* frame's layout says it is: a wide window and a portrait phone put
    // it in different pixels (`setStageAspect` swaps `rt.layout`), and ash cannot be counted into a
    // tray the picture is not drawing under it. The fall has used the constant since §18; the mass
    // made that visible, because a number that lands in the wrong tray is a lie about the tray.
    const tray = rt.layout.ashtray;
    const inTray = fragment.origin.x > tray.x - 0.1;
    const floor = inTray ? tray.y + 0.02 : 0.96;
    if (fragment.origin.y >= floor) {
      fragment.origin.y = floor;
      fragment.vy = 0;
      fragment.vx *= 0.35;
      fragment.spin *= 0.2;
      fragment.settledAtMs = rt.state.nowMs;
      // 缸里累计: only what actually landed in the tray joins the tray's mass. Ash that fell short of
      // it is on the table, and the number on the tray would be lying if it counted that.
      if (inTray && fragment.grams > 0) {
        rt.state.ashtray.grams += fragment.grams;
        fragment.grams = 0;
      }
    }
  }

  // 再散开: the pieces whose fuse is up become the grains the record counted, and one that reached
  // the tray whole breaks there rather than resting as a flake on top of the mound.
  const breaking = ash.falling.filter(
    (fragment) =>
      fragment.shards > 0 && (fragment.settledAtMs > 0 || rt.state.nowMs >= fragment.breaksAtMs),
  );
  if (breaking.length > 0) {
    ash.falling = [
      ...ash.falling.filter((fragment) => !breaking.includes(fragment)),
      ...breaking.flatMap((stump) => shatter(rt, stump)),
    ];
  }

  ash.falling = ash.falling.filter(
    (fragment) =>
      fragment.settledAtMs === 0 || rt.state.nowMs - fragment.settledAtMs < FRAGMENT_MEMORY_MS,
  );
}

export function tickAsh(rt: EngineRuntime, dtMs: number): void {
  const cigarette = rt.state.cigarette;
  const ash = cigarette.ash;

  ash.length = Math.min(rt.ashCarry, ash.maxLength * 1.08);
  ash.ratio = ash.maxLength > 0 ? clamp01(ash.length / ash.maxLength) : 0;
  ash.bend = Math.pow(ash.ratio, ASH.bendExponent) * ASH.maxBendRad;

  const critical = ash.ratio >= THRESHOLDS.ashCriticalRatio;
  ash.ready = critical;

  // The ceiling, not a clock: a column lets go when there is more of it standing than this rod's ash
  // can hold. The 9 s patience timer this replaces was a second way to reach the same outcome, and it
  // fired before any gust could — which is how 磕灰 turned into the one gesture the room always did
  // for you (`ash-and-weather.test.ts` measured zero gusts across the eleven rods).
  if (isLit(cigarette.state) && ash.length >= ash.maxLength) dropAsh(rt, 'natural');

  tickFragments(rt, dtMs);
}
