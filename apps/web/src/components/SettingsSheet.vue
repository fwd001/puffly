<script setup lang="ts">
/**
 * Settings — §44, §64, §65.
 *
 * Icons, sliders and toggles only. The necessary words live in `aria-label`, where a screen
 * reader needs them and a player never sees them. Nothing here is required to play: the game
 * is fully usable with the defaults, which is the point of §5.
 */
import { computed, nextTick, ref, watch } from 'vue';
import type { QualityMode } from '@puffly/game-core';
import type { Puffly } from '../composables/usePuffly';

const props = defineProps<{ open: boolean; game: Puffly }>();
const emit = defineEmits<{ close: [] }>();

const settings = computed(() => props.game.settings.value);
const fileInput = ref<HTMLInputElement | null>(null);
const importState = ref<'idle' | 'ok' | 'bad'>('idle');

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

const QUALITY: readonly { mode: QualityMode; glyph: string }[] = [
  { mode: 'auto', glyph: '◌' },
  { mode: 'light', glyph: '·' },
  { mode: 'balanced', glyph: '••' },
  { mode: 'high', glyph: '✦' },
];

function minutesToMs(minutes: number): number {
  return Math.round(minutes * 60_000);
}
const root = ref<HTMLElement | null>(null);

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
      <span class="mark">⚙</span>
      <span v-if="!game.audioAvailable.value" class="warn" aria-label="audio unavailable">🔇</span>
      <span v-if="game.storageDegraded.value" class="warn" aria-label="memory only">◍</span>
      <button class="icon-button close" aria-label="close" @click="emit('close')">×</button>
    </header>

    <div class="toggle-row">
      <span class="g" aria-hidden="true">🔈</span>
      <input
        type="range"
        min="0"
        max="100"
        :value="Math.round(settings.volume * 100)"
        aria-label="volume"
        @input="
          game.setSettings({ volume: Number(($event.target as HTMLInputElement).value) / 100 })
        "
      />
      <button
        class="icon-button"
        :aria-pressed="settings.muted"
        aria-label="mute"
        @click="game.setSettings({ muted: !settings.muted })"
      >
        {{ settings.muted ? '✕' : '◦' }}
      </button>
    </div>

    <div class="toggle-row">
      <span class="g" aria-hidden="true">🌫️</span>
      <input
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

    <div class="toggle-row">
      <span class="g" aria-hidden="true">≈</span>
      <input
        type="range"
        min="30"
        max="600"
        step="30"
        :value="settings.sessionTargetMs / 60000"
        aria-label="break length"
        @input="
          game.setSettings({
            sessionTargetMs: minutesToMs(Number(($event.target as HTMLInputElement).value)),
          })
        "
      />
      <span class="digits">{{ Math.round(settings.sessionTargetMs / 60000) }}</span>
    </div>

    <div class="toggle-row">
      <span class="g" aria-hidden="true">◐</span>
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
      <button
        class="icon-button"
        :aria-pressed="settings.showClock"
        aria-label="clock"
        @click="game.setSettings({ showClock: !settings.showClock })"
      >
        ◷
      </button>
      <button
        v-if="game.canVibrate.value"
        class="icon-button"
        :aria-pressed="settings.haptics"
        aria-label="haptics"
        @click="game.setSettings({ haptics: !settings.haptics })"
      >
        ⌁
      </button>
    </div>

    <div class="toggle-row">
      <span class="g" aria-hidden="true">A</span>
      <input
        type="range"
        min="90"
        max="150"
        step="5"
        :value="Math.round(settings.textScale * 100)"
        aria-label="text scale"
        @input="
          game.setSettings({ textScale: Number(($event.target as HTMLInputElement).value) / 100 })
        "
      />
    </div>

    <div class="row">
      <button
        v-for="option in QUALITY"
        :key="option.mode"
        class="icon-button"
        :aria-pressed="settings.quality === option.mode"
        :aria-label="`quality ${option.mode}`"
        @click="game.setSettings({ quality: option.mode })"
      >
        {{ option.glyph }}
      </button>
    </div>

    <div class="toggle-row">
      <span class="g" aria-hidden="true">✱</span>
      <input
        type="date"
        class="date"
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

.g {
  width: 26px;
  opacity: 0.7;
}

.digits {
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
  min-width: 3ch;
  text-align: right;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0;
}

.date {
  flex: 1;
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
