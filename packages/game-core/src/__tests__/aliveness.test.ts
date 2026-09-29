import { describe, expect, it } from 'vitest';
import { STEP_MS, SessionEventType, type Burst, type BurstKind } from '@puffly/game-core';
import { FIXTURE } from './fixture';
import { harness, lit, sessionTypes, type Harness } from './harness';

const burstsOf = (h: Harness, kind: BurstKind): Burst[] =>
  h.bursts
    .flatMap((event) => (event.kind === 'burst' ? [event.burst] : []))
    .filter((burst) => burst.kind === kind);

const lastOf = (items: Burst[]): Burst | undefined => items[items.length - 1];

const WORLD_TYPES: readonly string[] = [
  SessionEventType.WIND,
  SessionEventType.LIGHT_CHANGE,
  SessionEventType.SHADOW_CHANGE,
  SessionEventType.AMBIENT_EVENT,
  SessionEventType.ENVIRONMENT_NOISE,
  SessionEventType.SMOKE_SWIRL,
  SessionEventType.ASH_FALL,
  SessionEventType.EMBER_FLARE,
];

describe('a world that is alive (§21, §22)', () => {
  it('fires several different kinds of event during one long burn', () => {
    const h = harness();
    lit(h);
    h.run(60_000);
    const types = new Set(
      h.sessionEvents
        .filter((event) => WORLD_TYPES.includes(event.type))
        .map((event) => event.type),
    );
    expect(types.size).toBeGreaterThanOrEqual(3);
  });

  it('never runs events on a fixed period (§81 (8))', () => {
    const h = harness();
    lit(h);
    h.run(90_000);
    const at = h.sessionEvents
      .filter(
        (event) => event.type !== SessionEventType.PUFF && event.type !== SessionEventType.ASH,
      )
      .map((event) => event.timestamp);
    const gaps = at.slice(1).map((value, index) => Math.round(value - (at[index] ?? value)));
    expect(gaps.length).toBeGreaterThan(4);
    // A period would show up as one repeated gap; a sampled envelope spreads widely.
    const distinct = new Set(gaps);
    expect(distinct.size).toBeGreaterThanOrEqual(Math.ceil(gaps.length / 2));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(1000);
  });

  it('only pulls events from the pools it was given (§23, §77)', () => {
    const h = harness({ content: FIXTURE });
    lit(h);
    h.run(120_000);
    const seen = new Set(h.sessionEvents.map((event) => event.type));
    // The fixture room never pools rain, so no rain may appear.
    expect(seen.has(SessionEventType.RAIN)).toBe(false);
  });

  it('wind visibly moves the smoke column (§6)', () => {
    const h = harness();
    lit(h);
    const still = h.state().smoke.drift.x;
    h.run(2000);
    const moved = h.state().smoke.drift.x;
    expect(Math.abs(moved - still)).toBeGreaterThan(0);
  });
});

describe('smoke that never repeats (§16)', () => {
  /** A 9s rod, so six identical holds all happen while it is still burning. */
  const puffs = (seed: number): Burst[] => {
    const h = harness({ seed, cigaretteId: 'test-long' });
    lit(h);
    for (let i = 0; i < 6; i++) {
      h.press('cigarette');
      h.run(400);
      h.release('cigarette');
      h.run(300);
    }
    return burstsOf(h, 'exhale');
  };

  it('produces six different exhales from six identical holds', () => {
    const bursts = puffs(11);
    expect(bursts.length).toBe(6);
    const signatures = new Set(
      bursts.map((burst) =>
        [
          burst.seed,
          burst.count,
          burst.directionDeg.toFixed(4),
          burst.radius.min.toFixed(6),
          burst.lifeMs.max.toFixed(4),
        ].join('|'),
      ),
    );
    expect(signatures.size).toBe(bursts.length);
  });

  it('varies direction, speed, size, life and turbulence — not just one of them (§16)', () => {
    const bursts = puffs(12);
    const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);
    expect(spread(bursts.map((burst) => burst.directionDeg))).toBeGreaterThan(1);
    expect(spread(bursts.map((burst) => burst.speed.max))).toBeGreaterThan(0.001);
    expect(spread(bursts.map((burst) => burst.radius.max))).toBeGreaterThan(0.0005);
    expect(spread(bursts.map((burst) => burst.lifeMs.max))).toBeGreaterThan(1);
    expect(spread(bursts.map((burst) => burst.turbulence))).toBeGreaterThan(0.01);
  });

  it('the same seed reproduces the same smoke, a different seed does not (§71)', () => {
    const a = puffs(21).map((burst) => burst.seed);
    const b = puffs(21).map((burst) => burst.seed);
    const c = puffs(22).map((burst) => burst.seed);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('reduced motion spends far fewer particles (§64)', () => {
    const full = harness();
    lit(full);
    full.press('cigarette');
    full.run(700);
    full.release('cigarette');
    const normal = lastOf(burstsOf(full, 'exhale'));

    const calm = harness({ settings: { reducedMotion: true } });
    lit(calm);
    calm.press('cigarette');
    calm.run(700);
    calm.release('cigarette');
    const reduced = lastOf(burstsOf(calm, 'exhale'));

    expect(normal?.count).toBeGreaterThan(0);
    expect(reduced?.count ?? 0).toBeLessThan(normal?.count ?? 0);
  });

  it('keeps a steady ambient emission while smouldering (§15)', () => {
    const h = harness();
    lit(h, 3000);
    expect(h.state().smoke.emissionRate).toBeGreaterThan(0);
    expect(burstsOf(h, 'drift').length).toBeGreaterThan(3);
  });
});

describe('§70: everything a statistic needs is already in the log', () => {
  it('records one PUFF event per draw, carrying its own numbers', () => {
    const h = harness();
    lit(h);
    for (let i = 0; i < 3; i++) {
      h.press('cigarette');
      h.run(400);
      h.release('cigarette');
    }
    const puffs = h.sessionEvents.filter((event) => event.type === SessionEventType.PUFF);
    expect(puffs.length).toBe(3);
    for (const puff of puffs) {
      expect(typeof puff.payload?.['intensity']).toBe('number');
      expect(typeof puff.payload?.['heldMs']).toBe('number');
    }
  });

  it('a session keeps its seed, its inputs and a duration', () => {
    const h = harness({ seed: 99 });
    h.engine.startSession();
    lit(h);
    h.run(1500);
    const session = h.engine.endSession();
    expect(session).not.toBeNull();
    expect(session?.seed).toBe(99);
    expect(session?.events.length).toBeGreaterThan(4);
    expect(session?.events[0]?.type).toBe(SessionEventType.SESSION_START);
    expect(session?.events.at(-1)?.type).toBe(SessionEventType.SESSION_END);
    expect(session?.inputs.length).toBeGreaterThan(0);
    expect((session?.endedAt ?? 0) - (session?.startedAt ?? 0)).toBeGreaterThan(1000);
    expect(session?.completed).toBe(false);
  });

  it('the §31 clock completing counts as a handled break', () => {
    const h = harness({ settings: { sessionTargetMs: 2000 } });
    h.engine.startSession();
    lit(h);
    h.run(1400);
    expect(sessionTypes(h)).toContain(SessionEventType.SESSION_TARGET);
    const session = h.engine.endSession();
    expect(session?.completed).toBe(true);
    expect(h.state().ui.sessionRemainingMs).toBe(0);
  });

  it('craving and trigger tags are stored without any prose (§32, §36)', () => {
    const h = harness();
    h.engine.startSession();
    h.engine.setCraving(8, 'before');
    h.engine.addTrigger('coffee');
    h.engine.addTrigger('coffee');
    h.run(200);
    h.engine.setCraving(4, 'after');
    const session = h.engine.endSession();
    expect(session?.cravingBefore).toBe(8);
    expect(session?.cravingAfter).toBe(4);
    expect(session?.triggers).toEqual(['coffee']);
    const cravings = session?.events.filter((event) => event.type === SessionEventType.CRAVING);
    expect(cravings?.length).toBe(2);
  });

  it('every event is shaped like SPEC.md §69', () => {
    const h = harness();
    h.engine.startSession();
    lit(h);
    h.run(500);
    for (const event of h.sessionEvents) {
      expect(typeof event.id).toBe('string');
      expect(typeof event.type).toBe('string');
      expect(typeof event.timestamp).toBe('number');
      if (event.payload !== undefined) expect(typeof event.payload).toBe('object');
    }
  });

  it('steps advance the clock by exact fixed increments (§54, §71)', () => {
    const h = harness();
    h.run(1000);
    const now = h.state().nowMs;
    expect(Math.abs(now - 1000)).toBeLessThan(STEP_MS);
    expect(Number.isFinite(now)).toBe(true);
  });
});
