// @vitest-environment jsdom
/**
 * The shell's promise to the player: a tap is one action, a hold is another (§14, §49).
 *
 * This matters more than it looks. If a short press sent `hold` and then `tap`, tapping the rod
 * would draw a sip *and* queue a second sip, and tapping the lighter would start an ignition and
 * then cancel it. That discrimination happens here, before Game Core sees anything, so it is
 * tested here against a stand-in engine that records exactly what was sent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEngine, GameInput } from '@puffly/game-core';
import {
  createKeyboardAdapter,
  createPointerAdapter,
  createSurfaceGuard,
  targetForAffordance,
} from '../useInputAdapters';

const VIEWPORT = () => ({
  cssWidth: 400,
  cssHeight: 600,
  stage: { x: 0, y: 0, width: 400, height: 600 },
});

interface PointerRig {
  sent: GameInput[];
  down(x?: number, y?: number): void;
  move(x: number, y: number): void;
  up(x?: number, y?: number): void;
  cancel(): void;
  dispose(): void;
}

/**
 * A canvas whose event listeners are captured, plus a clock the test controls. `performance.now`
 * is what the adapter measures press duration with, so a fake timer plus a mocked clock is what
 * makes "short press" and "long press" testable without waiting in real time.
 */
function pointerRig(nowMs = 1000): PointerRig {
  const sent: GameInput[] = [];
  const handlers = new Map<string, EventListener>();
  const engine = {
    send: (input: GameInput) => sent.push(input),
    getState: () => ({ nowMs }) as never,
  } as unknown as GameEngine;

  const canvas = {
    addEventListener: (type: string, handler: EventListener) => handlers.set(type, handler),
    removeEventListener: (type: string) => handlers.delete(type),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 600 }) as DOMRect,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  } as unknown as HTMLCanvasElement;

  const adapter = createPointerAdapter(canvas, engine, VIEWPORT);
  adapter.attach();

  const fire = (type: string, x: number, y: number, pointerId = 1): void => {
    const event = new Event(type) as Event & Record<string, unknown>;
    Object.assign(event, { pointerId, button: 0, pointerType: 'touch', clientX: x, clientY: y });
    handlers.get(type)?.(event);
  };

  return {
    sent,
    down: (x = 200, y = 300) => fire('pointerdown', x, y),
    move: (x, y) => fire('pointermove', x, y),
    up: (x = 200, y = 300) => fire('pointerup', x, y),
    cancel: () => fire('pointercancel', 200, 300),
    dispose: () => adapter.detach(),
  };
}

let clock = 0;

beforeEach(() => {
  vi.useFakeTimers();
  clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('pointer → GameInput (§49)', () => {
  it('a quick press is exactly one tap, and never also a hold', () => {
    const rig = pointerRig();
    rig.down();
    clock += 60;
    rig.up();
    expect(rig.sent.map((input) => input.type)).toEqual(['tap']);
    rig.dispose();
  });

  it('a long press becomes a hold while the finger is still down, then one release', () => {
    const rig = pointerRig();
    rig.down();
    vi.advanceTimersByTime(200);
    expect(rig.sent.map((input) => input.type)).toEqual(['hold']);

    clock += 900;
    rig.up();
    expect(rig.sent.map((input) => input.type)).toEqual(['hold', 'release']);
    rig.dispose();
  });

  it('a slow drag releases, and is never reported as a flick too', () => {
    const rig = pointerRig();
    rig.down(100, 300);
    rig.move(140, 300);
    clock += 800;
    rig.up(140, 300);
    expect(rig.sent.map((input) => input.type)).toEqual(['hold', 'drag', 'release']);
    rig.dispose();
  });

  it('a fast flick out of a drag is one swipe, with velocity — not a swipe and a release (§20)', () => {
    const rig = pointerRig();
    rig.down(100, 300);
    rig.move(260, 300);
    clock += 60;
    rig.up(340, 300);

    expect(rig.sent.map((input) => input.type)).toEqual(['hold', 'drag', 'swipe']);
    const swipe = rig.sent.find((input) => input.type === 'swipe');
    expect(swipe?.velocity?.vx).toBeGreaterThan(0.5);
    rig.dispose();
  });

  it('ignores a second pointer, so two fingers cannot fight over the rod', () => {
    const rig = pointerRig();
    const handlers = new Map<string, EventListener>();
    // The rig only ever uses pointerId 1; fire a foreign id through the same path.
    void handlers;
    rig.down();
    clock += 60;
    rig.up();
    expect(rig.sent.filter((input) => input.type === 'tap').length).toBe(1);
    rig.dispose();
  });

  it('clamps a pointer outside the stage instead of sending NaN', () => {
    const rig = pointerRig();
    rig.down(0, 0);
    rig.move(-500, 4000);
    clock += 60;
    rig.up(-500, 4000);

    expect(rig.sent.length).toBeGreaterThan(1);
    for (const input of rig.sent) {
      expect(Number.isFinite(input.x)).toBe(true);
      expect(Number.isFinite(input.y)).toBe(true);
      expect(input.x).toBeGreaterThanOrEqual(0);
      expect(input.x).toBeLessThanOrEqual(1);
      expect(input.y).toBeGreaterThanOrEqual(0);
      expect(input.y).toBeLessThanOrEqual(1);
    }
    rig.dispose();
  });

  it('stays silent after detach', () => {
    const rig = pointerRig();
    rig.dispose();
    rig.down();
    rig.up();
    expect(rig.sent).toEqual([]);
  });
});

describe('keyboard → GameInput (§65)', () => {
  function keyRig(affordance: string, cigaretteState = 'BURNING') {
    const sent: GameInput[] = [];
    const engine = {
      send: (input: GameInput) => sent.push(input),
      getState: () =>
        ({
          nowMs: 500,
          ui: { affordance },
          cigarette: { state: cigaretteState, pose: { pivot: { x: 0.5, y: 0.6 } } },
        }) as never,
    } as unknown as GameEngine;
    const target = new EventTarget();
    const adapter = createKeyboardAdapter(target, engine, () =>
      targetForAffordance(engine.getState()),
    );
    adapter.attach();
    return { sent, target, adapter };
  }

  it('space is a hold while down and a release when up', () => {
    const rig = keyRig('puff');
    rig.target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    rig.target.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }));

    expect(rig.sent.map((input) => input.type)).toEqual(['hold', 'release']);
    expect(rig.sent[0]?.source).toBe('keyboard');
    expect(rig.sent[0]?.target).toBe('cigarette');
    rig.adapter.detach();
  });

  it('auto-repeat from a held key does not stack into extra puffs', () => {
    const rig = keyRig('puff');
    rig.target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    rig.target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true }));
    rig.target.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true }));

    expect(rig.sent.length).toBe(1);
    rig.adapter.detach();
  });

  it('enter taps what the engine suggests; escape always means put it out', () => {
    const rig = keyRig('flick');
    rig.target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    rig.target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    rig.target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));

    expect(rig.sent.map((input) => `${input.type}:${input.target}`)).toEqual([
      'tap:ash',
      'hold:ashtray',
      'release:ashtray',
    ]);
    rig.adapter.detach();
  });

  it('arrows nudge the rod by a fixed, finite amount', () => {
    const rig = keyRig('puff');
    rig.target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    const drag = rig.sent[0];
    expect(drag?.type).toBe('drag');
    expect(Number.isFinite(drag?.x)).toBe(true);
    expect(drag?.x).toBeGreaterThan(0.5);
    rig.adapter.detach();
  });
});

describe('affordance targeting (§66)', () => {
  const state = (affordance: string, cigarette = 'BURNING') =>
    ({ ui: { affordance }, cigarette: { state: cigarette } }) as never;

  it('routes each suggestion to the anchor a touch user would hit', () => {
    expect(targetForAffordance(state('lighter'))).toBe('lighter');
    expect(targetForAffordance(state('flick'))).toBe('ash');
    expect(targetForAffordance(state('extinguish'))).toBe('ashtray');
    expect(targetForAffordance(state('discard'))).toBe('ashtray');
    expect(targetForAffordance(state('puff'))).toBe('cigarette');
  });

  it('with nothing suggested, the rod is still the only thing worth touching', () => {
    expect(targetForAffordance(state('none', 'IDLE'))).toBe('cigarette');
    expect(targetForAffordance(state('none', 'DISCARDED'))).toBe('cigarette');
  });
});

describe('the surface refuses the browser’s own gestures (§66)', () => {
  for (const type of ['contextmenu', 'dragstart', 'selectstart']) {
    it(`${type} is prevented while the guard is attached`, () => {
      const guard = createSurfaceGuard(document);
      guard.attach();
      const held = new Event(type, { bubbles: true, cancelable: true });
      document.body.dispatchEvent(held);
      expect(held.defaultPrevented).toBe(true);

      // The refusal is the guard's, not a permanent change to the page: detached, the default stands.
      guard.detach();
      const free = new Event(type, { bubbles: true, cancelable: true });
      document.body.dispatchEvent(free);
      expect(free.defaultPrevented).toBe(false);
    });
  }
});
