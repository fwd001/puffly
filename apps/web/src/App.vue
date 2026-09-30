<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { createPuffly } from './composables/usePuffly';
import ChromeBar from './components/ChromeBar.vue';
import MenuSheet from './components/MenuSheet.vue';
import SettingsSheet from './components/SettingsSheet.vue';
import SessionSheet from './components/SessionSheet.vue';
import CollectionSheet from './components/CollectionSheet.vue';

const canvas = ref<HTMLCanvasElement | null>(null);
const game = createPuffly();
type SheetName = 'none' | 'menu' | 'break' | 'shelf' | 'settings';
const sheet = ref<SheetName>('none');

// A swipe down folds the interface, and a sheet left open is the loudest part of it.
watch(
  () => game.summary.value.state?.ui.chromeFolded ?? false,
  (folded) => {
    if (folded) sheet.value = 'none';
  },
);

const summary = computed(() => game.summary.value);

/**
 * Screen-reader prose lives here and nowhere else (§4, §64): a blind user hears the state, a
 * sighted user sees a scene. The one word a sighted player may read is the hint over the object
 * the engine is nudging (§28) — a verb, never a sentence, and it is off for screen readers
 * because the label below already says the same thing out loud.
 */
const announced = computed(() => {
  const state = summary.value.state;
  if (!state) return 'Puffly';
  const words: Record<string, string> = {
    IDLE: 'a cigarette rests on the table',
    PICKED_UP: 'held, not lit',
    LIGHTING: 'lighting',
    BURNING: 'burning',
    PUFFING: 'drawing',
    RESTING: 'resting between puffs',
    ASH_READY: 'the ash is long',
    NEAR_END: 'nearly finished',
    EXTINGUISHING: 'putting it out',
    EXTINGUISHED: 'out',
    DISCARDED: 'in the tray',
  };
  return `Puffly — ${words[state.cigarette.state] ?? state.cigarette.state}`;
});

onMounted(() => {
  if (canvas.value) void game.attach(canvas.value);
});

function openSheet(next: SheetName): void {
  sheet.value = sheet.value === next ? 'none' : next;
}
</script>

<template>
  <main class="stage" :data-cues="summary.cueChannel" :data-break="summary.clock">
    <canvas ref="canvas" tabindex="0" :aria-label="announced" />

    <p
      v-if="summary.hint !== null && sheet === 'none'"
      class="hint"
      aria-hidden="true"
      :style="{ left: `${summary.hint?.x ?? 0}px`, top: `${summary.hint?.y ?? 0}px` }"
    >
      {{ summary.hint?.word }}
    </p>

    <ChromeBar
      :visible="summary.controlsVisible || sheet !== 'none'"
      :open="sheet === 'menu'"
      :fresh="summary.fresh.length"
      @open="openSheet('menu')"
    />

    <MenuSheet :open="sheet === 'menu'" @close="sheet = 'none'" @open="openSheet" />

    <SessionSheet :open="sheet === 'break'" :game="game" @close="sheet = 'none'" />
    <CollectionSheet :open="sheet === 'shelf'" :game="game" @close="sheet = 'none'" />
    <SettingsSheet :open="sheet === 'settings'" :game="game" @close="sheet = 'none'" />
  </main>
</template>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}

/*
 * One word, naming the gesture the halo is asking for (§28). It is deliberately not a button
 * and takes no taps: `pointer-events: none` keeps the object underneath it reachable, which is
 * the whole point of putting the word on the scene rather than on the bar.
 */
.hint {
  position: absolute;
  transform: translate(-50%, -50%);
  margin: 0;
  color: var(--soft-white);
  font-size: calc(11px * var(--text-scale));
  letter-spacing: 0.26em;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0.66;
  pointer-events: none;
  text-shadow: 0 1px 8px rgb(0 0 0 / 0.85);
  animation: hint-in 420ms var(--ease-out);
  transition: opacity 260ms var(--ease-out);
}

@keyframes hint-in {
  from {
    opacity: 0;
    transform: translate(-50%, -42%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hint {
    animation: none;
  }
}
</style>
