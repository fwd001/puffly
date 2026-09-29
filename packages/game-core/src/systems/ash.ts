/**
 * Ash system — SPEC.md §18.
 *
 * Grows, bends, becomes critical, and then either the player flicks it or gravity
 * takes it. Falling fragments are simulated here (not in a canned animation) so a
 * renderer on any platform draws the same fall (§79).
 */

import { clamp01 } from '@puffly/shared';
import { ASH, LAYOUT, THRESHOLDS, TIMING } from '../constants';
import { emit, record } from '../emit';
import { isLit } from '../stateMachine';
import { SessionEventType } from '../types/events';
import { offset } from '../types/geometry';
import type { AshFragment } from '../types/state';
import { ashDustBurst } from './emissions';
import type { EngineRuntime } from '../runtime';

/** How long a settled fragment stays on screen before the renderer forgets it. */
const FRAGMENT_MEMORY_MS = 2200;

function makeFragments(rt: EngineRuntime, count: number, bend: number): AshFragment[] {
  const { pose, ash } = rt.state.cigarette;
  const wind = rt.state.world.wind;
  const fragments: AshFragment[] = [];
  for (let i = 0; i < count; i++) {
    const along = ash.length * rt.rng.range(0.35, 1);
    const origin = offset(pose.tip, along, pose.angleDeg + bend * rt.rng.range(0.4, 1));
    fragments.push({
      id: rt.ids.next('ashf'),
      seed: rt.rng.int(1, 0x7ffffffe),
      origin,
      size: rt.rng.range(0.004, 0.012),
      rotation: rt.rng.range(-Math.PI, Math.PI),
      spin: rt.rng.range(-3, 3),
      vx: rt.rng.range(-0.012, 0.012) + wind * 0.05,
      vy: rt.rng.range(-0.01, 0.02),
      settledAtMs: 0,
    });
  }
  return fragments;
}

export function dropAsh(
  rt: EngineRuntime,
  cause: 'flick' | 'natural' | 'event',
  announce = true,
): void {
  const ash = rt.state.cigarette.ash;
  const length = ash.length;
  if (length <= 0) return;

  const ratio = clamp01(length / Math.max(ash.maxLength, 0.0001));
  const count = Math.max(1, Math.round(ASH.fragmentsPerFlick * (0.5 + ratio)));
  ash.falling.push(...makeFragments(rt, count, ash.bend));

  ash.length = 0;
  ash.ratio = 0;
  ash.bend = 0;
  ash.ready = false;
  ash.dropped += 1;
  rt.ashCarry = 0;
  rt.timers.ashCriticalMs = 0;
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
    });
  }
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
    const floor = fragment.origin.x > LAYOUT.ashtray.x - 0.1 ? LAYOUT.ashtray.y + 0.02 : 0.96;
    if (fragment.origin.y >= floor) {
      fragment.origin.y = floor;
      fragment.vy = 0;
      fragment.vx *= 0.35;
      fragment.spin *= 0.2;
      fragment.settledAtMs = rt.state.nowMs;
    }
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

  if (critical && isLit(cigarette.state)) rt.timers.ashCriticalMs += dtMs;
  else if (!critical) rt.timers.ashCriticalMs = 0;

  const overdue = rt.timers.ashCriticalMs >= TIMING.ashPatienceMs;
  if (isLit(cigarette.state) && (ash.length >= ash.maxLength || overdue)) dropAsh(rt, 'natural');

  tickFragments(rt, dtMs);
}
