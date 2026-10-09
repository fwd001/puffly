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
export { roomBackdrop, type RoomBackdrop } from './room';
export { radialVignette, softDisc, solidDisc } from './sprite';
export { puffDiameterWorld } from './plume';
export { layoutText, parseAtlas, type GlyphAtlas, type GlyphQuad, type TextLayout } from './text';
export { createPufflyRenderer, type RendererChoice } from './renderer';
export {
  AIM_KEYS,
  stageToWorld,
  stageUnitToWorld,
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
