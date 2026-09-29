/**
 * Event → cue routing (§21, §22, §26, §69): which happening makes which sound, and which
 * happening must stay quiet.
 */

import { describe, expect, it } from 'vitest';
import { WorldEventId, type EngineEvent, type SoundProfileContent } from '@puffly/game-core';
import { PROFILES, burstEvent, makeState, sessionEvent, worldEvent } from './fixture';
import { createHarness } from './harness';
import type { AudioHarness } from './harness';
import { cueIdsFor, planCues } from '../cues';
import { createProfileStore } from '../profiles';

/** Fire one event, with a frame of slack before and after so the rate limiter is not the topic. */
function once(event: EngineEvent, state = makeState({ lit: true, brightness: 0.7 })): AudioHarness {
  const h = createHarness({ state });
  h.advance(600);
  h.fire(event, state);
  return h;
}

const cueNodes = (h: AudioHarness, prefix: string): number =>
  h.ctx.nodesNamed(`cue.${prefix}`).length;

describe('discrete cues (§26)', () => {
  it('the lighter says click', () => {
    const h = once(burstEvent('lighter', 21));
    expect(cueNodes(h, 'click')).toBeGreaterThan(0);
    expect(h.engine.cueForEvent(burstEvent('lighter', 21))).toEqual(['click']);
  });

  it('a failed ignition is a different sound than a successful one', () => {
    const failed = once(sessionEvent('LIGHT_FAIL'));
    expect(cueNodes(failed, 'click')).toBeGreaterThan(0);
    expect(cueNodes(failed, 'flame')).toBeGreaterThan(0);
    expect(failed.engine.cueForEvent(sessionEvent('LIGHT_FAIL'))).toEqual(['sputter']);

    // It catching is its own click, quieter than the wheel flick and apart in time (§26).
    const caught = once(sessionEvent('LIGHT'));
    expect(cueNodes(caught, 'click')).toBeGreaterThan(0);
    expect(caught.engine.cueForEvent(sessionEvent('LIGHT'))).toEqual(['click']);
    const store = createProfileStore(PROFILES);
    const catchPlan = planCues(sessionEvent('LIGHT'), makeState(), store)[0];
    const flickPlan = planCues(burstEvent('lighter', 3), makeState(), store)[0];
    // The catch is quieter than the wheel flick that preceded it: an accent, not a second hit.
    expect(catchPlan?.velocity ?? 1).toBeLessThan(flickPlan?.velocity ?? 0);
  });

  it('the catch itself crackles', () => {
    const h = once(burstEvent('ember', 33, 0.7));
    expect(cueNodes(h, 'crackle') + cueNodes(h, 'ember')).toBeGreaterThan(0);
    expect(h.engine.cueForEvent(burstEvent('ember', 33))).toEqual(['ignite']);
  });

  it('release exhales, the held draw only whispers', () => {
    const release = once(burstEvent('exhale', 44, 0.55));
    expect(cueNodes(release, 'puff')).toBeGreaterThan(0);

    const held = once(burstEvent('puff', 45, 0.3));
    expect(held.engine.cueForEvent(burstEvent('puff', 45))).toEqual(['draw-detail']);
    expect(cueNodes(held, 'draw') + cueNodes(held, 'crackle')).toBeGreaterThan(0);
  });

  it('ash falls, extinguishing hisses, a discard lands in the tray', () => {
    expect(cueNodes(once(burstEvent('ash', 51)), 'ash')).toBeGreaterThan(0);
    expect(cueNodes(once(burstEvent('extinguish', 52, 0.6)), 'hiss')).toBeGreaterThan(0);
    const impact = once(burstEvent('impact', 53), makeState({ cigaretteState: 'DISCARDED' }));
    expect(cueNodes(impact, 'ash')).toBeGreaterThan(0);
    expect(impact.engine.cueForEvent(burstEvent('discard', 54))).toEqual(['impact']);
  });

  it('the lazy smoke column is silent: the beds already carry it', () => {
    const h = once(burstEvent('drift', 61));
    expect(h.ctx.nodesNamed('cue.')).toHaveLength(0);
    expect(h.engine.cueForEvent(burstEvent('drift', 62))).toEqual([]);
  });

  it('a gust swells in from the world event, over the event window', () => {
    const h = once(worldEvent(WorldEventId.WIND, 0.8, 2400));
    const env = h.ctx.nodeNamed('cue.wind:env');
    expect(env).toBeDefined();
    const calls = env?.param('gain')?.calls ?? [];
    // A swell, not a click: in and out, with a plateau in the middle (§59).
    expect(calls.map((call) => call.kind)).toEqual([
      'setValueAtTime',
      'linearRamp',
      'linearRamp',
      'exponentialRamp',
    ]);
    expect(calls[1]?.time).toBeGreaterThan(h.ctx.currentTime);
  });

  it('rain arrives from a rain event and not from a wind one', () => {
    const rain = once(worldEvent(WorldEventId.RAIN, 0.7, 3000));
    expect(cueNodes(rain, 'rain')).toBeGreaterThan(0);
    expect(cueNodes(rain, 'wind')).toBe(0);

    const wind = once(worldEvent(WorldEventId.WIND, 0.7, 3000));
    expect(cueNodes(wind, 'wind')).toBeGreaterThan(0);
    expect(cueNodes(wind, 'rain')).toBe(0);
  });

  it('quiet background happenings stay quiet, in the ambient bus', () => {
    for (const type of [
      WorldEventId.ENVIRONMENT_NOISE,
      WorldEventId.LIGHT_CHANGE,
      WorldEventId.SHADOW_CHANGE,
      WorldEventId.AMBIENT_EVENT,
      WorldEventId.SMOKE_SWIRL,
    ]) {
      const h = once(worldEvent(type, 0.5, 1600));
      expect(h.ctx.nodesNamed('bus:ambient').length).toBe(1);
      expect(cueNodes(h, 'room') + cueNodes(h, 'city') + cueNodes(h, 'wind')).toBeGreaterThan(0);
    }
  });

  it('an unlock is one soft bell, and nothing else', () => {
    const h = once(sessionEvent('UNLOCK'));
    expect(cueNodes(h, 'chime')).toBeGreaterThan(0);
    const asEvent: EngineEvent = { kind: 'unlock', atMs: 0, category: 'trays', id: 'glass' };
    expect(h.engine.cueForEvent(asEvent)).toEqual([]);
    // One ringing voice, not a fanfare: §39 wants a fade-in, not a dialog.
    const chimes = h.ctx.sources.filter((source) => source.name.startsWith('cue.chime'));
    expect(chimes).toHaveLength(1);
  });

  it('finishing the countdown is the same bell (§31 needs no words)', () => {
    const h = once(sessionEvent('SESSION_TARGET'));
    expect(cueNodes(h, 'chime')).toBeGreaterThan(0);
  });

  it('lifecycle transitions make no sound of their own', () => {
    const h = once({ kind: 'transition', atMs: 0, from: 'BURNING', to: 'EXTINGUISHING' });
    expect(h.ctx.nodesNamed('cue.')).toHaveLength(0);
  });

  it('plans cues from content, so a different tray sounds different', () => {
    const glassTray: SoundProfileContent = {
      id: 'tray-glass',
      name: 'Glass',
      layers: [
        { voice: 'ash', gain: 0.34, pitchSpread: 3, timingSpreadMs: 18, pan: 0.35, loop: false },
        { voice: 'chime', gain: 0.12, pitchSpread: 4, timingSpreadMs: 40, pan: 0.4, loop: false },
      ],
      unlock: { kind: 'day', day: 7 },
    };
    const state = makeState();
    const event = burstEvent('ash', 91);

    // With no tray pinned, the bundle's default-unlocked tray is what sounds.
    const stone = createProfileStore(PROFILES);
    expect(stone.resolve('tray', state).id).toBe('tray-stone');
    expect(planCues(event, state, stone)[0]?.layers.map((layer) => layer.voice)).toEqual(['ash']);

    // A shell that knows which tray the player picked pins it, and glass rings as well as grinds.
    const glass = createProfileStore([...PROFILES, glassTray], { tray: 'tray-glass' });
    expect(glass.resolve('tray', state).id).toBe('tray-glass');
    expect(planCues(event, state, glass)[0]?.layers.map((layer) => layer.voice)).toEqual([
      'ash',
      'chime',
    ]);

    // An id that is not in the bundle falls back to the bundle's own default tray, still audible.
    const wrongId = createProfileStore(PROFILES, { tray: 'tray-that-does-not-exist' });
    expect(wrongId.resolve('tray', state).id).toBe('tray-stone');
    expect(planCues(event, state, wrongId)[0]?.layers.length).toBeGreaterThan(0);

    // No content at all: the built-in recipe answers, because silence would be a crash (§63).
    const empty = createProfileStore(undefined);
    expect(empty.resolve('tray', state).synthesized).toBe(true);
    expect(empty.resolve('ambient', state).synthesized).toBe(true);
    expect(planCues(event, state, empty)[0]?.layers.length).toBeGreaterThan(0);
  });

  it('the pure mapper agrees with what the engine actually fired', () => {
    const store = createProfileStore(PROFILES);
    for (const kind of ['lighter', 'exhale', 'ash', 'extinguish', 'impact', 'ember'] as const) {
      const event = burstEvent(kind, 7);
      const planned = planCues(event, makeState(), store);
      expect(planned.map((cue) => cue.cue)).toEqual(cueIdsFor(event));
      expect(planned[0]?.velocity).toBeGreaterThan(0);
      expect(planned[0]?.layers.length).toBeGreaterThan(0);
    }
  });
});
