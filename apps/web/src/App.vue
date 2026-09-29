<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { createPuffly } from './composables/usePuffly';
import SessionClock from './components/SessionClock.vue';
import ChromeBar from './components/ChromeBar.vue';
import SettingsSheet from './components/SettingsSheet.vue';
import SessionSheet from './components/SessionSheet.vue';
import CollectionSheet from './components/CollectionSheet.vue';

const canvas = ref<HTMLCanvasElement | null>(null);
const game = createPuffly();
const sheet = ref<'none' | 'settings' | 'session' | 'collection'>('none');

const summary = computed(() => game.summary.value);

/**
 * Screen-reader text lives here and nowhere visible (SPEC.md §4, §64): a blind user hears
 * the state, a sighted user sees it.
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

function openSheet(next: typeof sheet.value): void {
  sheet.value = sheet.value === next ? 'none' : next;
}
</script>

<template>
  <main class="stage">
    <canvas ref="canvas" tabindex="0" :aria-label="announced" />

    <SessionClock
      :clock="summary.clock"
      :active="summary.sessionActive && game.settings.value.showClock"
      :fading="!summary.controlsVisible"
      :reached="summary.targetReached"
    />

    <ChromeBar
      :visible="summary.controlsVisible || sheet !== 'none'"
      :affordance="summary.affordance"
      :open="sheet"
      :fresh="summary.fresh.length"
      @open="openSheet"
    />

    <SessionSheet :open="sheet === 'session'" :game="game" @close="sheet = 'none'" />
    <CollectionSheet :open="sheet === 'collection'" :game="game" @close="sheet = 'none'" />
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
</style>
