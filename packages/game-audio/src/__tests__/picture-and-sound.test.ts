/**
 * The picture and the sound have to be the same decision — SPEC.md §26, §27, and the sentence the
 * design hands to the audio adapter: 声音一定要跟画面连接.
 *
 * Two ways this was not true, both found by reading which half of the game knows what:
 *
 * - The four ashtrays were four objects to the picture and one object to the sound. `stateId` had no
 *   branch for the `tray` and `extinguish` roles, so every tray resolved through `byPrefix` to
 *   whichever `tray-*` profile happened to come first — and the content already had four different
 *   ones (stone has no ring; glass, tin and porcelain each ring differently).
 * - Nothing on the table's identity reached the audio adapter at all. The ashtray's material colours
 *   were in `style`, its position in `stage.layout`, and its *name* nowhere.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { createProfileStore } from '../profiles';
import { makeBurst, makeState } from './fixture';
import { createHarness } from './harness';

const PROFILES = DEFAULT_CONTENT.soundProfiles;
const store = createProfileStore(PROFILES, {});

// The shipped table, not a copy of it typed in here. A guard that re-declares the content it is
// checking can only ever prove the copy is self-consistent: with a list above, giving two trays the
// same `extinguishProfileId` in `props.ts` stayed green.
const TRAYS = DEFAULT_CONTENT.ashtrays;

const stateOnTray = (tray: (typeof TRAYS)[number]) =>
  makeState({
    trayId: tray.id,
    trayProfileId: tray.soundProfileId,
    extinguishProfileId: tray.extinguishProfileId,
  });

function resolved(role: 'tray' | 'extinguish', tray: (typeof TRAYS)[number]): string {
  const profile = store.resolve(role, stateOnTray(tray));
  return profile.id;
}

describe('the tray you can see is the tray you hear (§26)', () => {
  it('gives the four materials four different sounds, for both cues', () => {
    expect(TRAYS.length, 'the ladder of trays this file counts').toBe(4);
    const ash = TRAYS.map((t) => resolved('tray', t));
    const hiss = TRAYS.map((t) => resolved('extinguish', t));
    console.log(`TRAY ${ash.join(',')} | HISS ${hiss.join(',')}`);
    expect(new Set(ash).size).toBe(TRAYS.length);
    expect(new Set(hiss).size).toBe(TRAYS.length);
    // Not merely four labels: the layer recipes differ, which is the only sense in which one tray
    // can sound unlike another. Stone never rings; the three others each ring at their own gain.
    // Four labels that all resolved to one recipe would still pass a set check on the ids, so
    // compare the recipe itself. Voice membership alone is not the difference between three
    // ringing trays: glass, tin and porcelain all ring, at different loudness and pitch spread.
    const recipes = TRAYS.map((t) =>
      store
        .resolve('tray', stateOnTray(t))
        .layers.map((l) => `${l.voice}:${l.gain}:${l.pitchSpread}`)
        .join('+'),
    );
    expect(new Set(recipes).size, `trays sharing a recipe: ${recipes.join(' | ')}`).toBe(
      TRAYS.length,
    );
    // And exactly one of them does not ring at all, or "different" only ever means "all chimes".
    const voices = TRAYS.map((t) =>
      store
        .resolve('tray', stateOnTray(t))
        .layers.map((l) => l.voice)
        .join('+'),
    );
    expect(voices.filter((v) => !v.includes('chime')).length).toBe(1);
  });

  it('fires the layers of the tray that is on the table, not of a default one', () => {
    // The resolution above could still be a number nobody acts on, so this one goes through the
    // engine and counts what actually got built.
    const fired = (tray: (typeof TRAYS)[number]): string[] => {
      const h = createHarness({ profiles: PROFILES });
      h.run(200, stateOnTray(tray));
      // A real `burst` of kind `ash` — the event core emits when a column of ash lands. This is
      // the channel production actually uses, not one invented for the test.
      h.fire({ kind: 'burst', atMs: 200, burst: makeBurst('ash', 7) }, stateOnTray(tray));
      h.run(400, stateOnTray(tray));
      // Only what the cue built: the beds are running in both cases and would swamp the count.
      const names = h.ctx.sources
        .map((source) => source.name)
        .filter((name) => name.startsWith('cue.'));
      h.engine.dispose();
      return names;
    };
    const ringing = TRAYS.filter((t) =>
      store.resolve('tray', stateOnTray(t)).layers.some((l) => l.voice === 'chime'),
    );
    const silent = TRAYS.filter((t) => !ringing.includes(t));
    expect(silent.length).toBe(1);
    const stone = fired(silent[0]!);
    const glass = fired(ringing[0]!);
    console.log(`NAMES ${[...new Set([...stone, ...glass])].join(',')}`);
    // One voice can build more than one node (`ash` is a dust body plus a top), so the count that
    // means something is the set of voices the tray asked for.
    const voices = (names: string[]): string[] =>
      [...new Set(names.map((name) => name.replace(/^cue\./, '').split(':')[0] ?? ''))].sort();
    expect(voices(stone), 'no cue was built at all').toEqual(['ash']);
    // Stone is the one tray that does not ring. If the identity never reached the planner this is
    // `['ash']` for both, which is exactly the bug this file is about.
    expect(voices(glass)).toEqual(['ash', 'chime']);
  });
});

describe('a switched room is heard in the frame it switches (§27)', () => {
  it('changes which ambient layers are sounding the moment the environment does', () => {
    const h = createHarness({ profiles: PROFILES });
    const quiet = makeState({ ambientProfileId: 'room-quiet', ambientGain: 1 });
    const city = makeState({ ambientProfileId: 'city-far', ambientGain: 1 });
    h.run(600, quiet);
    const before = h.ctx.sources.filter((s) => s.name.startsWith('bed.ambient')).length;

    // One frame at 16 ms: the shell syncs every animation frame, so a bed that needs seconds to
    // change is a bed the player hears arriving late.
    h.run(16, city);
    const after = h.ctx.sources.filter((s) => s.name.startsWith('bed.ambient')).length;
    const names = [...new Set(h.ctx.sources.map((s) => s.name))].join(',');
    console.log(`AMBIENT before=${before} after=${after} level=${h.engine.bedLevel('ambient')}`);
    console.log(`AMBIENT NAMES ${names}`);
    expect(after).toBeGreaterThan(before);

    // And the room it left has to be *told* to stop. A new bed appearing while the old one keeps
    // looping is not a switch, it is an accumulation: two cities, then three.
    const ambient = h.ctx.sources.filter((source) => source.name.startsWith('bed.ambient'));
    const left = ambient.filter((source) => source.name === 'bed.ambient.room:loop');
    expect(left.length, 'the room that left is still running').toBe(1);
    expect(left[0]?.stopCalls.length, 'nothing was scheduled to end it').toBeGreaterThan(0);

    for (const profileId of ['rain-window', 'mountain-air', 'city-night']) {
      h.run(16, makeState({ ambientProfileId: profileId, ambientGain: 1 }));
    }
    const settled = h.ctx.sources.filter((source) => source.name.startsWith('bed.ambient'));
    console.log(
      `AMBIENT after four rooms live=${String(settled.filter((x) => !x.stopCalls.length).length)}`,
    );
    expect(settled.filter((source) => !source.stopCalls.length).length).toBeLessThanOrEqual(4);
    h.engine.dispose();
  });
});

describe('the hand lifting the rod is heard (§26)', () => {
  const cueNames = (events: ((h: ReturnType<typeof createHarness>) => void)[]): string[] => {
    const h = createHarness({ profiles: PROFILES });
    h.run(200, makeState({ ambientGain: 0 }));
    for (const fire of events) fire(h);
    const names = h.ctx.sources
      .map((source) => source.name)
      .filter((name) => name.startsWith('cue.'));
    h.engine.dispose();
    return [...new Set(names.map((n) => n.split(':')[0] ?? n))];
  };

  const lift = (h: ReturnType<typeof createHarness>): void =>
    h.fire({ kind: 'transition', atMs: 200, from: 'IDLE', to: 'PICKED_UP' }, makeState());

  it('makes a sound when the rod leaves the table', () => {
    const built = cueNames([lift]);
    console.log(`LIFT ${built.join(',')}`);
    expect(built.length, 'the rod lifted in silence').toBeGreaterThan(0);
  });

  it('does not make one for a transition that is not a lift', () => {
    // The claim only means something if it is the *lift* that is audible. If every transition fired,
    // this file would be reporting a sound the design says must not exist.
    expect(
      cueNames([
        (h) =>
          h.fire({ kind: 'transition', atMs: 200, from: 'BURNING', to: 'RESTING' }, makeState()),
      ]),
    ).toEqual([]);
  });

  it('asks the scene what the surface is, rather than assuming the table', () => {
    const declared = makeState({ surfaceProfileId: 'surface-concrete' });
    expect(store.resolve('surface', declared).id).toBe('surface-concrete');
    // A scene that names a profile the bundle does not have still resolves to the table rather than
    // throwing (§63), and an undeclared scene resolves to the content's own `surface-table` — not to
    // whichever entry sorts first, which is the distinction the tray case above had to learn.
    const missing = makeState({ surfaceProfileId: 'surface-nowhere' });
    expect(store.resolve('surface', missing).id).toBe('surface-table');
    expect(store.resolve('surface', makeState()).id).toBe('surface-table');
  });
});
