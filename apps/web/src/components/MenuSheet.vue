<script setup lang="ts">
/**
 * The menu: three words, because this is where the product is allowed to use them (§28).
 *
 * The scene owns the game and stays visible behind this sheet; the sheet only exists to name the
 * three places a player can go, which is the one thing an icon cannot do without a guess.
 */
import { nextTick, ref, watch } from 'vue';
import type { CopyKey, I18n } from '../i18n';

const props = defineProps<{ open: boolean; copy: I18n }>();
const emit = defineEmits<{ close: []; open: ['break' | 'shelf' | 'settings'] }>();

/**
 * Three marks and, on the two tiers that have words, three words. The glyph carries the entry on
 * its own, which is what lets `icons` delete the column without deleting the menu.
 */
const ENTRIES: readonly { id: 'break' | 'shelf' | 'settings'; glyph: string; key: CopyKey }[] = [
  { id: 'break', glyph: '◍', key: 'menu.break' },
  { id: 'shelf', glyph: '✦', key: 'menu.shelf' },
  { id: 'settings', glyph: '⚙', key: 'menu.settings' },
];

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
  <section
    ref="root"
    class="sheet sheet--menu"
    data-sheet="menu"
    :data-open="open"
    :aria-label="copy.say('a11y.sheetMenu')"
  >
    <header class="head">
      <span class="mark" aria-hidden="true">···</span>
      <button class="icon-button close" :aria-label="copy.say('a11y.close')" @click="emit('close')">
        ×
      </button>
    </header>
    <button
      v-for="entry in ENTRIES"
      :key="entry.id"
      class="entry"
      :data-entry="entry.id"
      :aria-label="copy.say(entry.key)"
      @click="emit('open', entry.id)"
    >
      <span class="glyph" aria-hidden="true">{{ entry.glyph }}</span>
      <span v-if="copy.t(entry.key) !== null" class="word">{{ copy.t(entry.key) }}</span>
    </button>
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
  letter-spacing: 0.12em;
}

.close {
  margin-inline-start: auto;
}

.entry {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: var(--tap-target, 44px);
  margin: 0 0 6px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--soft-white);
  font: inherit;
  /* Logical, not physical: an Arabic menu reads from the other edge (§9). */
  text-align: start;
  transition:
    background-color 180ms var(--ease-out),
    border-color 180ms var(--ease-out);
}

.entry:active,
.entry:hover {
  border-color: var(--chrome-line);
  background: color-mix(in oklab, var(--soft-white) 7%, transparent);
}

.glyph {
  width: 26px;
  color: var(--ember-core);
}

.word {
  letter-spacing: 0.08em;
}
</style>
