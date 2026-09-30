/**
 * The shell's only place that knows about engines, adapters and storage (SPEC.md §45).
 *
 * Vue deliberately does *not* drive the simulation: the rAF loop calls `engine.tick`, the
 * renderer draws, and a summary is republished a few times per second so components
 * re-render on a human scale instead of once per particle (§54, §81 (9), §81 (10)).
 */

import { onBeforeUnmount, ref, type Ref } from 'vue';
import { formatClock } from '@puffly/shared';
import {
  createDefaultSettings,
  createEngine,
  SessionEventType,
  type CollectionItem,
  type EngineEvent,
  type GameEngine,
  type GameStateView,
  type QualityMode,
  type Selection,
  type Session,
  type Settings,
} from '@puffly/game-core';
import { buildCollectionItems, createDefaultLookup, DEFAULT_IDS } from '@puffly/game-content';
import {
  createCanvasRenderer,
  createGrainTile,
  createViewport,
  defaultSpriteFactory,
  type PufflyRenderer,
} from '@puffly/game-renderer';
import {
  deriveJourney,
  deriveStatistics,
  deriveTodayView,
  deriveTriggerBreakdown,
  type JourneyStop,
  type Statistics,
  type TodayView,
  type TriggerCount,
} from '@puffly/game-statistics';
import { createAudioBridge, type AudioBridge } from '../services/audio';
import { createPersistence, type Persistence } from '../services/persistence';
import {
  createKeyboardAdapter,
  createPointerAdapter,
  createSurfaceGuard,
  targetForAffordance,
} from './useInputAdapters';

/** How often chrome is allowed to re-render (§54). */
const SUMMARY_INTERVAL_MS = 200;
/** A break is over when nothing is burning and the player has gone quiet this long. */
const IDLE_CLOSE_MS = 90_000;
/**
 * How much of a hidden tab's elapsed time is handed back to the simulation.
 *
 * A phone that sleeps with a lit rod must wake to a rod that kept burning: the simulation is a
 * function of time, not of animation frames, and browsers stop calling `requestAnimationFrame`
 * in a background tab. The cap is generous enough to burn a whole rod (about 190 s) and small
 * enough that a tab reopened a week later catches up in milliseconds instead of minutes.
 */
const CATCH_UP_MIN_MS = 500;
/** How long an interrupted break is still worth resuming: longer than any rod's life. */
const INTERRUPTED_MAX_AGE_MS = 30 * 60_000;
/** The record is rewritten at most this often while a break runs. */
const BREAK_WRITE_MS = 1500;
const CATCH_UP_MAX_MS = 8 * 60_000;
/** Keep the canvas from costing more than it can show. */
const MAX_DPR = 3;
/** A phone at 3x is 3.4 million pixels of smoke per frame; it cannot show the difference. */
const MAX_DPR_COARSE = 2;

/**
 * Frame time → quality tier, for a player who never chose one (§54, §64).
 *
 * `auto` is not a promise that something is fast: the only honest way to keep 60 FPS on an
 * unknown device is to look at the frames that actually arrived. The ladder goes down twice
 * as eagerly as it comes back up, so a single dropped frame cannot make the scene flicker
 * between budgets.
 */
const AUTO_TIERS: readonly QualityMode[] = ['high', 'balanced', 'light'];
/** Below this an average frame is late; above it, the device has room to spare. */
const SLOW_FRAME_MS = 22;
const FAST_FRAME_MS = 13.5;
/** ~1/8 of a second of frames, so one stall from a background tab is not a trend. */
const FRAME_SMOOTHING = 0.06;

function coarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** A phone or tablet starts a tier down: its GPU is real, and so is its pixel count. */
function startingTier(): QualityMode {
  if (!coarsePointer()) return 'high';
  const cores = typeof navigator === 'undefined' ? 8 : (navigator.hardwareConcurrency ?? 8);
  return cores <= 4 ? 'light' : 'balanced';
}

export interface Summary {
  state: GameStateView | null;
  clock: string;
  sessionActive: boolean;
  controlsVisible: boolean;
  affordance: string;
  targetReached: boolean;
  fresh: string[];
  dayNumber: number;
  puffs: number;
  ashDropped: number;
  smokeFreeDays: number;
}

export interface Puffly {
  ready: Ref<boolean>;
  summary: Ref<Summary>;
  settings: Ref<Settings>;
  stats: Ref<Statistics>;
  today: Ref<TodayView | null>;
  journey: Ref<JourneyStop[]>;
  triggers: Ref<TriggerCount[]>;
  items: Ref<CollectionItem[]>;
  unlocked: Ref<Record<string, readonly string[]>>;
  audioAvailable: Ref<boolean>;
  storageDegraded: Ref<boolean>;
  /** Whether a vibration motor exists to be asked for one (§30). */
  canVibrate: Ref<boolean>;
  attach(canvas: HTMLCanvasElement): Promise<void>;
  setSettings(patch: Partial<Settings>): void;
  select(selection: Partial<Selection>): void;
  setCraving(level: number, phase: 'before' | 'after'): void;
  addTrigger(tag: string): void;
  acknowledgeUnlocks(): void;
  endBreak(): void;
  exportJson(): Promise<string>;
  importJson(json: string): Promise<{ ok: boolean; errors: string[] }>;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function freshSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const box = new Uint32Array(1);
    crypto.getRandomValues(box);
    return (box[0] ?? 0) || 1;
  }
  return Date.now() >>> 0 || 1;
}

export function createPuffly(): Puffly {
  const content = createDefaultLookup();
  const items = ref<CollectionItem[]>(buildCollectionItems(content.bundle));
  const ready = ref(false);
  const settings = ref<Settings>(createDefaultSettings(-new Date().getTimezoneOffset()));
  const summary = ref<Summary>({
    state: null,
    clock: formatClock(0),
    sessionActive: false,
    controlsVisible: true,
    affordance: 'none',
    targetReached: false,
    fresh: [],
    dayNumber: 1,
    puffs: 0,
    ashDropped: 0,
    smokeFreeDays: 0,
  });
  const stats = ref<Statistics>(deriveStatistics([], { nowMs: Date.now(), utcOffsetMinutes: 0 }));
  const today = ref<TodayView | null>(null);
  const journey = ref<JourneyStop[]>([]);
  const triggers = ref<TriggerCount[]>([]);
  const unlocked = ref<Record<string, readonly string[]>>({});
  const audioAvailable = ref(false);
  const storageDegraded = ref(false);
  const canVibrate = ref(typeof navigator !== 'undefined' && 'vibrate' in navigator);

  /**
   * A vibration is the one feedback a phone can give that a monitor cannot (§30). It marks the
   * four beats that end a gesture — the cherry catching, the ash letting go, the stub dying, the
   * rod landing — and nothing in between, because a motor on every puff stops meaning anything.
   */
  const haptic = (pattern: number | number[]): void => {
    if (!settings.value.haptics || !canVibrate.value) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers only allow it during a user gesture; a missing buzz is not an error.
      canVibrate.value = false;
    }
  };

  let engine: GameEngine | null = null;
  let renderer: PufflyRenderer | null = null;
  let audio: AudioBridge | null = null;
  let persistence: Persistence | null = null;
  let sessions: Session[] = [];
  let stop: (() => void)[] = [];
  let raf = 0;
  let lastFrameMs = 0;
  /**
   * Wall time the frame loop already accounted for while the page was hidden. A desktop tab that
   * is merely throttled keeps calling `requestAnimationFrame` at 1 Hz, and those frames are real
   * simulation — subtracting them is what stops a catch-up counting the same second twice.
   */
  let simulatedWhileHiddenMs = 0;
  let summaryAccumulator = 0;
  let saveTimer: number | undefined;

  /** Shared with the pointer adapter, so hit-testing and drawing agree on the letterbox (§55). */
  const viewport = createViewport({ width: 640, height: 960, dpr: 1 });

  /** The tier `quality: 'auto'` has settled on; the player's own choice is never overwritten. */
  let autoTier: QualityMode = startingTier();
  let frameEmaMs = 1000 / 60;
  /** Frames spent at the current tier, so a tier cannot be swapped on the very next frame. */
  let tierHeldFrames = 0;

  const effectiveQuality = (): QualityMode =>
    settings.value.quality === 'auto' ? autoTier : settings.value.quality;

  const applyEffectiveQuality = (): void => {
    const quality = effectiveQuality();
    engine?.setSettings({ ...settings.value, quality });
    renderer?.setSettings({
      reducedMotion: settings.value.reducedMotion,
      quality,
      contrast: settings.value.contrast,
    });
  };

  /**
   * One pass of the ladder, from the frame time that just arrived. Deliberately dumb: no
   * sampling windows, no percentiles, nothing that needs a tuning session on a real device.
   */
  const watchFrames = (dt: number): void => {
    if (settings.value.quality !== 'auto') return;
    frameEmaMs += (dt - frameEmaMs) * FRAME_SMOOTHING;
    tierHeldFrames += 1;
    if (tierHeldFrames < 90) return;

    const index = AUTO_TIERS.indexOf(autoTier);
    let next = index;
    if (frameEmaMs > SLOW_FRAME_MS && index < AUTO_TIERS.length - 1) next = index + 1;
    else if (frameEmaMs < FAST_FRAME_MS && index > 0) next = index - 1;
    if (next === index) return;

    autoTier = AUTO_TIERS[next] ?? autoTier;
    tierHeldFrames = 0;
    // Re-aim the average at the new tier so the next decision is about the new budget.
    frameEmaMs = 1000 / 60;
    applyEffectiveQuality();
  };

  const deriveOptions = () => ({
    nowMs: Date.now(),
    utcOffsetMinutes: settings.value.utcOffsetMinutes,
    ...(settings.value.quitAnchorTimestamp
      ? { quitAnchorTimestamp: settings.value.quitAnchorTimestamp }
      : {}),
  });

  const recompute = (): void => {
    const options = deriveOptions();
    stats.value = deriveStatistics(sessions, options);
    today.value = deriveTodayView(sessions, options);
    triggers.value = deriveTriggerBreakdown(sessions);
    journey.value = engine ? deriveJourney(sessions, engine.progressSnapshot()) : [];
  };

  const refreshSummary = (): void => {
    if (!engine) return;
    const state = engine.getState();
    summary.value = {
      state,
      clock: formatClock(state.ui.sessionRemainingMs),
      sessionActive: state.ui.sessionActive,
      controlsVisible: state.ui.controlsVisible,
      affordance: state.ui.affordance,
      targetReached: state.ui.sessionActive && state.ui.sessionRemainingMs <= 0,
      fresh: [...state.collection.fresh],
      dayNumber: state.progress.dayNumber,
      puffs: state.progress.puffs,
      ashDropped: state.progress.ashDropped,
      smokeFreeDays: state.progress.smokeFreeDays,
    };
    unlocked.value = { ...state.collection.unlocked };
  };

  let lastBreakWriteMs = 0;
  /**
   * Write the running break down as it happens. The visible tab has the live simulation;
   * this is only for the case where the operating system takes the page away, which never
   * announces itself. §81 (4).
   */
  const persistBreak = (force = false): void => {
    if (!engine || !persistence) return;
    const now = Date.now();
    if (!force && now - lastBreakWriteMs < BREAK_WRITE_MS) return;
    const record = engine.openBreakSnapshot();
    if (record === null) return;
    lastBreakWriteMs = now;
    void persistence.saveOpenBreak(record).catch(() => undefined);
  };

  const persistProgress = (): void => {
    if (!engine || !persistence) return;
    void persistence.saveProgress(engine.progressSnapshot());
  };

  const closeSession = (): void => {
    if (!engine || !persistence) return;
    const session = engine.endSession();
    if (!session) return;
    sessions = [...sessions, session];
    void persistence
      .putSession(session)
      .then(() => {
        storageDegraded.value = persistence?.isDegraded() ?? false;
      })
      .catch(() => {
        storageDegraded.value = true;
      });
    persistProgress();
    void persistence.clearOpenBreak().catch(() => undefined);
    recompute();
    refreshSummary();
  };

  const handleEngineEvent = (event: EngineEvent): void => {
    renderer?.handleEvent(event);
    const state = engine?.getState();
    if (audio && state) audio.handle(event, state);
    if (event.kind !== 'session' || !engine || !state) return;

    if (event.event.type === SessionEventType.LIGHT) persistBreak(true);
    if (event.event.type === SessionEventType.LIGHT && !state.ui.sessionActive) {
      // A break begins the moment something is lit — nothing asks the player first (§31).
      engine.startSession();
    }
    const type = event.event.type;
    if (type === SessionEventType.LIGHT) haptic(24);
    else if (type === SessionEventType.ASH) haptic([9, 26, 9]);
    else if (type === SessionEventType.EXTINGUISH) haptic(64);
    else if (type === SessionEventType.DISCARD) haptic([14, 40, 20]);

    if (event.event.type === SessionEventType.DISCARD) {
      // It ends when the stub goes into the tray. No dialog, no confirmation (§62).
      window.setTimeout(closeSession, 240);
    }
  };

  const frame = (nowMs: number): void => {
    if (!engine) return;
    const raw = lastFrameMs === 0 ? 1000 / 60 : Math.max(nowMs - lastFrameMs, 0);
    const dt = Math.min(raw, 250);
    lastFrameMs = nowMs;
    if (document.hidden) simulatedWhileHiddenMs += raw;

    watchFrames(dt);
    engine.tick(dt);
    const live = engine.getState();
    renderer?.render(live, dt);
    // Continuous beds follow the state every frame; cues arrive as events (§26, §27).
    audio?.sync(live);

    summaryAccumulator += dt;
    if (summaryAccumulator >= SUMMARY_INTERVAL_MS) {
      summaryAccumulator = 0;
      refreshSummary();
      if (engine?.getState().ui.sessionActive) persistBreak();
      const state = engine.getState();
      const quiet = state.ui.idleMs > IDLE_CLOSE_MS && !state.cigarette.ember.lit;
      if (state.ui.sessionActive && quiet) closeSession();
    }

    raf = requestAnimationFrame(frame);
  };

  const dprFor = (): number =>
    Math.min(window.devicePixelRatio || 1, coarsePointer() ? MAX_DPR_COARSE : MAX_DPR);

  const resize = (canvas: HTMLCanvasElement): void => {
    // On a phone the layout viewport can be shorter than the visual one while the browser
    // chrome slides away; `visualViewport` is the height the player actually has (§66).
    const visual = typeof window === 'undefined' ? null : window.visualViewport;
    const cssWidth = Math.round(visual?.width || canvas.clientWidth || 640);
    const cssHeight = Math.round(visual?.height || canvas.clientHeight || 960);
    const dpr = dprFor();
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    viewport.resize(cssWidth, cssHeight, dpr);
    renderer?.setViewport(cssWidth, cssHeight, dpr);
    // The core owns hit-testing, so it has to know the same shape the canvas just became.
    engine?.setStageAspect(viewport.aspect);
  };

  const attach = async (canvas: HTMLCanvasElement): Promise<void> => {
    persistence = createPersistence();
    const loaded = await persistence.load(Date.now());
    settings.value = {
      ...loaded.settings,
      selection: loaded.settings.selection ?? { ...DEFAULT_IDS },
    };
    if (!loaded.hadStoredSettings && prefersReducedMotion()) {
      settings.value = { ...settings.value, reducedMotion: true };
    }

    const selection = settings.value.selection ?? DEFAULT_IDS;
    const game = createEngine({
      content,
      seed: freshSeed(),
      wallClockMs: Date.now(),
      settings: settings.value,
      progress: loaded.progress,
      cigaretteId: selection.cigarette,
      environmentId: selection.environment,
      lighterId: selection.lighter,
      ashtrayId: selection.ashtray,
    });
    engine = game;
    sessions = loaded.sessions;

    // A break the operating system interrupted, rather than the player leaving it: come
    // back to the rod that was burning, at the position the wall clock says it reached.
    // §81 (4).
    const interrupted = await persistence.loadOpenBreak().catch(() => null);
    if (interrupted !== null) {
      const ageMs = Date.now() - interrupted.savedAtWallMs;
      const stillChosen =
        interrupted.cigaretteId === selection.cigarette &&
        interrupted.environmentId === selection.environment &&
        interrupted.lighterId === selection.lighter &&
        interrupted.ashtrayId === selection.ashtray;
      if (ageMs >= 0 && ageMs <= INTERRUPTED_MAX_AGE_MS && stillChosen) {
        game.restoreOpenBreak(interrupted, Date.now());
        lastBreakWriteMs = Date.now();
      } else {
        // Stale, or the player has since chosen something else: the rod on the table is
        // the honest state, and the record goes with it.
        void persistence.clearOpenBreak().catch(() => undefined);
      }
    }

    const context = canvas.getContext('2d');
    if (context) {
      renderer = createCanvasRenderer({
        ctx: context,
        grainTile: createGrainTile(defaultSpriteFactory(), 128),
        width: canvas.clientWidth || 640,
        height: canvas.clientHeight || 960,
        dpr: dprFor(),
        settings: {
          reducedMotion: settings.value.reducedMotion,
          quality: effectiveQuality(),
          contrast: settings.value.contrast,
        },
      });
    }
    resize(canvas);

    // The very first aspect has to be in place before a pointer can be aimed at anything.
    engine?.setStageAspect(viewport.aspect);

    audio = createAudioBridge(content, settings.value);
    audioAvailable.value = audio.available();
    storageDegraded.value = persistence.isDegraded();

    stop.push(game.on(handleEngineEvent));

    const pointer = createPointerAdapter(canvas, game, () => ({
      cssWidth: viewport.cssWidth,
      cssHeight: viewport.cssHeight,
      stage: viewport.stage,
    }));
    const keyboard = createKeyboardAdapter(window, game, () =>
      targetForAffordance(game.getState()),
    );
    const guard = createSurfaceGuard();
    pointer.attach();
    keyboard.attach();
    guard.attach();
    stop.push(() => {
      pointer.detach();
      keyboard.detach();
      guard.detach();
    });

    // Capture phase on the window, before the game's own pointer handler: the tap that unlocks
    // the audio context is the first sound the player is owed, and a handler bound after the
    // adapter's runs one step too late to matter (§26).
    const unlockAudio = (): void => audio?.unlock();
    window.addEventListener('pointerdown', unlockAudio, { capture: true });
    window.addEventListener('keydown', unlockAudio, { capture: true });
    stop.push(() => {
      window.removeEventListener('pointerdown', unlockAudio, { capture: true });
      window.removeEventListener('keydown', unlockAudio, { capture: true });
    });

    let hiddenAtMs = 0;
    const onVisibility = (): void => {
      if (document.hidden) {
        simulatedWhileHiddenMs = 0;
        // The last write before the page might never come back.
        persistBreak(true);
        hiddenAtMs = Date.now();
        // Whatever the finger was doing is over: a hold left hanging would otherwise draw the
        // rod down for as long as the tab stayed asleep.
        game.send({
          type: 'release',
          x: 0,
          y: 0,
          timestamp: game.getState().nowMs,
          source: 'keyboard',
        });
        audio?.suspend();
        const state = game.getState();
        if (state.ui.sessionActive && !state.cigarette.ember.lit) closeSession();
        return;
      }

      audio?.resume();
      lastFrameMs = 0;
      const asleepMs = hiddenAtMs > 0 ? Date.now() - hiddenAtMs - simulatedWhileHiddenMs : 0;
      hiddenAtMs = 0;
      simulatedWhileHiddenMs = 0;
      if (asleepMs >= CATCH_UP_MIN_MS) {
        game.advance(Math.min(asleepMs, CATCH_UP_MAX_MS));
        refreshSummary();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    stop.push(() => document.removeEventListener('visibilitychange', onVisibility));

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => resize(canvas));
      observer.observe(canvas);
      stop.push(() => observer.disconnect());
    } else {
      window.addEventListener('resize', () => resize(canvas));
    }

    // Mobile chrome sliding away changes the visual viewport without resizing any element, and
    // an orientation flip fires neither reliably (§66).
    const onViewportShift = (): void => resize(canvas);
    const visual = window.visualViewport;
    if (visual) {
      visual.addEventListener('resize', onViewportShift);
      stop.push(() => visual.removeEventListener('resize', onViewportShift));
    }
    window.addEventListener('orientationchange', onViewportShift);
    stop.push(() => window.removeEventListener('orientationchange', onViewportShift));

    stop.push(() => {
      cancelAnimationFrame(raf);
      audio?.dispose();
      renderer?.dispose();
    });

    recompute();
    refreshSummary();
    ready.value = true;
    raf = requestAnimationFrame((now) => {
      lastFrameMs = now;
      frame(now);
    });
  };

  const persistSettingsSoon = (): void => {
    if (!persistence) return;
    window.clearTimeout(saveTimer);
    const store = persistence;
    if (!store) return;
    saveTimer = window.setTimeout(() => {
      void store.saveSettings(settings.value);
      storageDegraded.value = store.isDegraded();
    }, 400);
  };

  onBeforeUnmount(() => {
    for (const halt of stop) halt();
    stop = [];
    window.clearTimeout(saveTimer);
    closeSession();
  });

  return {
    ready,
    summary,
    settings,
    stats,
    today,
    journey,
    triggers,
    items,
    unlocked,
    audioAvailable,
    storageDegraded,
    canVibrate,
    attach,
    setSettings(patch) {
      settings.value = { ...settings.value, ...patch };
      if (patch.quality === 'auto') autoTier = startingTier();
      engine?.setSettings({ ...settings.value, quality: effectiveQuality() });
      renderer?.setSettings({
        reducedMotion: settings.value.reducedMotion,
        quality: effectiveQuality(),
        contrast: settings.value.contrast,
      });
      audio?.setSettings(settings.value);
      const root = document.documentElement;
      if (root) {
        root.style.setProperty('--text-scale', String(settings.value.textScale));
        // High contrast is also a CSS concern: chrome must stay readable over the scene (§64).
        root.dataset['contrast'] = settings.value.contrast;
      }
      persistSettingsSoon();
      refreshSummary();
    },
    select(selection) {
      const next = { ...(settings.value.selection ?? DEFAULT_IDS), ...selection };
      settings.value = { ...settings.value, selection: next };
      if (!engine) return;
      if (selection.cigarette) engine.selectCigarette(selection.cigarette);
      if (selection.environment) engine.selectEnvironment(selection.environment);
      if (selection.lighter) engine.selectLighter(selection.lighter);
      if (selection.ashtray) engine.selectAshtray(selection.ashtray);
      persistSettingsSoon();
      persistProgress();
      refreshSummary();
    },
    setCraving(level, phase) {
      if (!engine) return;
      if (!engine.getState().ui.sessionActive) engine.startSession();
      engine.setCraving(level, phase);
      refreshSummary();
    },
    addTrigger(tag) {
      if (!engine) return;
      if (!engine.getState().ui.sessionActive) engine.startSession();
      engine.addTrigger(tag);
      refreshSummary();
    },
    acknowledgeUnlocks() {
      engine?.acknowledgeUnlocks();
      persistProgress();
      refreshSummary();
    },
    endBreak() {
      closeSession();
    },
    async exportJson() {
      if (!engine || !persistence) return '{}';
      if (engine.getState().ui.sessionActive) closeSession();
      persistProgress();
      return persistence.download();
    },
    async importJson(json) {
      if (!persistence) return { ok: false, errors: ['storage unavailable'] };
      const result = await persistence.restore(json);
      if (result.ok) {
        const loaded = await persistence.load(Date.now());
        sessions = loaded.sessions;
        settings.value = {
          ...loaded.settings,
          selection: loaded.settings.selection ?? { ...DEFAULT_IDS },
        };
        engine?.setSettings(settings.value);
        recompute();
        refreshSummary();
      }
      return result;
    },
  };
}
