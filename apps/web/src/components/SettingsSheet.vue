<script setup lang="ts">
/**
 * Settings — §44, §64, §65.
 *
 * Every row is a word and a control. It used to be a row of glyphs with the words hidden in
 * `aria-label`, which was honest about the product being wordless and unhelpful to a person
 * holding a phone: nine marks, no idea what any of them did. The scene still owns the game —
 * this sheet is not required to play it, and nothing here is a sentence.
 */
import { computed, nextTick, ref, watch } from 'vue';
import type { QualityMode } from '@puffly/game-core';
import type { Puffly } from '../composables/usePuffly';

const props = defineProps<{ open: boolean; game: Puffly }>();
const emit = defineEmits<{ close: [] }>();

const settings = computed(() => props.game.settings.value);
const fileInput = ref<HTMLInputElement | null>(null);
const importState = ref<'idle' | 'ok' | 'bad'>('idle');
const root = ref<HTMLElement | null>(null);

function mark(state: 'idle' | 'ok' | 'bad'): void {
  importState.value = state;
  window.setTimeout(() => {
    importState.value = 'idle';
  }, 2400);
}

async function download(): Promise<void> {
  const json = await props.game.exportJson();
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'puffly.json';
  link.click();
  URL.revokeObjectURL(url);
}

async function readFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const text = await file.text();
  const result = await props.game.importJson(text);
  mark(result.ok ? 'ok' : 'bad');
  input.value = '';
}

/**
 * Three steps rather than a dial (§14 of the mobile brief): enough, a little, none. The ambient
 * bed keeps its own slider because wind and a room are the two sounds a player may want apart.
 */
const SOUND_STEPS = [
  { glyph: '🔊', word: 'enough', volume: 0.7, muted: false },
  { glyph: '🔉', word: 'a little', volume: 0.25, muted: false },
  { glyph: '🔇', word: 'none', volume: 0.7, muted: true },
] as const;

const soundStep = computed(() => (settings.value.muted ? 2 : settings.value.volume > 0.45 ? 0 : 1));

function cycleSound(): void {
  const next = SOUND_STEPS[(soundStep.value + 1) % SOUND_STEPS.length];
  if (next) props.game.setSettings({ volume: next.volume, muted: next.muted });
}

/** The particle budget, named for what it changes on the screen instead of how it works. */
const SMOKE_STEPS: readonly { mode: QualityMode; glyph: string; word: string }[] = [
  { mode: 'light', glyph: '·', word: 'soft' },
  { mode: 'balanced', glyph: '••', word: 'normal' },
  { mode: 'high', glyph: '✦', word: 'dense' },
];

const AUTO: { mode: QualityMode; glyph: string; word: string } = {
  mode: 'auto',
  glyph: '◌',
  word: 'auto',
};

function minutesToMs(minutes: number): number {
  return Math.round(minutes * 60_000);
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    void nextTick(() => root.value?.scrollTo({ top: 0 }));
  },
);
</script>

<template>
  <section ref="root" class="sheet" :data-open="open" aria-label="Settings">
    <header class="head">
      <span class="mark" aria-hidden="true">⚙</span>
      <span v-if="!game.audioAvailable.value" class="warn" aria-label="audio unavailable">🔇</span>
      <span v-if="game.storageDegraded.value" class="warn" aria-label="memory only">◍</span>
      <button class="icon-button close" aria-label="close" @click="emit('close')">×</button>
    </header>

    <div class="row">
      <span class="label">Sound</span>
      <button class="choice" aria-label="sound level" @click="cycleSound">
        <span class="glyph" aria-hidden="true">{{ SOUND_STEPS[soundStep]?.glyph }}</span>
        <span class="sub">{{ SOUND_STEPS[soundStep]?.word }}</span>
      </button>
      <input
        v-if="!settings.muted"
        class="grow"
        type="range"
        min="0"
        max="100"
        :value="Math.round(settings.ambientVolume * 100)"
        aria-label="ambient"
        @input="
          game.setSettings({
            ambientVolume: Number(($event.target as HTMLInputElement).value) / 100,
          })
        "
      />
    </div>

    <div class="row">
      <span class="label">Smoke</span>
      <button
        v-for="option in [AUTO, ...SMOKE_STEPS]"
        :key="option.mode"
        class="choice"
        :aria-pressed="settings.quality === option.mode"
        :aria-label="`smoke ${option.word}`"
        @click="game.setSettings({ quality: option.mode })"
      >
        <span class="glyph" aria-hidden="true">{{ option.glyph }}</span>
        <span class="sub">{{ option.word }}</span>
      </button>
    </div>

    <div class="row">
      <span class="label">Break</span>
      <input
        class="grow"
        type="range"
        min="30"
        max="600"
        step="30"
        :value="settings.sessionTargetMs / 60000"
        aria-label="break length in minutes"
        @input="
          game.setSettings({
            sessionTargetMs: minutesToMs(Number(($event.target as HTMLInputElement).value)),
          })
        "
      />
      <span class="digits">{{ Math.round(settings.sessionTargetMs / 60000) }}</span>
    </div>

    <div class="row">
      <span class="label">Word</span>
      <button
        class="icon-button"
        :aria-pressed="settings.hints"
        aria-label="hint words"
        @click="game.setSettings({ hints: !settings.hints })"
      >
        ✎
      </button>
      <span class="hint-preview" aria-hidden="true">{{ settings.hints ? 'tap' : '' }}</span>
    </div>

    <div class="row">
      <span class="label">Look</span>
      <button
        class="icon-button"
        :aria-pressed="settings.reducedMotion"
        aria-label="reduced motion"
        @click="game.setSettings({ reducedMotion: !settings.reducedMotion })"
      >
        ◌
      </button>
      <button
        class="icon-button"
        :aria-pressed="settings.contrast === 'high'"
        aria-label="high contrast"
        @click="game.setSettings({ contrast: settings.contrast === 'high' ? 'normal' : 'high' })"
      >
        ◑
      </button>
      <input
        class="grow"
        type="range"
        min="90"
        max="150"
        step="5"
        :value="Math.round(settings.textScale * 100)"
        aria-label="text size"
        @input="
          game.setSettings({
            textScale: Number(($event.target as HTMLInputElement).value) / 100,
          })
        "
      />
    </div>

    <div v-if="game.canVibrate.value" class="row">
      <span class="label">Vibration</span>
      <button
        class="icon-button"
        :aria-pressed="settings.haptics"
        aria-label="haptics"
        @click="game.setSettings({ haptics: !settings.haptics })"
      >
        ⌁
      </button>
    </div>

    <div class="row">
      <span class="label">Anchor</span>
      <input
        class="date grow"
        type="date"
        :value="
          settings.quitAnchorTimestamp
            ? new Date(settings.quitAnchorTimestamp).toISOString().slice(0, 10)
            : ''
        "
        aria-label="quit anchor date"
        @change="
          {
            const raw = ($event.target as HTMLInputElement).value;
            game.setSettings({
              quitAnchorTimestamp: raw ? Date.parse(`${raw}T00:00:00Z`) : undefined,
            });
          }
        "
      />
    </div>

    <div class="row">
      <span class="label">Data</span>
      <button class="icon-button" aria-label="export" @click="download()">⤓</button>
      <button class="icon-button" aria-label="import" @click="fileInput?.click()">⤒</button>
      <span v-if="importState !== 'idle'" class="state" :class="importState" aria-hidden="true">
        {{ importState === 'ok' ? '✓' : '!' }}
      </span>
      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        hidden
        @change="readFile"
      />
    </div>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.mark {
  color: var(--smoke-gray);
}

.close {
  margin-left: auto;
}

.warn {
  opacity: 0.6;
}

/* One row per decision: the word on the left, the control on the right of it. */
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: var(--tap-target, 44px);
  margin: 2px 0;
}

.label {
  width: 88px;
  flex: none;
  color: var(--smoke-gray);
  font-size: calc(13px * var(--text-scale));
  letter-spacing: 0.06em;
}

.grow {
  flex: 1;
  min-width: 0;
}

.digits {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
  min-width: 3ch;
  text-align: right;
}

/* A control you have to guess at is the thing this sheet used to be. */
.choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: var(--tap-target, 44px);
  min-height: var(--tap-target, 44px);
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--soft-white);
  font: inherit;
  transition:
    border-color 180ms var(--ease-out),
    background-color 180ms var(--ease-out);
}

.choice[aria-pressed='true'] {
  border-color: var(--ember-orange);
  background: color-mix(in oklab, var(--ember-orange) 14%, transparent);
}

.choice .glyph {
  font-size: calc(15px * var(--text-scale));
  line-height: 1;
}

.choice .sub {
  color: var(--smoke-gray);
  font-size: calc(10px * var(--text-scale));
  letter-spacing: 0.08em;
}

.hint-preview {
  min-width: 4ch;
  color: var(--soft-white);
  font-size: calc(11px * var(--text-scale));
  letter-spacing: 0.26em;
  text-transform: uppercase;
  opacity: 0.7;
}

.date {
  background: transparent;
  border: 1px solid var(--chrome-line);
  border-radius: var(--radius);
  color: var(--soft-white);
  padding: 8px 10px;
  font: inherit;
}

.state {
  color: var(--ember-core);
}

.state.bad {
  color: #e2604a;
}
</style>
