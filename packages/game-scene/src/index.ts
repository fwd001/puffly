/**
 * The scene layer: state in, picture out. It reads `GameStateView` and never writes back, which is
 * the same contract the Canvas 2D renderer had — the seam the shell already depends on.
 */
export {
  LIGHTER_SIZE,
  PACK_SIZE,
  TRAY_FLATTEN,
  ashtrayRadiusWorld,
  parsePropScale,
  toWorldSize,
} from './props';
export { PLUME_DRAG, isAlight, plumeSpawn, type PlumePlace } from './plume';
export { createPufflyRenderer, type RendererChoice } from './renderer';
export {
  AIM_KEYS,
  stageToWorld,
  parseAim,
  rodBetween,
  toWorld,
  WORLD_HEIGHT,
  canvasToWorld,
  parseStageBox,
  rodBetweenInBox,
  stageWorldSize,
  type StageBox,
  type AimKey,
  type AimPoint,
} from './stage';
