/**
 * S20’s sound list asked for two timbres the game had pointed the wrong way, and one it never had.
 *
 * 掐灭 was a bright steam: the cue’s own id was `hiss`, and the voice behind it is a highpass at
 * 2300 Hz with a 5.2 kHz shine on top — the brightest thing in the vocabulary. The deck asks for a
 * 闷响 (「正弦 60Hz + 低通噪声」, 220 ms·0.8), the opposite end of the spectrum, so the press now
 * answers with `hollow`, the one voice that falls as it dies.
 *
 * 纸面引燃·嘶 (「带通噪声由 6kHz 降到 1.5kHz 的下扫」, 350 ms·0.55) had no cue at all: the `hiss`
 * voice was spending its whole life on the wrong moment. It is now the second register of the
 * lighting, and it hangs off the `LIGHT` session event rather than off the `ember` burst, because
 * the lighter’s fidget flourish emits that same burst kind and a fiddled lighter has no paper in it.
 *
 * The third finding is what the rename uncovered. `selectLayers` keeps only the layers a profile
 * actually carries, so the `chime` in the glass / tin / porcelain extinguish recipes was being
 * dropped by a cue that asked for `hiss` and `ash` — four trays built to land differently were
 * landing the same way, and a guard on the profile *ids* could not see it.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import type { EngineEvent } from '@puffly/game-core';
import { burstEvent, makeState, sessionEvent } from './fixture';
import { createHarness } from './harness';
import type { AudioHarness } from './harness';
import { createProfileStore } from '../profiles';
import { burstCues, planCues } from '../cues';
import { FakeFilter } from './fake-audio';

const PROFILES = DEFAULT_CONTENT.soundProfiles;
const store = createProfileStore(PROFILES);

/** Fire one event into a quiet graph, so everything in it came from that event. */
function solo(event: EngineEvent, state = makeState({ brightness: 0.8 })): AudioHarness {
  const h = createHarness({ state, profiles: PROFILES });
  h.advance(600);
  h.fire(event, state);
  h.run(200, state);
  return h;
}

const cueNodes = (h: AudioHarness, prefix: string): number =>
  h.ctx.nodesNamed(`cue.${prefix}`).length;

/** The highest frequency each filter under a cue was ever told to sit at. */
function bands(h: AudioHarness, prefix: string) {
  return h.ctx
    .nodesNamed(`cue.${prefix}`)
    .filter((node): node is FakeFilter => node instanceof FakeFilter)
    .map((node) => ({
      name: node.name,
      type: node.type,
      top: Math.max(node.frequency.value, ...node.frequency.calls.map((call) => call.value)),
    }));
}

/** How long the voice’s own envelope ran, in seconds, first automation to last. */
function tailSpread(h: AudioHarness, name: string): number {
  const calls = h.ctx.nodeNamed(name)?.param('gain')?.calls ?? [];
  if (calls.length === 0) return -1;
  return (calls.at(-1)?.time ?? 0) - (calls[0]?.time ?? 0);
}

type Pins = Parameters<typeof createProfileStore>[1];

/**
 * The voices a cue actually got, read off the plan rather than off the profile. The profile is the
 * recipe content declares; the plan is what survives `selectLayers`, and the difference between the
 * two is this file’s third bug.
 */
function press(pins: Pins = {}): string[] {
  const cue = planCues(
    burstEvent('extinguish', 7, 0.6),
    makeState(),
    createProfileStore(PROFILES, pins),
  ).find((planned) => planned.cue === 'smother');
  return cue?.layers.map((layer) => layer.voice) ?? [];
}

function paper(pins: Pins = {}): string {
  return (
    planCues(
      sessionEvent('LIGHT'),
      makeState({ brightness: 0.8 }),
      createProfileStore(PROFILES, pins),
    )
      .find((cue) => cue.cue === 'catch')
      ?.layers.map((layer) => `${layer.voice}:${String(layer.gain)}`)
      .join('+') ?? ''
  );
}

describe('the put-out is a muffle, not a steam (S20: 掐灭·闷响)', () => {
  it('keeps the top of the spectrum out of the press', () => {
    const h = solo(burstEvent('extinguish', 52, 0.6));
    expect(cueNodes(h, 'hollow'), 'the deck asks for a low-passed body').toBeGreaterThan(0);
    expect(cueNodes(h, 'hiss'), 'and no bright steam').toBe(0);

    const low = bands(h, 'hollow');
    expect(low.length, 'the press built no filter at all').toBeGreaterThan(0);
    for (const band of low) {
      // `hollow` is a lowpass near 430 falling to 150 and a cavity band near 200: nothing in the
      // press may sit in the band the deck calls 嘶.
      expect(band.type, band.name).not.toBe('highpass');
      expect(band.top, `${band.name} at ${String(band.top)} Hz is not a 闷响`).toBeLessThan(600);
    }

    // Positive control, same scan: it does see brightness where brightness is the instruction — the
    // paper of the same rod, one moment earlier in the same break.
    const bright = bands(solo(sessionEvent('LIGHT')), 'hiss');
    expect(bright.length, 'the paper built no filter').toBeGreaterThan(0);
    expect(
      bright.some((band) => band.top > 2000),
      'the scan found no bright band at all',
    ).toBe(true);
  });

  it('is the deck’s 220 ms press, not the length of the smoke it belongs to', () => {
    // 220 ms is under `hollow`’s own 0.3 s floor, so the shortest muffle that voice can make is what
    // ships. What this case really judges is the stretch rule: the extinguish burst carries a life of
    // seconds, and a press stretched over it is a wash of low noise under a grind that repeats every
    // 260 ms — and the deck separated 掐灭 from the cloud on purpose.
    const burst = burstEvent('extinguish', 52, 0.6);
    const cue = planCues(burst, makeState({ brightness: 0.8 }), store)[0];
    expect(cue?.cue).toBe('smother');
    expect(
      (burst.kind === 'burst' ? burst.burst.lifeMs.max : 0) * 0.25,
      'the rule this case proves has nothing to bite on',
    ).toBeGreaterThan(240);
    expect(cue?.durationMs, 'the deck: 220ms, held to the shortest the voice can play').toBe(240);

    const pressTail = tailSpread(solo(burst), 'cue.hollow:env');
    const breathTail = tailSpread(
      solo(sessionEvent('PUFF'), makeState({ rodRemaining: 0.9, brightness: 0.8 })),
      'cue.hollow:env',
    );
    expect(pressTail, 'no hollow was built for the press').toBeGreaterThan(0);
    expect(pressTail, 'the press outlived its own muffle').toBeLessThanOrEqual(0.35);
    expect(breathTail, '吸附 (400 ms) is not shorter than the press').toBeGreaterThan(pressTail);
  });

  it('still hears what the press lands in', () => {
    // The muffle is one press for every tray; the material under it is five different recipes, and
    // three of them ring. Read off the plan: a cue that stopped asking for the ring would have kept
    // the recipe intact and dropped the sound.
    const ringing = ['extinguish-glass', 'extinguish-tin', 'extinguish-porcelain'];
    const grinding = ['extinguish', 'extinguish-stone'];
    for (const id of [...ringing, ...grinding]) {
      const voices = press({ extinguish: id });
      expect(voices, `${id} lost the muffle`).toContain('hollow');
      expect(voices.length, `${id} pressed with nothing under it`).toBeGreaterThan(1);
      expect(new Set(voices).size, `${id} built one voice twice`).toBe(voices.length);
    }
    for (const id of ringing) {
      expect(press({ extinguish: id }), `${id} does not ring`).toContain('chime');
    }
    for (const id of grinding) {
      expect(press({ extinguish: id }), `${id} should only grind`).not.toContain('chime');
      expect(press({ extinguish: id }), `${id} has no grains`).toContain('ash');
    }
  });
});

describe('the paper takes the flame as its own sound (S20: 纸面引燃·嘶)', () => {
  it('is the deck’s 350 ms at 0.55, off the rod’s own profile', () => {
    const cues = planCues(sessionEvent('LIGHT'), makeState({ brightness: 0.8 }), store);
    expect(
      cues.map((cue) => cue.cue),
      'the lighting answers with more than the paper',
    ).toEqual(['catch']);
    const catchCue = cues[0];
    expect(catchCue?.durationMs, 'the deck: 350ms').toBe(350);
    expect(catchCue?.velocity, 'the deck: 0.55').toBeCloseTo(0.55, 6);
    expect(
      catchCue?.layers.map((layer) => layer.voice),
      'the paper is not the hiss voice',
    ).toEqual(['hiss']);

    // It is the rod that hisses, not the tray: a different blend changes it, a different ashtray
    // does not. The non-empty check first, or two missing recipes would compare equal.
    expect(paper(), 'the paper built no layer').not.toBe('');
    expect(paper({ draw: 'draw-deep' })).not.toBe(paper({ draw: 'draw-warm' }));
    expect(paper({ extinguish: 'extinguish-tin' })).toBe(paper({ extinguish: 'extinguish-stone' }));
  });

  it('belongs to the lighting, not to every spark the core throws', () => {
    // The lighter’s fidget flourish emits the very same `ember` burst kind, and there is no paper
    // anywhere in a fiddled lighter. Hung off that burst, the hiss would have been the sound of a
    // wrist gesture.
    expect(burstCues('ember')).toEqual(['ignite']);
    const h = solo(burstEvent('ember', 3, 0.7));
    expect(cueNodes(h, 'crackle') + cueNodes(h, 'ember')).toBeGreaterThan(0);
    expect(cueNodes(h, 'hiss'), 'a spark with no rod in the flame').toBe(0);

    // And the moment the rod does catch has both registers in the picture.
    const together = createHarness({ state: makeState({ brightness: 0.8 }), profiles: PROFILES });
    together.advance(600);
    together.fire(burstEvent('ember', 4, 0.9), makeState({ brightness: 0.8 }));
    together.fire(sessionEvent('LIGHT'), makeState({ brightness: 0.8 }));
    expect(cueNodes(together, 'crackle'), 'the sparks went missing').toBeGreaterThan(0);
    expect(cueNodes(together, 'hiss'), 'the paper never sounded').toBeGreaterThan(0);
  });

  it('gives every shipped draw profile a paper layer, so the hiss is content-chosen (§77)', () => {
    const draws = PROFILES.filter((profile) => profile.id.startsWith('draw-'));
    expect(draws.length, 'the shipped bundle has more than one draw profile').toBeGreaterThan(2);
    for (const profile of draws) {
      const layer = profile.layers.find((candidate) => candidate.voice === 'hiss');
      expect(layer, `${profile.id} has no paper`).toBeDefined();
      // A loop would be the rod hissing by itself between draws, and the catch happens once.
      expect(layer?.loop, `${profile.id} loops the paper`).toBe(false);
      expect(layer?.gain, `${profile.id} declares silent paper`).toBeGreaterThan(0);
    }
    // A tray or an extinguish recipe carrying it would mean an ashtray swap changed the sound of
    // the flame reaching the rod.
    const others = PROFILES.filter(
      (profile) => profile.id.startsWith('tray-') || profile.id.startsWith('extinguish'),
    ).flatMap((profile) => profile.layers.map((layer) => layer.voice));
    expect(others, 'a tray recipe carries the paper').not.toContain('hiss');
  });
});
