<script setup lang="ts">
/**
 * The menu: three words, because this is where the product is allowed to use them (§28).
 *
 * The scene owns the game and stays visible behind this sheet; the sheet only exists to name the
 * three places a player can go, which is the one thing an icon cannot do without a guess.
 */
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; open: ['break' | 'shelf' | 'settings'] }>();

const ENTRIES = [
  { id: 'break', glyph: '◍', word: 'this break' },
  { id: 'shelf', glyph: '✦', word: 'the shelf' },
  { id: 'settings', glyph: '⚙', word: 'settings' },
] as const;

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
  <section ref="root" class="sheet sheet--menu" :data-open="open" aria-label="Menu">
    <header class="head">
      <span class="mark" aria-hidden="true">···</span>
      <button class="icon-button close" aria-label="close" @click="emit('close')">×</button>
    </header>
    <button v-for="entry in ENTRIES" :key="entry.id" class="entry" @click="emit('open', entry.id)">
      <span class="glyph" aria-hidden="true">{{ entry.glyph }}</span>
      <span class="word">{{ entry.word }}</span>
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
  margin-left: auto;
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
  text-align: left;
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
