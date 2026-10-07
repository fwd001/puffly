/**
 * The cherry's light and the burn's hiss have to be the same number — SPEC.md §26, §27, and the
 * sentence the brief hands to both adapters: 声音是一定要跟画面连接的.
 *
 * `EmberState.flicker` was documented as the thing that keeps the ember from looking mechanical
 * (§59) and was read by nothing. Five places re-derived the ember's heat instead — two in the audio
 * engine, three in the renderer — with three different flare coefficients (0.45 in the core, 0.5 in
 * the audio and in `props.ts`, 0.6 in the cherry halo). So the picture could only ever wobble on a
 * number the sound never saw, and the two could drift without any test noticing.
 *
 * This file is the layer that can see both: the same `GameStateView` goes to the real renderer and
 * to the real bed targets, and the claim is that one field moves them together.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { emberPresence, type GameStateView } from '@puffly/game-core';
import { createCanvasRenderer } from '@puffly/game-renderer';
import { bedTargets } from '../packages/game-audio/src/beds';
import { makeState } from '../packages/game-audio/src/__tests__/fixture';
import { createHarness } from '../packages/game-audio/src/__tests__/harness';
import {
  createFakeCanvas,
  fakeSprite,
  type FakeGradient,
} from '../packages/game-renderer/src/__tests__/fakeCanvas';
import { harness } from '../packages/game-core/src/__tests__/harness';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const STEP = Math.ceil(1000 / 60);

/** A lit rod in the air, so both the halo and the spill are drawn. */
function emberView(flicker: number): GameStateView {
  const h = harness({ content: DEFAULT_CONTENT, environmentId: 'neon-street' });
  const view = h.state() as GameStateView;
  const mutable = view as unknown as {
    cigarette: {
      ember: {
        brightness: number;
        flare: number;
        flicker: number;
        temperature: number;
        glowRadius: number;
        lit: boolean;
      };
      pose: { visible: boolean };
    };
    anchors: { ember: { x: number; y: number } };
  };
  mutable.cigarette.ember.brightness = 0.7;
  mutable.cigarette.ember.flare = 0;
  mutable.cigarette.ember.flicker = flicker;
  mutable.cigarette.ember.temperature = 0.6;
  mutable.cigarette.ember.glowRadius = 0.06;
  mutable.cigarette.ember.lit = true;
  mutable.cigarette.pose.visible = true;
  mutable.anchors.ember = { x: 0.5, y: 0.4 };
  return view;
}

/** Every gradient alpha the frame baked, added up. */
function drawnAlphas(view: GameStateView): number {
  const fake = createFakeCanvas();
  const renderer = createCanvasRenderer({
    ctx: fake.ctx,
    width: 900,
    height: 1200,
    dpr: 2,
    sprites: { size: 16, soft: () => fakeSprite(16), clear: () => undefined },
  });
  renderer.render(view, STEP);
  renderer.dispose();
  return fake.gradients.reduce(
    (sum, gradient: FakeGradient) =>
      sum +
      gradient.stops.reduce((inner, stop) => {
        const parts = String(stop.color).match(/rgba?\([^)]*\)/);
        const pieces = (parts?.[0] ?? '').replace(/[^\d.,]/g, '').split(',');
        return inner + Number(pieces[3] ?? pieces[2] ?? 0);
      }, 0),
    0,
  );
}

describe('the ember the player sees is the ember the player hears (§26)', () => {
  it('drives the burn bed off the shared number, exactly', () => {
    for (const flicker of [-1, -0.4, 0, 0.6, 1]) {
      const state = makeState({ brightness: 0.7, flare: 0.1, flicker });
      const presence = emberPresence(state.cigarette.ember);
      expect(bedTargets(state, false).ember.gain, `flicker=${String(flicker)}`).toBeCloseTo(
        presence,
        12,
      );
    }
  });

  it('draws the cherry with the same breath the burn bed is given', () => {
    const dim = drawnAlphas(emberView(-1));
    const hot = drawnAlphas(emberView(1));
    const step =
      emberPresence({ brightness: 0.7, flare: 0, flicker: 1 }) -
      emberPresence({ brightness: 0.7, flare: 0, flicker: -1 });
    // The ember path paints five alphas off `total` (char 0.35 and 0.55, cherry 0.5 and 0.15,
    // halo 0.16), so the frame's ink should move by that coefficient sum for each unit of presence.
    // Measured: 2.95. Pinning the ratio — not just the direction — is the point: with a sum, one
    // site obeying the number satisfies "it went up", and re-inlining the other two stayed green.
    const ratio = (hot - dim) / step;
    console.log(
      `EMBER ink ${dim.toFixed(3)} -> ${hot.toFixed(3)} per presence ${ratio.toFixed(3)}`,
    );
    expect(ratio).toBeGreaterThan(2.8);
    expect(ratio).toBeLessThan(3.1);
  });

  it('and the graph follows, not only the target', () => {
    const h = createHarness();
    h.run(4000, makeState({ brightness: 0.7, flare: 0, flicker: -1 }));
    const low = h.engine.bedLevel('ember');
    h.run(4000, makeState({ brightness: 0.7, flare: 0, flicker: 1 }));
    const high = h.engine.bedLevel('ember');
    console.log(`EMBER bedLevel ${low.toFixed(4)} -> ${high.toFixed(4)}`);
    expect(high).toBeGreaterThan(low);
    expect(high - low).toBeGreaterThan(0.05);
  });

  it('leaves no adapter holding its own copy of the formula', () => {
    // The structural half: three flare coefficients in one game is how the picture and the sound
    // drift apart without anything failing. Positive control below, because a scan that matches
    // nothing passes forever.
    // No `/g`: `test()` on a global regex advances `lastIndex`, so the second file scanned would be
    // searched from wherever the first one stopped.
    const rederive = /ember\.brightness\s*\+/;
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const at = join(dir, entry);
        if (entry === '__tests__' || entry.startsWith('.')) continue;
        if (statSync(at).isDirectory()) walk(at);
        else if (at.endsWith('.ts')) files.push(at);
      }
    };
    for (const pkg of ['packages/game-renderer/src', 'packages/game-audio/src']) {
      walk(resolve(root, pkg));
    }
    expect(files.length, 'the adapter sources this scan walks').toBeGreaterThan(20);

    const offenders = files
      .filter((file) => rederive.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(root.length + 1));
    console.log(`EMBER rederive offenders=${offenders.join(',') || 'none'}`);
    expect(offenders).toEqual([]);
    // The positive control: the very pattern above must be reported by the text it is meant to
    // forbid, in the file that is allowed to hold it.
    expect(rederive.test('const t = clamp01(ember.brightness + ember.flare * 0.5);')).toBe(true);
  });
});
