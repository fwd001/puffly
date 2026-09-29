/**
 * The claim behind SPEC.md §78/§79/§86 is that a desktop shell reuses this renderer instead of
 * rewriting it. That is only true if the renderer needs nothing browser-shaped, so this file
 * takes `document` and `window` away and renders a whole break anyway.
 *
 * If a future change reaches for a DOM global, this stops passing — which is the point: the
 * reuse story is a tested property, not a paragraph.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  createDefaultSettings,
  createEngine,
  type GameInput,
  type InputTarget,
} from '@puffly/game-core';
import { DEFAULT_CONTENT, DEFAULT_IDS } from '@puffly/game-content';
import { createCanvasRenderer } from '../renderer';
import { createFakeCanvas, fakeSprite } from './fakeCanvas';

const removed: Array<['document' | 'window' | 'navigator', PropertyDescriptor | undefined]> = [];

function hideTheBrowser(): void {
  for (const name of ['document', 'window', 'navigator'] as const) {
    removed.push([name, Object.getOwnPropertyDescriptor(globalThis, name)]);
    // Removing the global is the point of the test; TypeScript permits it here.
    delete globalThis[name];
  }
}

function bringItBack(): void {
  for (const [name, descriptor] of removed.splice(0).reverse()) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}

describe('the renderer is platform-free enough to be reused (§78, §79, §86)', () => {
  afterEach(bringItBack);

  it('renders a complete break with no document and no window', () => {
    hideTheBrowser();
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');

    const engine = createEngine({
      content: DEFAULT_CONTENT,
      seed: 4711,
      wallClockMs: Date.UTC(2026, 8, 29, 23, 5, 0),
      settings: createDefaultSettings(0),
      ...DEFAULT_IDS,
    });

    const fake = createFakeCanvas();
    const renderer = createCanvasRenderer({
      ctx: fake.ctx,
      width: 700,
      height: 900,
      dpr: 2,
      // A desktop shell supplies its own sprite surface; nothing here calls document.createElement.
      sprites: { size: 16, soft: () => fakeSprite(16), clear: () => undefined },
    });
    engine.on((event) => renderer.handleEvent(event));

    const aim = (target: InputTarget, type: GameInput['type']): void => {
      const anchors = engine.getState().anchors;
      const point =
        target === 'lighter'
          ? anchors.lighter
          : target === 'ash'
            ? anchors.ash
            : target === 'ashtray'
              ? anchors.ashtray
              : anchors.body;
      engine.send({ type, x: point.x, y: point.y, timestamp: engine.getState().nowMs, target });
    };

    aim('cigarette', 'tap');
    engine.advance(40);
    aim('lighter', 'tap');
    engine.advance(2500);
    expect(engine.getState().cigarette.state).toBe('BURNING');

    for (let i = 0; i < 6; i++) {
      aim('cigarette', 'hold');
      engine.advance(500);
      renderer.render(engine.getState(), 500);
      aim('cigarette', 'release');
      engine.advance(500);
      renderer.render(engine.getState(), 500);
    }

    aim('ash', 'tap');
    engine.advance(800);
    renderer.render(engine.getState(), 800);
    aim('ashtray', 'hold');
    engine.advance(1500);
    renderer.render(engine.getState(), 1500);
    aim('ashtray', 'release');
    engine.advance(1500);
    renderer.render(engine.getState(), 1500);

    const state = engine.getState();
    expect(['EXTINGUISHED', 'DISCARDED', 'IDLE']).toContain(state.cigarette.state);
    expect(fake.count('drawImage')).toBeGreaterThan(0);
    expect(fake.count('fillRect')).toBeGreaterThan(0);
    expect(renderer.particleCount()).toBeGreaterThanOrEqual(0);

    renderer.dispose();
  });
});
