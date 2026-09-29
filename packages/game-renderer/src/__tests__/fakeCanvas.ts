/**
 * A recording stand-in for `CanvasRenderingContext2D`.
 *
 * The renderer must be testable without a real canvas (§72) and without pulling in a
 * native canvas package (§75), so this records the calls it was given. Anything the
 * renderer is not written to call is simply absent, which is also how a typo shows up as
 * a test failure instead of a silent pass.
 */

export interface FakeGradient {
  addColorStop(offset: number, color: string): void;
  readonly stops: { offset: number; color: string }[];
}

export interface FakeCall {
  name: string;
  args: unknown[];
}

export interface FakeCanvas {
  ctx: CanvasRenderingContext2D;
  calls: FakeCall[];
  gradients: FakeGradient[];
  count(name: string): number;
  names(): string[];
  reset(): void;
}

export function createFakeCanvas(): FakeCanvas {
  const calls: FakeCall[] = [];
  const gradients: FakeGradient[] = [];

  const record =
    (name: string) =>
    (...args: unknown[]): unknown => {
      calls.push({ name, args });
      if (name === 'createLinearGradient' || name === 'createRadialGradient') {
        const gradient: FakeGradient = {
          stops: [],
          addColorStop(offset, color) {
            gradient.stops.push({ offset, color });
          },
        };
        gradients.push(gradient);
        return gradient;
      }
      return undefined;
    };

  const state = {
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    strokeStyle: '' as string | CanvasGradient | CanvasPattern,
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over' as string,
  };

  const target = new Map<string, unknown>();
  const methods = [
    'setTransform',
    'clearRect',
    'save',
    'restore',
    'translate',
    'rotate',
    'scale',
    'beginPath',
    'moveTo',
    'lineTo',
    'quadraticCurveTo',
    'bezierCurveTo',
    'closePath',
    'fill',
    'stroke',
    'fillRect',
    'strokeRect',
    'arc',
    'ellipse',
    'rect',
    'drawImage',
    'createLinearGradient',
    'createRadialGradient',
    'createPattern',
    'clip',
    'setLineDash',
  ];
  for (const name of methods) target.set(name, record(name));

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_object, property: string) {
      if (target.has(property)) return target.get(property);
      if (property in state) return state[property as keyof typeof state];
      return undefined;
    },
    set(_object, property: string, value: unknown) {
      if (property in state) {
        state[property as keyof typeof state] = value as never;
        calls.push({ name: `set:${property}`, args: [value] });
        return true;
      }
      target.set(property, value);
      return true;
    },
    has(_object, property: string) {
      return target.has(property) || property in state;
    },
  };

  const ctx = new Proxy(
    {} as Record<string, unknown>,
    handler,
  ) as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    calls,
    gradients,
    count(name) {
      return calls.filter((call) => call.name === name).length;
    },
    names() {
      return [...new Set(calls.map((call) => call.name))];
    },
    reset() {
      calls.length = 0;
      gradients.length = 0;
    },
  };
}

/** Cheap sprite stand-in: the renderer only ever needs its size. */
export function fakeSprite(size = 32): CanvasImageSource & { width: number; height: number } {
  return { width: size, height: size } as unknown as CanvasImageSource & {
    width: number;
    height: number;
  };
}

/**
 * The §48 rule, made executable: hand the renderer something that throws on any write.
 * Strict-mode assignment to a frozen object is a TypeError, so a single mutation inside the
 * renderer turns into a failing test rather than a corrupted simulation.
 */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}
