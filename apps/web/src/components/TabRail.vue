<script setup lang="ts">
/**
 * The rail from S1–S6: three phases and a way to settings.
 *
 * The three phases are indicators, not buttons — the cigarette decides which one you are on, and
 * nothing about the scene can be reached from here that a finger on the scene cannot reach
 * faster. Only `settings` is a control, because that is the one place the interface is allowed to
 * be an interface (§10).
 */
import { computed } from 'vue';
import type { Puffly } from '../composables/usePuffly';
import type { CopyKey } from '../i18n';
import type { Phase } from '../phase';

const props = defineProps<{ game: Puffly; settingsOpen: boolean }>();
const emit = defineEmits<{ settings: [] }>();

const copy = computed(() => props.game.copy.value);
const phase = computed(() => props.game.summary.value.phase);

const TABS: readonly { id: Phase; glyph: string; key: CopyKey }[] = [
  { id: 'light', glyph: '△', key: 'tab.light' },
  { id: 'puff', glyph: '—·', key: 'tab.puff' },
  { id: 'tray', glyph: '○', key: 'tab.tray' },
];

const on = (id: Phase): boolean => !props.settingsOpen && phase.value === id;
</script>

<template>
  <nav class="rail" :aria-label="copy.say('a11y.hud.rail')">
    <span
      v-for="tab in TABS"
      :key="tab.id"
      class="tab"
      :data-tab="tab.id"
      :data-on="on(tab.id)"
      :aria-current="on(tab.id) ? 'step' : undefined"
    >
      <span class="glyph" aria-hidden="true">{{ tab.glyph }}</span>
      <span v-if="copy.t(tab.key) !== null" class="word">{{ copy.t(tab.key) }}</span>
    </span>

    <button
      class="tab"
      data-tab="settings"
      :data-on="settingsOpen"
      :aria-label="copy.say('tab.settings')"
      @click="emit('settings')"
    >
      <span class="glyph" aria-hidden="true">☼</span>
      <span v-if="copy.t('tab.settings') !== null" class="word">{{ copy.t('tab.settings') }}</span>
    </button>
  </nav>
</template>

<style scoped>
.rail {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: stretch;
  gap: 2px;
  margin-bottom: calc(8px + env(safe-area-inset-bottom));
  padding: 4px;
  border: 1px solid var(--chrome-line);
  border-radius: 26px;
  background: color-mix(in oklab, var(--deep-charcoal) 72%, transparent);
  z-index: 3;
}

.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 62px;
  min-height: 46px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 22px;
  background: transparent;
  color: var(--smoke-gray);
  font: inherit;
  font-size: calc(10px * var(--text-scale));
  letter-spacing: 0.06em;
  transition:
    color 200ms var(--ease-out),
    background-color 200ms var(--ease-out),
    border-color 200ms var(--ease-out);
}

/* The lit tab is the only filled thing down here: it says where the cigarette is, not what to tap. */
.tab[data-on='true'] {
  color: #1a1109;
  background: linear-gradient(
    100deg,
    color-mix(in oklab, var(--ember-orange) 88%, var(--deep-charcoal)),
    var(--ember-orange)
  );
  border-color: transparent;
}

.tab .glyph {
  font-size: calc(12px * var(--text-scale));
  line-height: 1;
}

button.tab[data-on='false']:hover,
button.tab[data-on='false']:active {
  color: var(--soft-white);
  border-color: var(--chrome-line);
}
</style>
