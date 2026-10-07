/**
 * The three sounds the deck's sound list (S20) asked for that the game did not have: 灰柱崩裂,
 * 吸附 and 吸尽 — plus the two claims that make them more than names in a table.
 *
 * Why they were missing: the ash burst was one cue for both the break and the scatter, and the end
 * of a draw was carried entirely by the exhale, so the hollow the deck puts at the end of every
 * draw (and a longer one at the very last) had no event to hang on. The fix is one new voice,
 * `hollow`, whose length is the only one in the vocabulary the cue gets to choose.
 */

import { describe, expect, it } from 'vitest';
import { THRESHOLDS } from '@puffly/game-core';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { PROFILES, burstEvent, makeState, sessionEvent } from './fixture';
import { createHarness } from './harness';
import type { AudioHarness } from './harness';
import { createProfileStore } from '../profiles';
import { burstCues, cueIdsFor, drawEndCue, planCues } from '../cues';

const store = createProfileStore(PROFILES);

/** Fire one event into a fresh context and report the voices it actually built. */
function fired(event: Parameters<AudioHarness['fire']>[0], state = makeState()): string[] {
  const h = createHarness({ state });
  h.run(200, state);
  h.fire(event, state);
  h.run(400, state);
  return h.ctx.sources
    .map((source) => source.name)
    .filter((name) => name.startsWith('cue.'))
    .map((name) => name.replace(/^cue\./, '').split(':')[0] as string);
}

const planFor = (event: Parameters<typeof planCues>[0], state: ReturnType<typeof makeState>) => {
  const cues = planCues(event, state, store);
  return new Map(cues.map((cue) => [cue.cue, cue]));
};

describe('the hollow at the end of a draw (S20: 吸附 / 吸尽)', () => {
  it('answers an ordinary draw with the short hollow and nothing else', () => {
    const cues = planCues(sessionEvent('PUFF'), makeState({ rodRemaining: 0.9 }), store);
    expect(cues.map((cue) => cue.cue)).toEqual(['vacuum']);
    const vacuum = cues[0];
    expect(vacuum?.durationMs, 'the deck: 400ms').toBe(400);
    expect(vacuum?.velocity, 'the deck: 0.65').toBeCloseTo(0.65, 6);
  });

  it('answers the last draw on a stub with the same hollow held three times as long', () => {
    const cues = planCues(sessionEvent('PUFF'), makeState({ rodRemaining: 0.1 }), store);
    expect(cues.map((cue) => cue.cue)).toEqual(['burnt-out']);
    const burnt = cues[0];
    expect(burnt?.durationMs, 'the deck: 1.2s').toBe(1200);
    expect(burnt?.velocity, 'the deck: 0.7, the louder of the two').toBeCloseTo(0.7, 6);
    expect(burnt?.layers.map((layer) => layer.voice)).toEqual(['hollow']);
    // One timbre at two lengths is the deck's own description (both are 低通 sweeps), so the only
    // thing that may differ is how long the sweep runs.
    expect((burnt?.durationMs ?? 0) / 400).toBeGreaterThanOrEqual(2.5);
  });

  it('decides which hollow it is with the core’s own stub threshold, not a number of its own', () => {
    const line = THRESHOLDS.nearEndRodFraction;
    expect(drawEndCue(line)).toBe('burnt-out');
    expect(drawEndCue(line + 0.001)).toBe('vacuum');
    expect(drawEndCue(1)).toBe('vacuum');
    // And the plan follows that decision through the event, so the two cannot disagree.
    for (const remaining of [line - 0.01, line + 0.01] as const) {
      const cues = planCues(sessionEvent('PUFF'), makeState({ rodRemaining: remaining }), store);
      expect(cues[0]?.cue, `rodRemaining ${String(remaining)}`).toBe(drawEndCue(remaining));
    }
  });

  it('reaches nodes in a real context, at two different lengths', () => {
    expect(fired(sessionEvent('PUFF'), makeState({ rodRemaining: 0.8 }))).toContain('hollow');
    const short = fired(sessionEvent('PUFF'), makeState({ rodRemaining: 0.8 }));
    const long = fired(sessionEvent('PUFF'), makeState({ rodRemaining: 0.05 }));
    expect(short).toContain('hollow');
    expect(long).toContain('hollow');

    // The length claim is measured on the envelope the fake context was handed, not on the plan.
    const endsAt = (state: ReturnType<typeof makeState>): number => {
      const h = createHarness({ state });
      h.run(200, state);
      h.fire(sessionEvent('PUFF'), state);
      const calls = h.ctx.nodeNamed('cue.hollow:env')?.param('gain')?.calls ?? [];
      const last = calls.at(-1);
      expect(last?.kind, 'the hollow is shaped by an envelope, not a switch').toBe(
        'exponentialRamp',
      );
      return last?.time ?? 0;
    };
    const quick = endsAt(makeState({ rodRemaining: 0.8 }));
    const whole = endsAt(makeState({ rodRemaining: 0.05 }));
    expect(whole, 'a second and a half must not be the same length as 400ms').toBeGreaterThan(
      quick + 0.4,
    );
  });
});

describe('the column breaking is its own sound (S20: 灰柱·崩裂)', () => {
  it('fires the crack and the scatter from one burst, in that order', () => {
    expect(burstCues('ash')).toEqual(['ash', 'fracture']);
    const cues = planFor(burstEvent('ash', 12), makeState({ brightness: 0.8 }));
    expect(cues.size, 'two registers, not one').toBe(2);
    // The body first, so anything reading `[0]` still finds the material the event is about.
    expect(cueIdsFor(burstEvent('ash', 12), makeState())).toEqual(['ash', 'fracture']);
  });

  it('is louder than the scatter it turns into, and never sits on the ceiling', () => {
    // The deck pairs 崩裂 0.6 against 散落 0.3. Measured across six burst shapes and both a lit
    // and an unlit cherry, the ratio lands between 1.66 and 1.67 — the ordering the deck asks for,
    // kept off 1.0 so a harder shake can still be louder than a soft one.
    for (const lit of [true, false]) {
      for (const seed of [3, 12, 41, 66, 90, 137]) {
        const state = makeState(lit ? { brightness: 0.8 } : {});
        const cues = planFor(burstEvent('ash', seed), state);
        const crack = cues.get('fracture');
        const scatter = cues.get('ash');
        expect(crack).toBeDefined();
        expect(scatter).toBeDefined();
        const ratio = (crack?.velocity ?? 0) / (scatter?.velocity ?? 1);
        expect(ratio, `seed ${String(seed)} lit=${String(lit)}`).toBeGreaterThan(1.5);
        expect(crack?.velocity ?? 1, `crack saturated at seed ${String(seed)}`).toBeLessThan(1);
      }
    }
  });

  it('keeps the deck’s own ninety in the plan while the scatter follows the smoke', () => {
    // What this judges is which length wins: the accent's, or the burst's `lifeMs × 0.25`. Whether
    // the crackle voice can actually be played in ninety milliseconds is a different question, and
    // the answer today is no — see SPEC.md, the 时长 column that still has no home.
    const cues = planFor(burstEvent('ash', 12), makeState({ brightness: 0.8 }));
    expect(cues.get('fracture')?.durationMs).toBe(90);
    expect(cues.get('ash')?.durationMs ?? 0).toBeGreaterThan(90);
  });

  it('is the rod’s material: the rod moves the crack and only the tray moves the scatter', () => {
    const event = burstEvent('ash', 7);
    const state = makeState({ brightness: 0.8 });
    const layersOf = (pins: Parameters<typeof createProfileStore>[1], cueId: string): string =>
      planCues(event, state, createProfileStore(DEFAULT_CONTENT.soundProfiles, pins))
        .find((cue) => cue.cue === cueId)
        ?.layers.map((layer) => `${layer.voice}:${String(layer.gain)}`)
        .join('+') ?? '';

    // Both directions, because the negative half alone is satisfied by a crack that resolves to
    // nothing at all: point the cue at the tray and it stops moving when the rod changes, which is
    // the whole claim in one sentence — and it took a mutation to say so.
    expect(layersOf({ draw: 'draw-deep' }, 'fracture'), 'the rod owns the crack').not.toBe(
      layersOf({ draw: 'draw-warm' }, 'fracture'),
    );
    expect(layersOf({ tray: 'tray-tin' }, 'fracture')).toBe(
      layersOf({ tray: 'tray-stone' }, 'fracture'),
    );
    // The scatter is the other half of the pair and must answer the opposite way: an ashtray swap
    // that changed nothing would be the §77 bug this file was written for.
    expect(layersOf({ tray: 'tray-tin' }, 'ash')).not.toBe(layersOf({ tray: 'tray-stone' }, 'ash'));
    expect(layersOf({ tray: 'tray-tin' }, 'ash'), 'tin rings where stone only grinds').toContain(
      'chime',
    );
  });
});

describe('the new cues cannot be silent, in content or out of it', () => {
  it('plans a layer for each of the three, with content and with none', () => {
    const empty = createProfileStore(undefined);
    const cases: [string, ReturnType<typeof makeState>][] = [
      ['ash', makeState({ brightness: 0.8 })],
      ['puff-end', makeState({ rodRemaining: 0.9 })],
      ['stub-end', makeState({ rodRemaining: 0.1 })],
    ];
    for (const [which, state] of cases) {
      const event = which === 'ash' ? burstEvent('ash', 5) : sessionEvent('PUFF');
      for (const [name, from] of [
        ['fixture', store],
        ['none', empty],
      ] as const) {
        const cues = planCues(event, state, from);
        expect(cues.length, `${which} with ${name}`).toBeGreaterThan(0);
        for (const cue of cues) {
          expect(cue.layers.length, `${cue.cue} with ${name}`).toBeGreaterThan(0);
          expect(cue.velocity, `${cue.cue} velocity with ${name}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gives every shipped draw profile a hollow layer, so the sound is content-chosen (§77)', () => {
    const draws = DEFAULT_CONTENT.soundProfiles.filter((profile) => profile.id.startsWith('draw-'));
    expect(draws.length, 'the shipped bundle has more than one draw profile').toBeGreaterThan(2);
    for (const profile of draws) {
      const hollow = profile.layers.find((layer) => layer.voice === 'hollow');
      expect(hollow, `${profile.id} has no hollow`).toBeDefined();
      expect(hollow?.loop, `${profile.id} must not loop the hollow`).toBe(false);
      // A tray profile carrying it would mean an ashtray swap changed the sound of a breath.
      expect(
        DEFAULT_CONTENT.soundProfiles
          .filter((p) => p.id.startsWith('tray-'))
          .flatMap((p) => p.layers.map((l) => l.voice)),
        'a tray profile carries the hollow',
      ).not.toContain('hollow');
    }
  });
});
