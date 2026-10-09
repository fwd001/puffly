/**
 * The renderer seam — SPEC.md §45, §48, §79.
 *
 * Game Core emits numbers; this package turns them into light. A desktop shell can take
 * the same `createCanvasRenderer` and point it at a transparent canvas window without
 * touching a line of game logic (§79, §86).
 */

export {
  MAX_SMOKE_RADIUS_PX,
  NEAR_DEPTH,
  PUFF_FLATTEN,
  PUFF_SPREAD,
  cartoonScale,
  cherryHot,
  grainAlpha,
  plumeIntakeOptions,
  puffAlpha,
  puffHeat,
  puffSpread,
  puffTint,
  sparkStreak,
} from './renderer';
export {
  SKY_COOL,
  SKY_WARM,
  backgroundStructure,
  geometryFor,
  interiorEdgeInk,
  interiorNosing,
  interiorWall,
  skyPalette,
  vignetteAlpha,
  type BackgroundStructure,
  type StageBoxFrac,
  type StageGlowFrac,
} from './background';
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
  SMOKE_DRAG,
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
export {
  RAIN_TINT,
  clearWeatherCache,
  drawDust,
  drawRain,
  dustMotes,
  rainLines,
  type RainFrame,
  type RainLine,
} from './weather';
export {
  CHAR_BIT,
  CHAR_GRAIN_SEED,
  drawAffordanceHint,
  DIP_SHARE,
  FLAME_BASE_FRACTION,
  flameMetrics,
  LID_THROW_DEG,
  paperGive,
  WAIST,
  type TrayFeedback,
} from './props';
