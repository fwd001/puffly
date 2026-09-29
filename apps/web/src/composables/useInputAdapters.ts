/**
 * Input adapters — SPEC.md §49, §55, §65, §66.
 *
 * Pointer events and the keyboard are reduced to `GameInput` here and nowhere else, so
 * Game Core never sees a browser event. Tap vs hold is decided *before* anything is sent:
 * a short press is one tap, a long press becomes a hold while the finger is still down.
 * That discrimination is what stops a tap from meaning "a sip and then another sip".
 */

import {
  TIMING,
  type GameEngine,
  type GameInput,
  type InputTarget,
  type GameStateView,
} from '@puffly/game-core';

export interface InputAdapter {
  attach(): void;
  detach(): void;
}

interface PressState {
  id: number;
  startedAtMs: number;
  start: { x: number; y: number };
  last: { x: number; y: number };
  holdSent: boolean;
  moved: boolean;
}

/** Stage box: the renderer letterboxes the stage, so raw canvas pixels must be mapped back. */
function toStagePoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  viewport: {
    cssWidth: number;
    cssHeight: number;
    stage: { x: number; y: number; width: number; height: number };
  },
): { x: number; y: number } {
  const scaleX = viewport.cssWidth > 0 ? rect.width / viewport.cssWidth : 1;
  const scaleY = viewport.cssHeight > 0 ? rect.height / viewport.cssHeight : 1;
  const canvasX = (clientX - rect.left) / scaleX;
  const canvasY = (clientY - rect.top) / scaleY;
  return {
    x: (canvasX - viewport.stage.x) / Math.max(1, viewport.stage.width),
    y: (canvasY - viewport.stage.y) / Math.max(1, viewport.stage.height),
  };
}

const clampUnit = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export function createPointerAdapter(
  canvas: HTMLCanvasElement,
  engine: GameEngine,
  readViewport: () => {
    cssWidth: number;
    cssHeight: number;
    stage: { x: number; y: number; width: number; height: number };
  },
): InputAdapter {
  let press: PressState | null = null;

  const send = (input: GameInput) => engine.send(input);

  const onDown = (event: PointerEvent): void => {
    if (event.button !== undefined && event.button > 0) return;
    const point = toStagePoint(
      event.clientX,
      event.clientY,
      canvas.getBoundingClientRect(),
      readViewport(),
    );
    press = {
      id: event.pointerId,
      startedAtMs: performance.now(),
      start: point,
      last: point,
      holdSent: false,
      moved: false,
    };
    canvas.setPointerCapture?.(event.pointerId);
    // Long-press threshold: past it, the press *is* a hold and the app reacts while held.
    window.setTimeout(() => {
      if (press && press.id === event.pointerId && !press.holdSent) {
        press.holdSent = true;
        send({
          type: 'hold',
          x: clampUnit(press.last.x),
          y: clampUnit(press.last.y),
          timestamp: engine.getState().nowMs,
          source: event.pointerType === 'touch' ? 'touch' : 'mouse',
        });
      }
    }, TIMING.tapMaxMs);
  };

  const onMove = (event: PointerEvent): void => {
    if (!press || press.id !== event.pointerId) return;
    const point = toStagePoint(
      event.clientX,
      event.clientY,
      canvas.getBoundingClientRect(),
      readViewport(),
    );
    const travelled = Math.hypot(point.x - press.start.x, point.y - press.start.y);
    if (!press.holdSent && travelled > 0.02) {
      // A drag is a hold with motion; the rod must follow the finger from here on (§20).
      press.holdSent = true;
      press.moved = true;
      send({
        type: 'hold',
        x: clampUnit(point.x),
        y: clampUnit(point.y),
        timestamp: engine.getState().nowMs,
        source: 'mouse',
      });
    }
    if (press.holdSent) {
      if (travelled > 0.004) press.moved = true;
      send({
        type: 'drag',
        x: clampUnit(point.x),
        y: clampUnit(point.y),
        timestamp: engine.getState().nowMs,
        source: 'mouse',
      });
    }
    press.last = point;
  };

  const onUp = (event: PointerEvent): void => {
    if (!press || press.id !== event.pointerId) return;
    const heldMs = performance.now() - press.startedAtMs;
    const point = toStagePoint(
      event.clientX,
      event.clientY,
      canvas.getBoundingClientRect(),
      readViewport(),
    );
    const velocity = {
      vx: (point.x - press.start.x) / Math.max(0.05, heldMs / 1000),
      vy: (point.y - press.start.y) / Math.max(0.05, heldMs / 1000),
    };
    const speed = Math.hypot(velocity.vx, velocity.vy);

    if (!press.holdSent) {
      // Never reached the hold threshold: one input, and the rod sees a tap or a flick.
      send({
        type: press.moved && speed > 0.3 ? 'swipe' : 'tap',
        x: clampUnit(point.x),
        y: clampUnit(point.y),
        timestamp: engine.getState().nowMs,
        source: event.pointerType === 'touch' ? 'touch' : 'mouse',
        ...(press.moved ? { velocity } : {}),
      });
    } else if (press.moved && speed > 0.6) {
      // A flick out of a drag *is* the §20 gesture: swipe, and no separate release. Game Core
      // ends the drag when it sees a swipe, so sending both would be the same action twice.
      send({
        type: 'swipe',
        x: clampUnit(point.x),
        y: clampUnit(point.y),
        timestamp: engine.getState().nowMs,
        source: 'mouse',
        velocity,
      });
    } else {
      send({
        type: 'release',
        x: clampUnit(point.x),
        y: clampUnit(point.y),
        timestamp: engine.getState().nowMs,
        source: 'mouse',
      });
    }

    canvas.releasePointerCapture?.(event.pointerId);
    press = null;
  };

  const onCancel = (event: PointerEvent): void => {
    if (!press || press.id !== event.pointerId) return;
    send({
      type: 'release',
      x: clampUnit(press.last.x),
      y: clampUnit(press.last.y),
      timestamp: engine.getState().nowMs,
      source: 'mouse',
    });
    press = null;
  };

  return {
    attach() {
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onCancel);
    },
    detach() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      press = null;
    },
  };
}

/**
 * Keyboard, mouse-only shells and future global shortcuts (SPEC.md §65, §67). The player is
 * never told these keys exist: the affordance the engine suggests is what the keys act on.
 */
export function createKeyboardAdapter(
  target: EventTarget,
  engine: GameEngine,
  affordanceTarget: () => InputTarget,
): InputAdapter {
  const keysDown = new Set<string>();

  const send = (
    type: GameInput['type'],
    aim: InputTarget,
    velocity?: { vx: number; vy: number },
  ) => {
    engine.send({
      type,
      x: 0,
      y: 0,
      timestamp: engine.getState().nowMs,
      target: aim,
      source: 'keyboard',
      ...(velocity ? { velocity } : {}),
    });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    const state: GameStateView = engine.getState();
    switch (event.key) {
      case ' ':
      case 'Enter': {
        event.preventDefault();
        keysDown.add(event.key);
        // Space is the sustained action, Enter the decisive tap; both aim at what the
        // engine says the player is most likely about to do (§28).
        if (event.key === ' ') send('hold', affordanceTarget());
        else send('tap', affordanceTarget());
        break;
      }
      case 'Escape': {
        event.preventDefault();
        keysDown.add(event.key);
        // Escape always means "put it out", from any state (§65).
        if (state.cigarette.state === 'IDLE' || state.cigarette.state === 'PICKED_UP')
          send('tap', 'cigarette');
        else send('hold', 'ashtray');
        break;
      }
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        event.preventDefault();
        const stepX = event.key === 'ArrowLeft' ? -0.05 : event.key === 'ArrowRight' ? 0.05 : 0;
        const stepY = event.key === 'ArrowUp' ? -0.05 : event.key === 'ArrowDown' ? 0.05 : 0;
        const pivot = state.cigarette.pose.pivot;
        engine.send({
          type: 'drag',
          x: clampUnit(pivot.x + stepX),
          y: clampUnit(pivot.y + stepY),
          timestamp: state.nowMs,
          source: 'keyboard',
        });
        break;
      }
      case 'Tab': {
        // Cycling never blocks the game; the browser's own focus ring does the talking.
        break;
      }
      default:
        break;
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (!keysDown.delete(event.key)) return;
    if (event.key === ' ') send('release', affordanceTarget());
    if (event.key === 'Escape') send('release', 'ashtray');
  };

  const node = target;
  return {
    attach() {
      node.addEventListener('keydown', onKeyDown as EventListener);
      node.addEventListener('keyup', onKeyUp as EventListener);
    },
    detach() {
      node.removeEventListener('keydown', onKeyDown as EventListener);
      node.removeEventListener('keyup', onKeyUp as EventListener);
      keysDown.clear();
    },
  };
}

/** Where each suggested affordance lives, so keyboard and touch hit the same thing (§66). */
export function targetForAffordance(state: GameStateView): InputTarget {
  switch (state.ui.affordance) {
    case 'lighter':
      return 'lighter';
    case 'flick':
      return 'ash';
    case 'extinguish':
    case 'discard':
      return 'ashtray';
    case 'puff':
      return 'cigarette';
    default:
      // Even with nothing suggested, the rod is the only object worth aiming at first: it is
      // what the player has to be holding before a lighter means anything (§0).
      return 'cigarette';
  }
}
