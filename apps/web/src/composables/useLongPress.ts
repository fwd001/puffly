/**
 * The handshake every card and mark shares: a tap means "use this", a 0.6 s hold means "tell me
 * about this" (§ archive.invoke — mobile holds, desktop hovers, and both are the same threshold).
 *
 * It lives here rather than in each component because the number is a design decision, and the
 * second copy of it is the one that quietly drifts the first time somebody retunes the first.
 */

export const ARCHIVE_HOLD_MS = 600;

export interface HoldHandlers {
  onPointerDown(): void;
  onPointerUp(): void;
  onPointerLeave(): void;
  onPointerCancel(): void;
  onPointerEnter(event: PointerEvent): void;
  onClick(): void;
}

export function useLongPress(onLongPress: () => void, onTap: () => void): HoldHandlers {
  let timer = 0;
  let held = false;

  const start = (): void => {
    window.clearTimeout(timer);
    held = false;
    timer = window.setTimeout(() => {
      held = true;
      onLongPress();
    }, ARCHIVE_HOLD_MS);
  };

  const cancel = (): void => {
    window.clearTimeout(timer);
  };

  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onPointerEnter: (event: PointerEvent) => {
      // A resting pointer on a desktop asks the same question a held finger does (§ platform.input).
      if (event.pointerType === 'mouse') start();
    },
    onClick: () => {
      // The click that follows a held pointer must not also fire the tap behind it.
      if (held) {
        held = false;
        return;
      }
      onTap();
    },
  };
}
