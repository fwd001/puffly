<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { createPuffly } from './composables/usePuffly';
import { ANCHOR_LOCALE, STATE_KEYS } from './i18n';
import HudBar from './components/HudBar.vue';
import CtaPill from './components/CtaPill.vue';
import TabRail from './components/TabRail.vue';
import ArchiveCard from './components/ArchiveCard.vue';
import SettingsSheet from './components/SettingsSheet.vue';
import SessionSheet from './components/SessionSheet.vue';
import CollectionSheet from './components/CollectionSheet.vue';

const canvas = ref<HTMLCanvasElement | null>(null);
const game = createPuffly();
/** The three sheets the rail and the head-up row can call up. The menu is gone: the rail is the menu. */
type SheetName = 'none' | 'break' | 'shelf' | 'settings';
const sheet = ref<SheetName>('none');

/**
 * S17's card, and whether the player pinned it. Pinning is the only reason tier three exists:
 * a held card that disappears when the finger moves is a tooltip, not an archive.
 */
const archiveOpen = ref(false);
const archivePinned = ref(false);

// A swipe down folds the interface, and a sheet left open is the loudest part of it.
watch(
  () => game.summary.value.state?.ui.chromeFolded ?? false,
  (folded) => {
    if (!folded) return;
    sheet.value = 'none';
    archivePinned.value = false;
    archiveOpen.value = false;
  },
);

const summary = computed(() => game.summary.value);

/**
 * Whether the chrome is on screen. The core decides this once (`ui.controlsVisible`) so the head-up
 * row, the pill and the rail all fold together and none of them can invent its own timer (§10).
 */
const chrome = computed(() => summary.value.controlsVisible || sheet.value !== 'none');

/**
 * Screen-reader prose lives here and nowhere else (§4, §64): a blind user hears the state, a
 * sighted user sees a scene. The one word a sighted player may read is the hint over the object
 * the engine is nudging (§28) — a verb, never a sentence, and it is off for screen readers
 * because the label below already says the same thing out loud.
 */
const announced = computed(() => {
  const copy = game.copy.value;
  const state = summary.value.state;
  const name = copy.say('app.name');
  if (!state) return name;
  const key = STATE_KEYS[state.cigarette.state];
  return `${name} — ${key === undefined ? state.cigarette.state : copy.say(key)}`;
});

/**
 * §9's third tier is a whole interface, not a colour: the document itself has to say which
 * language it is in and which way it reads, or a screen reader spells Arabic as Latin and a
 * sheet lays itself out in the wrong direction. The scene never follows — only the chrome does.
 */
watch(
  game.locale,
  (locale) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.lang = locale === 'icons' ? ANCHOR_LOCALE : locale;
    root.dir = game.copy.value.rtl ? 'rtl' : 'ltr';
  },
  { immediate: true },
);

onMounted(() => {
  if (canvas.value) void game.attach(canvas.value);
});

function openSheet(next: SheetName): void {
  sheet.value = sheet.value === next ? 'none' : next;
}
</script>

<template>
  <main
    class="stage"
    :data-cues="summary.cueChannel"
    :data-break="summary.clock"
    :data-phase="summary.phase"
  >
    <canvas ref="canvas" tabindex="0" :aria-label="announced" />

    <p
      v-if="summary.hint !== null && sheet === 'none'"
      class="hint"
      aria-hidden="true"
      :style="{ left: `${summary.hint?.x ?? 0}px`, top: `${summary.hint?.y ?? 0}px` }"
    >
      {{ summary.hint?.word }}
    </p>

    <HudBar
      v-show="chrome"
      :game="game"
      @shelf="openSheet('shelf')"
      @break="openSheet('break')"
      @archive="archiveOpen = true"
    />

    <ArchiveCard
      v-if="archiveOpen"
      :game="game"
      :pinned="archivePinned"
      @close="
        () => {
          archiveOpen = false;
          archivePinned = false;
        }
      "
      @pin="archivePinned = $event"
    />

    <CtaPill v-show="chrome" :game="game" />

    <TabRail
      v-show="chrome"
      :game="game"
      :settings-open="sheet === 'settings'"
      @settings="openSheet('settings')"
    />

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
