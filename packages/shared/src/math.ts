/** Small pure math helpers shared by every layer. */

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const clamp01 = (value: number): number => clamp(value, 0, 1);

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

export const invLerp = (from: number, to: number, value: number): number =>
  to === from ? 0 : clamp01((value - from) / (to - from));

export const mapRange = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => lerp(outMin, outMax, invLerp(inMin, inMax, value));

/** Classic Hermite smoothing — used for anything that must not feel linear (§59). */
export const smoothstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);

export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;

/** Exponential approach that is stable for any frame time (§54: deltaTime driven). */
export const approach = (current: number, target: number, rate: number, dtMs: number): number =>
  current + (target - current) * (1 - Math.exp(-rate * (dtMs / 1000)));

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

export const roundTo = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const sum = (values: readonly number[]): number => {
  let total = 0;
  for (const value of values) total += value;
  return total;
};

export const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : sum(values) / values.length;

export interface Point {
  x: number;
  y: number;
}

export const point = (x: number, y: number): Point => ({ x, y });

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export const lerpPoint = (a: Point, b: Point, t: number): Point => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
});
