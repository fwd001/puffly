/**
 * The scene layer: state in, picture out. It reads `GameStateView` and never writes back, which is
 * the same contract the Canvas 2D renderer had — the seam the shell already depends on.
 */
export { createPufflyRenderer, type RendererChoice } from './renderer';
export {
  AIM_KEYS,
  parseAim,
  rodBetween,
  toWorld,
  WORLD_HEIGHT,
  type AimKey,
  type AimPoint,
} from './stage';
