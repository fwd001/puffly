/**
 * The room behind the cues — the deck's 「混响 关」 (S6), 「混响尾巴 ≤ 0.4s」 (S20) and 「混响拉长」
 * (S7's 屏息, S20's 吸附).
 *
 * What is checkable here, and what is not: no test can hear. So these cases judge the graph the
 * engine builds and the automation it schedules — the shape of the loop, the level the player's
 * setting produced, the −60 dB point recomputed from the params that are actually on the nodes, and
 * the dry path staying intact. That is the most a recording double can establish about a reverb, and
 * it is also the part that silently fails when the send is never built.
 */

import { describe, expect, it } from 'vitest';
import { burstEvent, makeState, sessionEvent } from './fixture';
import { createHarness } from './harness';
import type { AudioHarness } from './harness';
import { FakeAudioContext } from './fake-audio';
import type { Settings } from '@puffly/game-core';
import { TAIL_BASE_SEC, WET_BASE, WET_CEILING, tailSeconds } from '../room';

const withRoom = (settings: Partial<Settings> = {}): AudioHarness =>
  createHarness({ settings: { reverb: true, ...settings } });

/** Both combs' current (spacing, feedback), read off the nodes rather than from the constants. */
function combs(h: AudioHarness): Array<{ delay: number; feedback: number }> {
  const out: Array<{ delay: number; feedback: number }> = [];
  for (const index of [0, 1]) {
    const delay = h.ctx.param(`room:comb${String(index)}.delay`, 'delayTime')?.value;
    const feedback = h.ctx.param(`room:comb${String(index)}.fb`, 'gain')?.value;
    expect(delay, `comb${String(index)} delay exists`).toBeTypeOf('number');
    expect(feedback, `comb${String(index)} feedback exists`).toBeTypeOf('number');
    out.push({ delay: delay ?? 0, feedback: feedback ?? 0 });
  }
  return out;
}

describe('the room is a send the player may refuse (S6 「混响 关」)', () => {
  it('is exactly zero by default, and the deck puts it there', () => {
    const h = createHarness();
    const wet = h.ctx.param('room:wet', 'gain')?.lastTarget();
    expect(wet, 'off must be zero, not quiet').toBe(0);
  });

  it('opens to a level that is a room, not a second event', () => {
    const h = withRoom();
    const level = h.ctx.param('room:wet', 'gain')?.lastTarget() ?? 0;
    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThanOrEqual(WET_CEILING);
    expect(WET_BASE).toBeLessThanOrEqual(WET_CEILING);
  });

  it('hangs off the cue bus instead of sitting in front of it', () => {
    const h = withRoom();
    const cue = h.ctx.nodeNamed('bus:cue');
    const named = (cue?.connections ?? []).map(
      (node) => (node as { name?: string }).name ?? 'unnamed',
    );
    // Two destinations: the master (the dry path, which must survive the room being switched off)
    // and the room's own input. One of them, and the room would be a serial stage.
    expect(named).toContain('bus:master');
    expect(named).toContain('room:in');
  });

  it('is a loop, not a single echo: the damped top feeds both its own delay and the wet sum', () => {
    const h = withRoom();
    for (const index of [0, 1]) {
      // damping → feedback → delay is the recirculation; damping → wet is what the ear hears. A
      // node that only reached the wet sum would be one echo, which is a metallic ping-pong.
      const targets = (h.ctx.nodeNamed(`room:comb${String(index)}.damp`)?.connections ?? [])
        .map((node) => (node as { name?: string }).name ?? '')
        .filter((name) => name.startsWith('room:'))
        .sort();
      expect(targets, `comb${String(index)}`).toEqual([`room:comb${String(index)}.fb`, 'room:wet']);
      const feedback = (h.ctx.nodeNamed(`room:comb${String(index)}.fb`)?.connections ?? [])
        .map((node) => (node as { name?: string }).name ?? '')
        .join(',');
      expect(feedback, `comb${String(index)} feeds back into itself`).toContain(
        `room:comb${String(index)}.delay`,
      );
    }
  });
});

describe('the tail obeys the deck’s 0.4 s (S20)', () => {
  it('puts every comb’s −60 dB point under the ceiling it was authored to', () => {
    const h = withRoom();
    const tails = combs(h).map((comb) => tailSeconds(comb.delay, comb.feedback));
    for (const [index, tail] of tails.entries()) {
      expect(tail, `comb${String(index)} tail`).toBeGreaterThan(0);
      expect(tail, `comb${String(index)} exceeds the deck's 0.4s`).toBeLessThanOrEqual(0.4);
    }
    console.log(
      `ROOM tail=${tails.map((t) => t.toFixed(3)).join(',')} base=${String(TAIL_BASE_SEC)}`,
    );
  });
});

describe('混响拉长 happens on the two events that ask for it', () => {
  it('opens the room for the end of a draw, and hands the spacing back afterwards', () => {
    const h = withRoom();
    const mature = makeState({ rodRemaining: 0.8 });
    h.run(300, mature);
    h.fire(sessionEvent('PUFF'), mature);

    for (const index of [0, 1]) {
      const name = `room:comb${String(index)}`;
      const delay = h.ctx.param(`${name}.delay`, 'delayTime');
      const feedback = h.ctx.param(`${name}.fb`, 'gain');
      const bump = delay?.of('setValueAtTime') ?? [];
      const handBack = delay?.of('setTarget') ?? [];
      const dried = feedback?.of('setValueAtTime') ?? [];
      const driedBack = feedback?.of('setTarget') ?? [];
      expect(bump.length, `comb${String(index)} never opened`).toBe(1);
      expect(handBack.length, `comb${String(index)} stayed open`).toBe(1);
      // Scheduled ahead of the clock the harness last advanced, never in the past.
      expect(bump[0]?.time ?? 0).toBeGreaterThan(0);
      // 拉长 used to be judged only as "longer", with a 0.75 s allowance nobody had read off the deck.
      // The deck's own line is two lines above that request — 「混响尾巴 ≤ 0.4s」 — and opening the
      // spacing while holding the feedback moves the −60 dB point by the same factor (0.34 × 1.8 =
      // 0.61 s). So the room has to drain faster as it opens: both params move, and both hand back.
      expect(dried.length, `comb${String(index)} never dried as it opened`).toBe(1);
      expect(driedBack.length, `comb${String(index)} stayed dry`).toBe(1);
      expect(
        (dried[0]?.value ?? 1) < (combs(h)[index]?.feedback ?? 0),
        'feedback did not drop',
      ).toBe(true);
      const stretched = tailSeconds(bump[0]?.value ?? 0, dried[0]?.value ?? 0);
      expect(stretched, `comb${String(index)} stretched tail`).toBeGreaterThan(TAIL_BASE_SEC);
      // 0.4 is written here as the deck's number on purpose, not as `TAIL_CEILING_SEC`: a guard that
      // reads its passing line from the module under test cannot notice that module moving.
      expect(stretched, `comb${String(index)} crosses the deck's 0.4s`).toBeLessThanOrEqual(
        0.4 + 1e-9,
      );
      expect(handBack[0]?.value).toBeLessThan(bump[0]?.value ?? 0);
      console.log(
        `ROOM stretch comb${String(index)} delay=${(bump[0]?.value ?? 0).toFixed(4)} ` +
          `fb=${(dried[0]?.value ?? 0).toFixed(4)} tail=${stretched.toFixed(3)}`,
      );
    }
  });

  it('does not open for a lighter, a flick or an exhale', () => {
    const h = withRoom();
    const state = makeState({ brightness: 0.8 });
    h.run(200, state);
    const fired: string[] = [];
    for (const kind of ['lighter', 'ash', 'exhale', 'extinguish'] as const) {
      h.advance(200);
      h.fire(burstEvent(kind, 3), state);
      fired.push(kind);
    }
    expect(fired).toHaveLength(4);
    for (const index of [0, 1]) {
      const opens =
        h.ctx.param(`room:comb${String(index)}.delay`, 'delayTime')?.of('setValueAtTime').length ??
        0;
      expect(opens, `comb${String(index)} opened for a cue that did not ask`).toBe(0);
    }
  });

  it('schedules nothing at all while the player has it off', () => {
    const h = createHarness();
    const state = makeState({ rodRemaining: 0.8 });
    h.run(300, state);
    h.fire(sessionEvent('PUFF'), state);
    for (const index of [0, 1]) {
      const calls = h.ctx.param(`room:comb${String(index)}.delay`, 'delayTime')?.calls ?? [];
      expect(calls, `comb${String(index)} moved while the room was off`).toEqual([]);
    }
  });
});

describe('a runtime without a DelayNode keeps the game (S63)', () => {
  it('builds no room, still plays its cues, and never dies for the missing node', () => {
    const ctx = new FakeAudioContext({ without: ['delay'] });
    const h = createHarness({ context: ctx, settings: { reverb: true } });
    expect(ctx.nodesNamed('room:')).toHaveLength(0);
    expect(h.engine.isReady()).toBe(true);
    expect(h.engine.isAvailable()).toBe(true);

    const state = makeState({ brightness: 0.8, rodRemaining: 0.8 });
    h.run(200, state);
    expect(() => h.fire(sessionEvent('PUFF'), state)).not.toThrow();
    expect(() => h.fire(burstEvent('lighter', 4), state)).not.toThrow();
    expect(ctx.nodesNamed('cue.').length, 'dry audio still happens').toBeGreaterThan(0);
  });

  it('disconnects its own nodes on dispose', () => {
    const h = withRoom();
    h.engine.dispose();
    for (const suffix of ['in', 'wet', 'comb0.delay', 'comb0.fb', 'comb1.damp']) {
      expect(h.ctx.nodeNamed(`room:${suffix}`)?.disconnectCount, `room:${suffix}`).toBeGreaterThan(
        0,
      );
    }
  });
});
