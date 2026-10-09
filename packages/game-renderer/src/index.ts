/**
 * The renderer seam — SPEC.md §45, §48, §79.
 *
 * Game Core emits numbers; this package turns them into light. A desktop shell can take
 * the same `createCanvasRenderer` and point it at a transparent canvas window without
 * touching a line of game logic (§79, §86).
 */

export { MAX_SMOKE_RADIUS_PX } from './renderer';
export {
  createCanvasRenderer,
  type CanvasRendererOptions,
  type PufflyRenderer,
  type RendererSettings,
  clearBackgroundCache,
} from './renderer';

export { createViewport, type Viewport, type StageRect } from './viewport';
export { ParticlePool, type Particle, type PlumeLayer, type SpawnInit } from './particles';
export {
  budgetFor as defaultParticleBudget,
  FIELD_SCALE,
  intakeBurst,
  type IntakeOptions,
} from './intake';
export {
  createGrainTile,
  createSpriteProvider,
  defaultSpriteFactory,
  type SpriteCanvasFactory,
  type SpriteContext2D,
  type SpriteImage,
  type SpriteProvider,
} from './sprites';
export { curl2, fbm2, noise2, wander } from './noise';
export {
  drawAshtray,
  drawCigarette,
  drawLighter,
  drawPack,
  LIGHTER_SIZE,
  PACK_SIZE,
  TRAY_FLATTEN,
  lighterBox,
  packBox,
} from './props';
export { drawBackground } from './background';
export { drawEffects, EffectList, type EffectKind, type SceneEffect } from './effects';
export { clearWeatherCache, drawDust, drawRain } from './weather';
export { drawAffordanceHint, DIP_SHARE, WAIST, type TrayFeedback } from './props';
