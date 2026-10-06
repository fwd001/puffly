/**
 * The engine: fixed-step simulation, input handling, and the only public surface of
 * Game Core — SPEC.md §11, §45-49, §54.
 *
 * Order per step is fixed so replay is exact (§71): queued inputs → interaction timers →
 * consumption → ember → world → smoke → derived state → motion → session clock → growth
 * → chrome.
 */

import {
  approach,
  clamp01,
  createIdGenerator,
  createRng,
  dayKey,
  hourOfTimestamp,
  normalizeSeed,
  type DeepReadonly,
} from '@puffly/shared';
import { ANGLES, HIT, LAYOUT, STEP_MS, TIMING } from './constants';
import { CIGARETTE_LENGTH, type Point } from './types/geometry';
import { computeAnchors, inputPoint, isInside, resolveTarget } from './anchors';
import { hitToleranceFor, layoutFor, touchReach } from './stage';
import { createContentLookup, type ContentLookup } from './content/lookup';
import { emit, markRevision, record, setState } from './emit';
import { deriveAmbientState, isLit } from './stateMachine';
import {
  createCigaretteSnapshot,
  createEmptyProgress,
  createTimers,
  createUiHints,
  createWorldBoost,
  deriveReadouts,
  projectProgress,
  type EngineListener,
  type EngineRuntime,
} from './runtime';
import { integratePose, refreshPose, restingTarget, updateWobble } from './systems/pose';
import { isBurnedOut, tickBurn } from './systems/burn';
import { ignite, tickEmber } from './systems/ember';
import { flickAsh, tickAsh } from './systems/ash';
import { beginPuff, endPuff, tapPuff, tickPuff } from './systems/puff';
import { deriveSmokeCharacter, tickSmoke } from './systems/smoke';
import {
  createWorldState,
  failIgnition,
  sampleWeather,
  tickWorld,
  timeOfDayForHour,
} from './systems/world';
import { discardImpactBurst, driftBurst, extinguishBurst, lighterBurst } from './systems/emissions';
import { SessionEventType } from './types/events';
import {
  collectionSnapshot,
  evaluateUnlocks,
  initialUnlocks,
  smokeFreeDays,
  updateDay,
} from './progress';
import {
  announceTargetReached,
  closeSession,
  isSessionTargetReached,
  openSession,
  recordCraving,
  recordTrigger,
} from './session';
import { createDefaultSettings, type Settings } from './types/settings';
import type {
  ContentBundle,
  Environment,
  LighterContent,
  AshtrayContent,
  SmokeStyleContent,
  CigaretteContent,
  UnlockRule,
} from './types/content';
import type { GameInput, InputTarget } from './types/input';
import type { Progress } from './types/progress';
import type { CigaretteStateId, GameState, SceneStyle } from './types/state';
import type { OpenBreak, Session } from './types/session';

/** What every adapter is allowed to read (SPEC.md §48). */
export type GameStateView = DeepReadonly<GameState>;

export type Affordance = GameState['ui']['affordance'];

export interface EngineOptions {
  content: ContentBundle | ContentLookup;
  seed: number;
  /** Real-world time of the first step; drives time of day (§24) and day counting (§37). */
  wallClockMs: number;
  settings?: Settings;
  progress?: Progress;
  cigaretteId?: string;
  environmentId?: string;
  lighterId?: string;
  ashtrayId?: string;
}

export interface GameEngine {
  getState(): GameStateView;
  /** Advance the simulation by real elapsed time; internally a fixed step (§54). */
  tick(dtMs: number): void;
  /** Advance in whole fixed steps. Used by replay and by tests. */
  advance(ms: number): void;
  send(input: GameInput): void;
  setSettings(patch: Partial<Settings>): void;
  selectCigarette(id: string): void;
  selectEnvironment(id: string): void;
  selectLighter(id: string): void;
  selectAshtray(id: string): void;
  /**
   * Tell the simulation how wide the stage is, in pixels. It swaps the prop layout
   * (a landscape phone has different empty space from a portrait one) and fixes the
   * hit metric so a round target stays round. SPEC.md §55, §66.
   */
  setStageAspect(aspect: number): void;
  startSession(): void;
  endSession(): Session | null;
  sessionId(): string | null;
  setCraving(level: number, phase: 'before' | 'after'): void;
  addTrigger(tag: string): void;
  acknowledgeUnlocks(): void;
  /** Completed fixed steps — what replay aligns inputs to (§71). */
  steps(): number;
  /**
   * The break in progress as far as it can be known: which rod, how much of it is left, when
   * the cherry caught. A locked phone still has a loop to catch up; an app the operating
   * system killed has nothing left but what was written here. SPEC.md §81 (4).
   */
  openBreakSnapshot(): OpenBreak | null;
  /**
   * Come back to a break written down before the app died, with the burn advanced to where
   * the wall clock says it should be — including burnt out. SPEC.md §81 (4).
   */
  restoreOpenBreak(record: OpenBreak, nowWallClockMs: number): GameStateView;
  /**
   * The growth record the shell persists. Game Core owns this object so there is exactly
   * one copy of counters like `puffs` — the shell mirrors it into storage, it does not
   * maintain a second tally (§70).
   */
  progressSnapshot(): Progress;
  on(listener: EngineListener): () => void;
  contentIds(): { cigarette: string; environment: string; lighter: string; ashtray: string };
}

function firstWithDefault<T extends { unlock: UnlockRule }>(items: readonly T[]): T {
  const found = items.find((item) => item.unlock.kind === 'default') ?? items[0];
  if (!found) throw new Error('content bundle is empty');
  return found;
}

const clampUnit = (value: number): number => (Number.isFinite(value) ? clamp01(value) : 0);

/**
 * Content → visuals happens once, here, so a renderer can stay a pure function of state
 * (SPEC.md §48) and a desktop shell needs no content import to draw the same scene (§79).
 */
function assembleStyle(
  cigarette: CigaretteContent,
  lighter: LighterContent,
  ashtray: AshtrayContent,
  smokeStyle: SmokeStyleContent,
): SceneStyle {
  return {
    // The brief's visual baseline: an ember at #FF8A3D over a #FFE2BA pool. A skin may repaint
    // both; nothing else in the scene reads them as anything but colour.
    scene: { ember: [255, 138, 61], pool: [255, 226, 186] },
    cigarette: {
      paper: cigarette.palette.paper,
      band: cigarette.palette.band,
      filter: cigarette.palette.filter,
      ash: cigarette.palette.ash,
    },
    lighter: {
      flameHeight: lighter.flame.height,
      hue: lighter.flame.hue,
      sparkles: lighter.flame.sparkles,
    },
    ashtray: {
      base: ashtray.material.base,
      rim: ashtray.material.rim,
      reflect: ashtray.material.reflect,
    },
    smoke: { opacity: smokeStyle.opacity, blur: smokeStyle.blur, swirl: smokeStyle.swirl },
  };
}

export function createEngine(options: EngineOptions): GameEngine {
  const content =
    'cigarette' in options.content && typeof options.content.cigarette === 'function'
      ? (options.content as ContentLookup)
      : createContentLookup(options.content as ContentBundle);

  const wallStartMs = options.wallClockMs;
  const settings = options.settings ?? createDefaultSettings();
  const seed = normalizeSeed(options.seed);
  const rng = createRng(seed);
  const ids = createIdGenerator(rng);

  const bundle = content.bundle;
  const cigarette =
    options.cigaretteId !== undefined
      ? content.cigarette(options.cigaretteId)
      : firstWithDefault(bundle.cigarettes);
  const environment: Environment =
    options.environmentId !== undefined
      ? content.environment(options.environmentId)
      : firstWithDefault(bundle.environments);
  const lighter =
    options.lighterId !== undefined
      ? content.lighter(options.lighterId)
      : firstWithDefault(bundle.lighters);
  const ashtray =
    options.ashtrayId !== undefined
      ? content.ashtray(options.ashtrayId)
      : firstWithDefault(bundle.ashtrays);
  const smokeStyle = content.smokeStyle(cigarette.smokeStyleId);

  const hour = hourOfTimestamp(wallStartMs, settings.utcOffsetMinutes);
  const timeOfDay = timeOfDayForHour(hour);
  const weather = sampleWeather(environment, rng);

  const stageAspect0 = 0.75;
  const layout0 = layoutFor(stageAspect0);
  const rod = createCigaretteSnapshot(cigarette, rng, ANGLES.tableDeg, 'IDLE', layout0);
  const progress =
    options.progress ??
    createEmptyProgress(wallStartMs, dayKey(wallStartMs, settings.utcOffsetMinutes));
  if ((progress.unlocked.cigarettes?.length ?? 0) === 0) progress.unlocked = initialUnlocks(bundle);

  const state: GameState = {
    revision: 0,
    nowMs: 0,
    wallClockMs: wallStartMs,
    seed,
    style: assembleStyle(cigarette, lighter, ashtray, smokeStyle),
    cigarette: rod,
    stage: { aspect: stageAspect0, layout: layout0 },
    smoke: {
      density: 0,
      turbulence: 0,
      riseSpeed: 0,
      dispersion: 0,
      drift: { x: 0, y: 0 },
      character: deriveSmokeCharacter(cigarette),
      visibility: environment.lighting.smokeVisibility,
      tint: smokeStyle.tint,
      emissionRate: 0,
    },
    world: createWorldState(environment, timeOfDay, weather),
    lighter: {
      typeId: lighter.id,
      at: { ...LAYOUT.lighter },
      engaged: false,
      flame: 0,
      heldMs: 0,
      flicker: 0,
      sputter: 0,
    },
    ui: createUiHints(0, settings.sessionTargetMs),
    anchors: computeAnchors(rod.pose, rod.ash.length, layout0),
    progress: projectProgress(
      progress,
      smokeFreeDays(progress, settings.quitAnchorTimestamp, wallStartMs, settings.utcOffsetMinutes),
    ),
    collection: collectionSnapshot(progress, bundle, []),
    environment,
  };

  const rt: EngineRuntime = {
    state,
    steps: 0,
    wallStartMs,
    settings,
    content,
    rng,
    ids,
    cigarette,
    environment,
    lighter,
    ashtray,
    smokeStyle,
    progress,
    session: null,
    litAtWallMs: null,
    everTouched: false,
    listeners: new Set(),
    timers: createTimers(0),
    drag: {
      pointer: null,
      pressed: false,
      velocity: { x: 0, y: 0 },
      lastPointer: { ...LAYOUT.restPivot },
      lastPointerAtMs: 0,
      pressTarget: null,
      pressAtMs: 0,
    },
    ashCarry: 0,
    layout: layout0,
    stageAspect: stageAspect0,
    burnJitter: rng.range(-0.06, 0.06),
    activeEvents: [],
    worldBoost: createWorldBoost(),
    smokeEmissionCarry: 0,
    windGust: 0,
    pendingDiscardMethod: null,
    pendingInputs: [],
  };

  // Everything the player can do, in one place so the state machine stays the only
  // thing that decides what state comes next.
  const pickUp = (): void => {
    if (rt.state.cigarette.state !== 'IDLE') return;
    if (setState(rt, 'PICKED_UP')) {
      record(rt, SessionEventType.PICK_UP, { cigaretteId: rt.cigarette.id });
      // Lifting the rod stirs the column that was rising off it. Without this the single most
      // repeated gesture moves nothing in the air until the first draw (§60).
      emit(rt, { kind: 'burst', atMs: rt.state.nowMs, burst: driftBurst(rt, 10) });
    }
  };

  const engageLighter = (autoHold: boolean): void => {
    const current = rt.state.cigarette.state;
    if (current === 'DISCARDED' || current === 'EXTINGUISHED') return;
    if (current === 'IDLE') pickUp();
    if (rt.state.cigarette.state !== 'PICKED_UP') return;

    rt.state.lighter.engaged = true;
    rt.timers.lighterAutoHold = autoHold;
    rt.timers.ignitionMs = 0;
    rt.timers.lighterAttempts += 1;
    rt.timers.ignitionTargetMs = rt.rng.range(
      rt.lighter.ignitionTimeMs.min,
      rt.lighter.ignitionTimeMs.max,
    );
    setState(rt, 'LIGHTING');
    emit(rt, { kind: 'burst', atMs: rt.state.nowMs, burst: lighterBurst(rt) });
  };

  const beginExtinguish = (auto: boolean): void => {
    if (!isLit(rt.state.cigarette.state)) return;
    rt.timers.extinguishMs = 0;
    rt.timers.extinguishBurstDone = false;
    rt.timers.extinguishAuto = auto;
    setState(rt, 'EXTINGUISHING');
  };

  const finishDiscard = (method: 'drop' | 'flick', wasLit: boolean): void => {
    if (!setState(rt, 'DISCARDED')) return;
    rt.state.cigarette.discardProgress = 0;
    rt.timers.discardMs = 0;
    rt.state.lighter.engaged = false;
    rt.timers.lighterAutoHold = false;
    emit(rt, { kind: 'burst', atMs: rt.state.nowMs, burst: discardImpactBurst(rt) });
    record(rt, SessionEventType.DISCARD, { method, wasLit });
  };

  const discard = (method: 'drop' | 'flick'): void => {
    const current = rt.state.cigarette.state;
    if (current === 'DISCARDED') return;
    const burning = isLit(current);

    if (burning) {
      // Put it out first, then let go: §20 asks for the motion, §84 asks for no harm.
      rt.pendingDiscardMethod = method;
      beginExtinguish(true);
      return;
    }
    if (current === 'LIGHTING') {
      rt.state.lighter.engaged = false;
      rt.timers.ignitionMs = 0;
      setState(rt, 'PICKED_UP');
    }
    finishDiscard(method, current === 'EXTINGUISHING');
  };

  const newRod = (): void => {
    const from = rt.state.cigarette.state;
    if (from !== 'DISCARDED' && from !== 'EXTINGUISHED') return;
    const next = createCigaretteSnapshot(rt.cigarette, rt.rng, ANGLES.tableDeg, 'IDLE', rt.layout);
    rt.state.cigarette = next;
    rt.ashCarry = 0;
    rt.smokeStyle = rt.content.smokeStyle(next.smokeStyleId);
    rt.state.smoke.tint = rt.smokeStyle.tint;
    rt.state.smoke.character = deriveSmokeCharacter(rt.cigarette);
    rt.pendingDiscardMethod = null;
    emit(rt, { kind: 'transition', atMs: rt.state.nowMs, from, to: 'IDLE' });
  };

  const handleTap = (target: InputTarget | null): void => {
    const current = rt.state.cigarette.state;
    switch (target) {
      case 'lighter':
        if (current === 'PICKED_UP' || current === 'IDLE') engageLighter(true);
        break;
      case 'ash':
        flickAsh(rt);
        break;
      case 'cigarette':
      case 'ember':
        if (current === 'IDLE') pickUp();
        else if (isLit(current)) tapPuff(rt);
        else if (current === 'EXTINGUISHED') discard('drop');
        else if (current === 'DISCARDED') newRod();
        break;
      case 'ashtray':
        if (current === 'EXTINGUISHED' || current === 'DISCARDED') discard('drop');
        else if (isLit(current)) beginExtinguish(true);
        break;
      default:
        break;
    }
  };

  const handleHold = (target: InputTarget | null, at: Point, fromKeyboard: boolean): void => {
    const current = rt.state.cigarette.state;
    rt.drag.pressTarget = target;
    rt.drag.pressAtMs = rt.state.nowMs;
    if (!fromKeyboard && (target === 'cigarette' || target === 'ember' || target === 'ashtray')) {
      rt.drag.pressed = true;
      rt.drag.pointer = { ...at };
      rt.drag.lastPointer = { ...at };
      rt.drag.lastPointerAtMs = rt.state.nowMs;
    }

    switch (target) {
      case 'lighter':
        engageLighter(false);
        break;
      case 'cigarette':
      case 'ember':
        if (current === 'IDLE') pickUp();
        else if (current === 'DISCARDED') newRod();
        if (isLit(rt.state.cigarette.state)) beginPuff(rt);
        break;
      case 'ashtray':
        if (isLit(current)) beginExtinguish(false);
        break;
      default:
        break;
    }
  };

  const handleDrag = (at: Point): void => {
    if (!rt.drag.pressed) return;
    const previous = rt.drag.pointer ?? at;
    const next = { x: clampUnit(at.x), y: clampUnit(at.y) };
    const dt = Math.max(1, rt.state.nowMs - rt.drag.lastPointerAtMs);
    rt.drag.velocity.x = (next.x - previous.x) / (dt / 1000);
    rt.drag.velocity.y = (next.y - previous.y) / (dt / 1000);
    rt.drag.pointer = next;
    rt.drag.lastPointer = next;
    rt.drag.lastPointerAtMs = rt.state.nowMs;
  };

  const handleRelease = (at: Point, tolerance: number): void => {
    if (rt.state.cigarette.puff.active) endPuff(rt);

    const current = rt.state.cigarette.state;
    if (current === 'LIGHTING' && !rt.timers.lighterAutoHold) {
      // Let go too soon and the cherry simply never catches. No message needed (§0).
      rt.state.lighter.engaged = false;
      rt.timers.ignitionMs = 0;
      setState(rt, 'PICKED_UP');
    }

    if (rt.drag.pressed) {
      const over = isInside(
        rt.drag.pointer ?? at,
        rt.state.anchors.ashtray,
        touchReach(Math.max(rt.layout.ashtrayRadius, HIT.ashtray), tolerance),
        rt.stageAspect,
      );
      rt.drag.pressed = false;
      rt.drag.pointer = null;
      rt.drag.velocity = { x: 0, y: 0 };
      if (over && current !== 'IDLE' && current !== 'EXTINGUISHING') discard('drop');
    }

    if (current === 'EXTINGUISHING' && rt.state.cigarette.extinguishProgress < 0.35) {
      rt.timers.extinguishAuto = false;
    }
    rt.drag.pressTarget = null;
  };

  /**
   * Two fingers closing on the cherry is the same request as pressing it into the tray
   * (§19) — so it goes to the same place, and the same stages accept it. Over nothing, or
   * before anything is lit, it is two fingers and nothing more.
   */
  const handlePinch = (target: InputTarget | null): void => {
    if (target === null || target === 'stage') return;
    if (!isLit(rt.state.cigarette.state)) return;
    beginExtinguish(true);
  };

  const handleSwipe = (target: InputTarget | null, velocity: Point): void => {
    const speed = Math.hypot(velocity.x, velocity.y);

    // A swipe is the end of a gesture, not an extra one: whatever was in progress — a draw, a
    // drag — is released here, so the shell can send `swipe` instead of `swipe` + `release`.
    if (rt.state.cigarette.puff.active) endPuff(rt);
    rt.drag.pressed = false;
    rt.drag.pointer = null;
    rt.drag.velocity = { x: 0, y: 0 };
    rt.drag.pressTarget = null;

    if (speed <= 0) return;

    // A swipe down over nothing at all is the player putting the interface away, not the
    // cigarette away: the scene keeps burning behind it (§10).
    if (target === 'stage' && velocity.y > 0.45 && velocity.y > Math.abs(velocity.x))
      rt.state.ui.chromeFolded = true;

    if (target === 'ash') {
      if (speed > 0.1) flickAsh(rt);
      return;
    }
    if (target !== 'cigarette' && target !== 'ember') return;

    const from = rt.state.cigarette.pose.pivot;
    const to = rt.state.anchors.ashtray;
    const towards = { x: to.x - from.x, y: to.y - from.y };
    const length = Math.hypot(towards.x, towards.y) || 1;
    const alignment = (velocity.x * towards.x + velocity.y * towards.y) / (speed * length);
    // A flick that misses the tray is just a flick: the rod springs back on its own, because the
    // drag ended above and the pose has nothing to follow any more (§20, §59).
    if (speed > 0.3 && alignment > 0.5) discard('flick');
  };

  const applyInput = (input: GameInput): void => {
    rt.state.ui.lastInputMs = input.timestamp;
    rt.everTouched = true;
    // Touching a thing is the only way back: the fold is lifted by pointing at something,
    // not by waiting for a timer.
    if (input.target !== undefined && input.target !== 'stage') rt.state.ui.chromeFolded = false;
    rt.session?.inputs.push(input);

    switch (input.type) {
      case 'tap':
        handleTap(input.target ?? null);
        break;
      case 'hold':
        handleHold(
          input.target ?? null,
          { x: input.x, y: input.y },
          input.source === 'keyboard' || input.source === 'shortcut',
        );
        break;
      case 'drag':
        handleDrag({ x: input.x, y: input.y });
        break;
      case 'release':
        handleRelease({ x: input.x, y: input.y }, hitToleranceFor(input.source));
        break;
      case 'pinch':
        handlePinch(input.target ?? null);
        break;
      case 'swipe':
        handleSwipe(input.target ?? null, {
          x: input.velocity?.vx ?? 0,
          y: input.velocity?.vy ?? 0,
        });
        break;
      default:
        break;
    }
  };

  const tickLighter = (): void => {
    const lighter = rt.state.lighter;
    const target = lighter.engaged ? 1 : 0;
    lighter.flame = approach(lighter.flame, target, lighter.engaged ? 9 : 14, STEP_MS);
    // A released lighter starts the next attempt from zero: the ring counts an attempt, not a
    // session. It was already on the runtime model and never advanced, which made it a number
    // that existed only to be read.
    rt.timers.lighterHeldMs = lighter.engaged ? rt.timers.lighterHeldMs + STEP_MS : 0;
    lighter.heldMs = rt.timers.lighterHeldMs;
    lighter.sputter = Math.max(0, lighter.sputter - STEP_MS / 1200);
    lighter.flicker = rt.rng.range(-0.2, 0.2) * (0.4 + lighter.flame);

    if (rt.state.cigarette.state !== 'LIGHTING') return;
    if (lighter.flame < 0.45) return;

    rt.timers.ignitionMs += STEP_MS * lighter.flame;
    if (rt.timers.ignitionMs < rt.timers.ignitionTargetMs) return;

    if (rt.rng.bool(rt.lighter.failureChance)) {
      failIgnition(rt, true);
      return;
    }
    ignite(rt);
    setState(rt, 'BURNING');
    rt.state.lighter.engaged = false;
    rt.timers.lighterAutoHold = false;
  };

  const ambientSignals = (): {
    rodRemaining: number;
    ashRatio: number;
    sinceReleaseMs: number;
  } => ({
    rodRemaining: rt.state.cigarette.rodRemaining,
    ashRatio: rt.state.cigarette.ash.ratio,
    sinceReleaseMs: rt.state.cigarette.puff.sinceReleaseMs,
  });

  const tickExtinguish = (): void => {
    const cigarette = rt.state.cigarette;
    if (cigarette.state !== 'EXTINGUISHING') return;

    const held = rt.timers.extinguishAuto || rt.drag.pressTarget === 'ashtray';
    if (!held && cigarette.extinguishProgress < 0.35) {
      cigarette.extinguishProgress = 0;
      rt.timers.extinguishMs = 0;
      setState(rt, deriveAmbientState(ambientSignals()));
      return;
    }

    rt.timers.extinguishMs += STEP_MS * (held ? 1 : 0.5);
    cigarette.extinguishProgress = clamp01(rt.timers.extinguishMs / TIMING.extinguishMs);

    if (
      !rt.timers.extinguishBurstDone &&
      cigarette.extinguishProgress >= TIMING.extinguishBurstAt
    ) {
      rt.timers.extinguishBurstDone = true;
      emit(rt, { kind: 'burst', atMs: rt.state.nowMs, burst: extinguishBurst(rt) });
    }

    if (cigarette.extinguishProgress < 1) return;

    cigarette.ember.brightness = 0;
    cigarette.ember.flare = 0;
    cigarette.ember.lit = false;
    cigarette.ember.glowRadius = 0;
    rt.timers.waningMs = 0;
    setState(rt, 'EXTINGUISHED');
    record(rt, SessionEventType.EXTINGUISH, {
      burnMs: Math.round(cigarette.burnMsElapsed),
      puffs: cigarette.puff.count,
      ashDropped: cigarette.ash.dropped,
    });

    if (rt.pendingDiscardMethod) {
      const method = rt.pendingDiscardMethod;
      rt.pendingDiscardMethod = null;
      finishDiscard(method, true);
    }
  };

  const tickAmbient = (): void => {
    const cigarette = rt.state.cigarette;
    const current = cigarette.state;
    if (
      cigarette.puff.active ||
      current === 'LIGHTING' ||
      current === 'EXTINGUISHING' ||
      current === 'EXTINGUISHED' ||
      current === 'DISCARDED' ||
      current === 'IDLE' ||
      current === 'PICKED_UP'
    ) {
      return;
    }

    if (isBurnedOut(rt)) {
      beginExtinguish(true);
      return;
    }
    setState(rt, deriveAmbientState(ambientSignals()));
  };

  const tickMotion = (): void => {
    const cigarette = rt.state.cigarette;
    const wind = rt.state.world.wind;
    updateWobble(cigarette.pose, rt.timers.wobblePhaseMs, 0.8 + wind * 2.2);
    const target = restingTarget(
      cigarette.state,
      rt.drag.pressed ? rt.drag.pointer : null,
      rt.layout,
    );
    integratePose(cigarette.pose, target, cigarette.rodRemaining, cigarette.ash.length, STEP_MS);

    cigarette.lengthRemaining = clamp01(
      (cigarette.pose.rodLength + cigarette.ash.length) / CIGARETTE_LENGTH,
    );
    cigarette.readouts = deriveReadouts(rt.cigarette, cigarette.rodRemaining, cigarette.ash.length);
    if (cigarette.state === 'DISCARDED') {
      cigarette.discardProgress = clamp01(rt.timers.discardMs / TIMING.discardSettleMs);
    }
    rt.state.anchors = computeAnchors(cigarette.pose, cigarette.ash.length, rt.layout);
  };

  const tickSessionClock = (): void => {
    const log = rt.session;
    if (!log) return;
    const elapsed = rt.state.nowMs - log.startedAtEngineMs;
    rt.state.ui.sessionRemainingMs = Math.max(0, log.targetMs - elapsed);
    if (elapsed >= log.targetMs && !isSessionTargetReached(rt)) announceTargetReached(rt);
  };

  const tickGrowth = (): void => {
    updateDay(rt);
    if (rt.steps % 30 === 0) {
      evaluateUnlocks(rt);
      rt.state.collection = collectionSnapshot(
        rt.progress,
        rt.content.bundle,
        rt.state.collection.fresh,
      );
    }
    rt.state.progress = projectProgress(
      rt.progress,
      smokeFreeDays(
        rt.progress,
        rt.settings.quitAnchorTimestamp,
        rt.state.wallClockMs,
        rt.settings.utcOffsetMinutes,
      ),
    );
  };

  const affordanceFor = (state: CigaretteStateId): Affordance => {
    switch (state) {
      case 'PICKED_UP':
      case 'LIGHTING':
        return 'lighter';
      case 'ASH_READY':
        return 'flick';
      case 'NEAR_END':
      case 'EXTINGUISHING':
        return 'extinguish';
      case 'EXTINGUISHED':
        return 'discard';
      case 'IDLE':
      case 'DISCARDED':
        // A rod lying on the table is not "nothing suggested": picking it up is the whole of
        // what comes next, and the scene has to say so like it says everything else (§28).
        return 'pick';
      default:
        return 'puff';
    }
  };

  const tickUi = (): void => {
    const ui = rt.state.ui;
    ui.idleMs = rt.state.nowMs - ui.lastInputMs;
    ui.controlsVisible =
      (!rt.everTouched || ui.idleMs < TIMING.controlsIdleMs || rt.state.cigarette.puff.active) &&
      !ui.chromeFolded;
    ui.sessionActive = rt.session !== null;
    ui.sessionTargetMs = rt.session?.targetMs ?? rt.settings.sessionTargetMs;
    ui.affordance = affordanceFor(rt.state.cigarette.state);
  };

  const step = (): void => {
    rt.steps += 1;
    rt.state.nowMs = rt.steps * STEP_MS;
    rt.state.wallClockMs = rt.wallStartMs + rt.state.nowMs;
    rt.timers.wobblePhaseMs += STEP_MS;
    rt.timers.restMs += STEP_MS;
    rt.timers.discardMs += STEP_MS;

    if (rt.state.cigarette.state === 'EXTINGUISHED') rt.timers.waningMs += STEP_MS;
    if (rt.state.cigarette.state === 'DISCARDED') rt.timers.newRodMs += STEP_MS;
    else rt.timers.newRodMs = 0;

    const due = rt.pendingInputs.filter((queued) => queued.atStep <= rt.steps);
    rt.pendingInputs = rt.pendingInputs.filter((queued) => queued.atStep > rt.steps);
    for (const queued of due) applyInput(queued.input);

    tickLighter();
    tickPuff(rt, STEP_MS);
    tickExtinguish();

    tickBurn(rt, STEP_MS);
    tickAsh(rt, STEP_MS);
    tickEmber(rt, STEP_MS);
    tickWorld(rt, STEP_MS);
    tickSmoke(rt, STEP_MS);

    tickAmbient();
    tickMotion();
    tickSessionClock();
    tickGrowth();
    tickUi();

    if (rt.timers.newRodMs >= TIMING.newRodDelayMs) newRod();

    markRevision(rt);
  };

  let pendingMs = 0;

  // Day-based unlocks should already be lit when a returning player loads a save.
  evaluateUnlocks(rt);
  rt.state.collection = collectionSnapshot(
    rt.progress,
    rt.content.bundle,
    rt.state.collection.fresh,
  );

  return {
    getState() {
      return rt.state;
    },
    tick(dtMs: number) {
      if (!Number.isFinite(dtMs) || dtMs <= 0) return;
      pendingMs += Math.min(dtMs, 250);
      while (pendingMs >= STEP_MS) {
        pendingMs -= STEP_MS;
        step();
      }
    },
    advance(ms: number) {
      const steps = Math.max(0, Math.floor(ms / STEP_MS));
      for (let i = 0; i < steps; i++) step();
    },
    send(input: GameInput) {
      const fromKeyboard = input.source === 'keyboard' || input.source === 'shortcut';
      // Only an input with no pixel of its own borrows an anchor. A pointer that names a target
      // still has to carry its real position, or "did the finger let go over the tray?" would be
      // answered with the rod's own position — which is next to the tray whenever it is lying
      // there, and a plain tap-hold-release would throw the cigarette away (§20, §66).
      const at = fromKeyboard ? inputPoint(input, rt.state.anchors) : { x: input.x, y: input.y };
      const tolerance = hitToleranceFor(input.source);
      const target: InputTarget =
        input.target ??
        (fromKeyboard
          ? 'cigarette'
          : (resolveTarget(
              at,
              rt.state.anchors,
              rt.state.cigarette.ash.length,
              rt.stageAspect,
              tolerance,
            ) ?? 'stage'));

      // Snapped to the next boundary so a replay applies it in the same step (§71).
      const atStep = rt.steps + 1;
      const snapped: GameInput = {
        type: input.type,
        x: at.x,
        y: at.y,
        timestamp: atStep * STEP_MS,
        target,
        ...(input.source ? { source: input.source } : {}),
        ...(input.velocity ? { velocity: { ...input.velocity } } : {}),
      };
      rt.pendingInputs.push({ atStep, input: snapped });
    },
    setSettings(patch: Partial<Settings>) {
      rt.settings = { ...rt.settings, ...patch };
      rt.state.ui.sessionTargetMs = rt.settings.sessionTargetMs;
    },
    selectCigarette(id: string) {
      const keep = rt.state.cigarette.state;
      rt.cigarette = rt.content.cigarette(id);
      rt.smokeStyle = rt.content.smokeStyle(rt.cigarette.smokeStyleId);
      const next = createCigaretteSnapshot(
        rt.cigarette,
        rt.rng,
        ANGLES.tableDeg,
        'IDLE',
        rt.layout,
      );
      rt.state.cigarette = next;
      rt.state.smoke.tint = rt.smokeStyle.tint;
      rt.state.smoke.character = deriveSmokeCharacter(rt.cigarette);
      rt.state.style = assembleStyle(rt.cigarette, rt.lighter, rt.ashtray, rt.smokeStyle);
      rt.ashCarry = 0;
      if (keep !== 'IDLE')
        emit(rt, { kind: 'transition', atMs: rt.state.nowMs, from: keep, to: 'IDLE' });
      refreshPose(next.pose, next.rodRemaining, 0);
    },
    selectEnvironment(id: string) {
      rt.environment = rt.content.environment(id);
      rt.state.environment = rt.environment;
      const hour = hourOfTimestamp(rt.state.wallClockMs, rt.settings.utcOffsetMinutes);
      rt.state.world = createWorldState(
        rt.environment,
        timeOfDayForHour(hour),
        sampleWeather(rt.environment, rt.rng),
      );
      rt.activeEvents = [];
      rt.state.world.activeEvents = [];
      rt.timers.nextWorldEventMs = rt.state.nowMs + rt.rng.range(3000, 7000);
    },
    setStageAspect(aspect: number) {
      const next = Number.isFinite(aspect) && aspect > 0 ? aspect : 0.75;
      const layout = layoutFor(next);
      const changed = layout.id !== rt.layout.id || Math.abs(next - rt.stageAspect) > 0.001;
      rt.stageAspect = next;
      rt.layout = layout;
      rt.state.stage = { aspect: next, layout };
      if (!changed) return;
      // The props move; the rod must move with them rather than spring across the screen.
      const cigarette = rt.state.cigarette;
      cigarette.pose.pivot =
        cigarette.state === 'IDLE'
          ? { ...layout.table }
          : cigarette.state === 'DISCARDED'
            ? { ...layout.ashtray }
            : { ...layout.restPivot };
      refreshPose(cigarette.pose, cigarette.rodRemaining, cigarette.ash.length);
      rt.state.anchors = computeAnchors(cigarette.pose, cigarette.ash.length, layout);
    },
    selectLighter(id: string) {
      rt.lighter = rt.content.lighter(id);
      rt.state.lighter.typeId = rt.lighter.id;
      rt.state.style = assembleStyle(rt.cigarette, rt.lighter, rt.ashtray, rt.smokeStyle);
    },
    selectAshtray(id: string) {
      rt.ashtray = rt.content.ashtray(id);
      rt.state.style = assembleStyle(rt.cigarette, rt.lighter, rt.ashtray, rt.smokeStyle);
    },
    startSession() {
      openSession(rt, rt.settings.sessionTargetMs);
    },
    endSession() {
      return closeSession(rt);
    },
    sessionId() {
      return rt.session?.id ?? null;
    },
    openBreakSnapshot() {
      const log = rt.session;
      if (!log) return null;
      const cigarette = rt.state.cigarette;
      return {
        id: log.id,
        seed: log.seed,
        cigaretteId: rt.cigarette.id,
        environmentId: rt.environment.id,
        lighterId: rt.lighter.id,
        ashtrayId: rt.ashtray.id,
        startedAt: log.startedAt,
        targetMs: log.targetMs,
        litAtWallMs: rt.litAtWallMs ?? log.startedAt,
        rodRemaining: cigarette.rodRemaining,
        ashLength: cigarette.ash.length,
        emberLit: cigarette.ember.lit,
        events: log.events.map((event) => ({ ...event })),
        triggers: [...log.triggers],
        ...(log.cravingBefore === undefined ? {} : { cravingBefore: log.cravingBefore }),
        ...(log.cravingAfter === undefined ? {} : { cravingAfter: log.cravingAfter }),
        savedAtWallMs: rt.state.wallClockMs,
      };
    },
    restoreOpenBreak(record, nowWallClockMs) {
      // The wall clock is the authority on how much of the rod is left: the burn is a clock,
      // and this is the only place a gap that no frame ever saw is handed back.
      const sinceLitMs = Math.max(0, nowWallClockMs - record.litAtWallMs);
      const burnMs = rt.cigarette.burnDuration.max || 1;
      const remaining = clamp01(record.rodRemaining - sinceLitMs / burnMs);

      if (rt.session === null) {
        // `openSession` mints its own id and stamp; the record's are what the shell already
        // showed the player, so they win.
        const log = openSession(rt, record.targetMs);
        log.id = record.id;
        log.startedAt = record.startedAt;
        // The §31 countdown runs on simulated time and this engine never saw the seconds that
        // passed. Handing them back is what makes the resumed clock the one the player left, and
        // what makes the logged duration the time they actually spent — a negative origin is
        // literally true here: the break began before this engine's time zero.
        log.startedAtEngineMs = rt.state.nowMs - Math.max(0, nowWallClockMs - record.startedAt);
        log.triggers.push(...record.triggers.filter((tag) => !log.triggers.includes(tag)));
        if (record.cravingBefore !== undefined) log.cravingBefore = record.cravingBefore;
        if (record.cravingAfter !== undefined) log.cravingAfter = record.cravingAfter;
      }

      const cigarette = rt.state.cigarette;
      cigarette.rodRemaining = Math.max(remaining, 0.0001);
      cigarette.lengthRemaining = cigarette.rodRemaining;
      cigarette.ash.length = Math.max(0, record.ashLength);
      refreshPose(cigarette.pose, cigarette.rodRemaining, cigarette.ash.length);
      rt.state.anchors = computeAnchors(cigarette.pose, cigarette.ash.length, rt.layout);
      rt.litAtWallMs = record.litAtWallMs;
      // `ui.sessionActive` is written by the tick; a restore that never ticks has to say so.
      rt.state.ui.sessionActive = true;
      rt.state.wallClockMs = nowWallClockMs;
      rt.wallStartMs = nowWallClockMs - rt.state.nowMs;

      // The state machine only walks legal edges, so a restored rod is walked back into the
      // fire rather than written straight over it.
      setState(rt, 'PICKED_UP');
      setState(rt, 'LIGHTING');
      setState(rt, 'BURNING');
      if (record.emberLit && remaining > 0.0005) {
        cigarette.ember.lit = true;
        cigarette.ember.brightness = Math.max(cigarette.ember.brightness, 0.5);
      } else {
        // It burnt out while nobody was watching: let the burn tick put it out properly, so the
        // record ends the same way a watched break does.
        beginExtinguish(true);
        for (let i = 0; i < Math.ceil(TIMING.extinguishMs / STEP_MS) + 2; i++) step();
      }
      return rt.state;
    },
    setCraving(level: number, phase: 'before' | 'after') {
      recordCraving(rt, level, phase);
    },
    addTrigger(tag: string) {
      recordTrigger(rt, tag);
    },
    acknowledgeUnlocks() {
      rt.progress.acknowledgedUnlocks.push(...rt.state.collection.fresh);
      rt.state.collection.fresh = [];
    },
    steps() {
      return rt.steps;
    },
    progressSnapshot() {
      return {
        ...rt.progress,
        unlocked: {
          cigarettes: [...rt.progress.unlocked.cigarettes],
          lighters: [...rt.progress.unlocked.lighters],
          environments: [...rt.progress.unlocked.environments],
          ashtrays: [...rt.progress.unlocked.ashtrays],
          smoke: [...rt.progress.unlocked.smoke],
          sounds: [...rt.progress.unlocked.sounds],
        },
        acknowledgedUnlocks: [...rt.progress.acknowledgedUnlocks],
        activeDays: [...rt.progress.activeDays],
      };
    },
    on(listener: EngineListener) {
      rt.listeners.add(listener);
      return () => {
        rt.listeners.delete(listener);
      };
    },
    contentIds() {
      return {
        cigarette: rt.cigarette.id,
        environment: rt.environment.id,
        lighter: rt.lighter.id,
        ashtray: rt.ashtray.id,
      };
    },
  };
}
