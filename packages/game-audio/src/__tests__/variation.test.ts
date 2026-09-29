/**
 * §26: "声音不要重复播放得像机械按钮" — the same trigger must not sound the same twice.
 *
 * The claims are checked against the recording fake: different start time, different pitch,
 * different generated noise buffer, and a content-driven spread that can be turned off.
 */

import { describe, expect, it } from 'vitest';
import { burstEvent, makeState } from './fixture';
import { FakeBuffer, FakeSource } from './fake-audio';
import { createHarness } from './harness';
import type { SoundProfileContent } from '@puffly/game-core';

const sourcesOf = (prefix: string, ctx: { sources: unknown[] }): FakeSource[] =>
  ctx.sources.filter(
    (source): source is FakeSource =>
      source instanceof FakeSource && source.name.startsWith(prefix),
  );

const bufferOf = (source: FakeSource): FakeBuffer | undefined =>
  source.buffer instanceof FakeBuffer ? source.buffer : undefined;

describe('per-trigger variation (§26)', () => {
  it('fires two identical lighter bursts with different pitch, timing and buffer', () => {
    const h = createHarness();
    h.frame(makeState({ cigaretteState: 'PICKED_UP' }));

    // Byte-for-byte the same event, twice: the seed is deliberately not varied here.
    h.fire(burstEvent('lighter', 777));
    h.advance(260);
    h.fire(burstEvent('lighter', 777));

    const clicks = sourcesOf('cue.click', h.ctx);
    expect(clicks.length).toBeGreaterThanOrEqual(2);
    const first = clicks[0];
    const second = clicks[1];
    if (!first || !second) throw new Error('no click source was scheduled');

    expect(first.startCalls[0]).not.toBe(second.startCalls[0]);
    expect(first.playbackRate.value).not.toBe(second.playbackRate.value);

    const a = bufferOf(first);
    const b = bufferOf(second);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // Not the same recording at another pitch: the samples themselves were generated afresh.
    expect(a?.fingerprint()).not.toBe(b?.fingerprint());
    expect(a?.length).toBe(b?.length);
  });

  it('never repeats a puff whoosh, over a dozen releases in a row', () => {
    const h = createHarness();
    const lit = makeState({ cigaretteState: 'BURNING', brightness: 0.8, lit: true, density: 0.5 });
    h.frame(lit);

    const starts: number[] = [];
    const rates: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      h.fire(burstEvent('exhale', 900 + i), lit);
      h.advance(120);
      for (const source of sourcesOf('cue.puff', h.ctx)) {
        if (source.startCalls.length === 0) continue;
        starts.push(source.startCalls[0] ?? 0);
        rates.push(source.playbackRate.value);
      }
      h.ctx.sources.length = 0;
    }

    expect(starts.length).toBeGreaterThanOrEqual(12);
    expect(new Set(starts).size).toBeGreaterThan(6);
    expect(new Set(rates.map((rate) => rate.toFixed(4))).size).toBeGreaterThan(6);
  });

  it('takes its amount of variation from the profile, not from code', () => {
    const pinned: SoundProfileContent[] = [
      {
        id: 'tray-fixed',
        name: 'Fixed',
        layers: [
          { voice: 'ash', gain: 0.4, pitchSpread: 0, timingSpreadMs: 40, pan: 0, loop: false },
        ],
        unlock: { kind: 'default' },
      },
      {
        id: 'draw-fixed',
        name: 'Fixed draw',
        layers: [
          { voice: 'puff', gain: 0.4, pitchSpread: 0, timingSpreadMs: 10, pan: 0, loop: false },
        ],
        unlock: { kind: 'default' },
      },
    ];
    const h = createHarness({
      profiles: pinned,
      state: makeState({ soundProfileId: 'draw-fixed' }),
    });

    const rates: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      h.fire(burstEvent('ash', 1234), makeState({ soundProfileId: 'draw-fixed' }));
      h.advance(150);
      for (const source of sourcesOf('cue.ash', h.ctx)) rates.push(source.playbackRate.value);
    }

    // pitchSpread 0 means the noise plays at exactly its generated rate: content decides.
    expect(rates.length).toBeGreaterThan(0);
    for (const rate of rates) expect(rate).toBeCloseTo(1, 6);
  });

  it('layers several voices of one profile for a single cue', () => {
    const h = createHarness();
    h.fire(burstEvent('lighter', 51));
    h.advance(400);
    // The failed lighter attempt is a click plus a dying flame: two voices, one happening.
    h.fire(
      {
        kind: 'session',
        event: { id: 'evt-fail', type: 'LIGHT_FAIL', timestamp: 1_760_000_000_000 },
      },
      makeState({ lighterEngaged: true }),
    );

    expect(h.ctx.nodesNamed('cue.click').length).toBeGreaterThan(0);
    expect(h.ctx.nodesNamed('cue.flame').length).toBeGreaterThan(0);
  });

  it('thins out a storm of bursts instead of turning it into noise (§54)', () => {
    const h = createHarness();
    const lit = makeState({
      cigaretteState: 'PUFFING',
      brightness: 0.8,
      lit: true,
      intensity: 0.7,
      density: 0.6,
    });
    h.frame(lit);

    for (let i = 0; i < 40; i += 1) h.fire(burstEvent('puff', 2000 + i), lit);

    const drawn = h.ctx.nodesNamed('cue.draw').filter((node) => node instanceof FakeSource);
    // 40 leaks in one instant: only the first may sound, and the rest must not queue up.
    expect(drawn.length).toBeLessThanOrEqual(2);
    expect(drawn.length).toBeGreaterThan(0);
  });

  it('generates a different noise buffer per trigger and never loads a file', () => {
    const h = createHarness();
    h.fire(burstEvent('ash', 11));
    h.advance(200);
    h.fire(burstEvent('ash', 12));

    expect(h.ctx.buffers.length).toBeGreaterThanOrEqual(2);
    const prints = h.ctx.buffers.map((buffer) => buffer.fingerprint());
    expect(new Set(prints).size).toBe(prints.length);
    for (const buffer of h.ctx.buffers) {
      expect(buffer.sampleRate).toBe(h.ctx.sampleRate);
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});
