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
  targetForAffordance,
} from './useInputAdapters';

/** How often chrome is allowed to re-render (§54). */
const SUMMARY_INTERVAL_MS = 200;
/** A break is over when nothing is burning and the player has gone quiet this long. */
const IDLE_CLOSE_MS = 90_000;
/** Keep the canvas from costing more than it can show. */
const MAX_DPR = 3;

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

  let engine: GameEngine | null = null;
  let renderer: PufflyRenderer | null = null;
  let audio: AudioBridge | null = null;
  let persistence: Persistence | null = null;
  let sessions: Session[] = [];
  let stop: (() => void)[] = [];
  let raf = 0;
  let lastFrameMs = 0;
  let summaryAccumulator = 0;
  let saveTimer: number | undefined;

  /** Shared with the pointer adapter, so hit-testing and drawing agree on the letterbox (§55). */
  const viewport = createViewport({ width: 640, height: 960, dpr: 1 });

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
    recompute();
    refreshSummary();
  };

  const handleEngineEvent = (event: EngineEvent): void => {
    renderer?.handleEvent(event);
    const state = engine?.getState();
    if (audio && state) audio.handle(event, state);
    if (event.kind !== 'session' || !engine || !state) return;

    if (event.event.type === SessionEventType.LIGHT && !state.ui.sessionActive) {
      // A break begins the moment something is lit — nothing asks the player first (§31).
      engine.startSession();
    }
    if (event.event.type === SessionEventType.DISCARD) {
      // It ends when the stub goes into the tray. No dialog, no confirmation (§62).
      window.setTimeout(closeSession, 240);
    }
  };

  const frame = (nowMs: number): void => {
    if (!engine) return;
    const dt = lastFrameMs === 0 ? 1000 / 60 : Math.min(Math.max(nowMs - lastFrameMs, 0), 250);
    lastFrameMs = nowMs;

    engine.tick(dt);
    const live = engine.getState();
    renderer?.render(live, dt);
    // Continuous beds follow the state every frame; cues arrive as events (§26, §27).
    audio?.sync(live);

    summaryAccumulator += dt;
    if (summaryAccumulator >= SUMMARY_INTERVAL_MS) {
      summaryAccumulator = 0;
      refreshSummary();
      const state = engine.getState();
      const quiet = state.ui.idleMs > IDLE_CLOSE_MS && !state.cigarette.ember.lit;
      if (state.ui.sessionActive && quiet) closeSession();
    }

    raf = requestAnimationFrame(frame);
  };

  const resize = (canvas: HTMLCanvasElement): void => {
    const cssWidth = canvas.clientWidth || 640;
    const cssHeight = canvas.clientHeight || 960;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    viewport.resize(cssWidth, cssHeight, dpr);
    renderer?.setViewport(cssWidth, cssHeight, dpr);
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

    const context = canvas.getContext('2d');
    if (context) {
      renderer = createCanvasRenderer({
        ctx: context,
        grainTile: createGrainTile(defaultSpriteFactory(), 128),
        width: canvas.clientWidth || 640,
        height: canvas.clientHeight || 960,
        dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR),
        settings: {
          reducedMotion: settings.value.reducedMotion,
          quality: settings.value.quality,
          contrast: settings.value.contrast,
        },
      });
    }
    resize(canvas);

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
    pointer.attach();
    keyboard.attach();
    stop.push(() => {
      pointer.detach();
      keyboard.detach();
    });

    const unlockAudio = (): void => audio?.unlock();
    canvas.addEventListener('pointerdown', unlockAudio);
    stop.push(() => canvas.removeEventListener('pointerdown', unlockAudio));

    const onVisibility = (): void => {
      if (!audio) return;
      if (document.hidden) {
        audio.suspend();
        const state = game.getState();
        if (state.ui.sessionActive && !state.cigarette.ember.lit) closeSession();
      } else {
        audio.resume();
        lastFrameMs = 0;
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
    attach,
    setSettings(patch) {
      settings.value = { ...settings.value, ...patch };
      engine?.setSettings(settings.value);
      renderer?.setSettings({
        reducedMotion: settings.value.reducedMotion,
        quality: settings.value.quality,
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
