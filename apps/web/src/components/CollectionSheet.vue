<script setup lang="ts">
/**
 * The collection cabinet — §38, §39.
 *
 * Six shelves, drawn from each item's own palette. A locked card is a dim glyph; a card that
 * just unlocked pulses in on its own and then settles. Tapping an unlocked card *uses* it, so
 * the cabinet doubles as the picker and there is no separate menu to explain (§0).
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
  CollectionCategory,
  type CollectionCategoryValue,
  type CollectionItem,
  type Selection,
} from '@puffly/game-core';
import { DEFAULT_CONTENT } from '@puffly/game-content';
import { rgbToCss } from '@puffly/shared';
import type { Puffly } from '../composables/usePuffly';
const props = defineProps<{ open: boolean; game: Puffly }>();
const emit = defineEmits<{ close: [] }>();

/** Item names are content data, not copy: an archive entry is spelled the way it ships (§9). */
const copy = computed(() => props.game.copy.value);

const SHELF: readonly { category: string; glyph: string }[] = [
  { category: CollectionCategory.CIGARETTES, glyph: '—' },
  { category: CollectionCategory.LIGHTERS, glyph: '△' },
  { category: CollectionCategory.ENVIRONMENTS, glyph: '▢' },
  { category: CollectionCategory.ASHTRAYS, glyph: '○' },
  { category: CollectionCategory.SMOKE, glyph: '≈' },
  { category: CollectionCategory.SOUNDS, glyph: '∿' },
];

/** The card colour is the item's own palette value, taken straight from content. */
function swatchOf(item: CollectionItem): string {
  return rgbToCss(item.swatch);
}

const shelves = computed(() =>
  SHELF.map((shelf) => ({
    ...shelf,
    items: props.game.items.value.filter((item) => item.category === shelf.category),
  })),
);

/** The cabinet doubles as the picker, so a card knows whether it is the one in the hand. */
const SELECTION_KEY: Partial<Record<CollectionCategoryValue, keyof Selection>> = {
  [CollectionCategory.CIGARETTES]: 'cigarette',
  [CollectionCategory.LIGHTERS]: 'lighter',
  [CollectionCategory.ENVIRONMENTS]: 'environment',
  [CollectionCategory.ASHTRAYS]: 'ashtray',
};

const selection = computed(() => props.game.settings.value.selection);

function isSelected(item: CollectionItem): boolean {
  const key = SELECTION_KEY[item.category];
  return key !== undefined && selection.value?.[key] === item.id;
}
const fresh = computed(() => new Set(props.game.summary.value.fresh));

function isUnlocked(item: CollectionItem): boolean {
  return (props.game.unlocked.value[item.category] ?? []).includes(item.id);
}

function use(item: CollectionItem): void {
  if (!isUnlocked(item)) return;
  if (item.category === CollectionCategory.CIGARETTES) props.game.select({ cigarette: item.id });
  else if (item.category === CollectionCategory.LIGHTERS) props.game.select({ lighter: item.id });
  else if (item.category === CollectionCategory.ENVIRONMENTS)
    props.game.select({ environment: item.id });
  else if (item.category === CollectionCategory.ASHTRAYS) props.game.select({ ashtray: item.id });
  else if (item.category === CollectionCategory.SMOKE) {
    // Smoke style travels with the cigarette, so choosing a style means choosing a rod that
    // uses it — one tap, no second control to discover (§0).
    const match = DEFAULT_CONTENT.cigarettes.find((rod) => rod.smokeStyleId === item.id);
    if (match) props.game.select({ cigarette: match.id });
  }
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
  <section
    ref="root"
    class="sheet"
    data-sheet="shelf"
    :data-open="open"
    :aria-label="copy.say('a11y.sheetShelf')"
  >
    <header class="head">
      <span class="mark">✦</span>
      <button class="icon-button close" :aria-label="copy.say('a11y.close')" @click="emit('close')">
        ×
      </button>
    </header>

    <div v-for="shelf in shelves" :key="shelf.category" class="group">
      <div class="shelf-mark" aria-hidden="true">{{ shelf.glyph }}</div>
      <div class="swatches">
        <button
          v-for="item in shelf.items"
          :key="`${item.category}:${item.id}`"
          class="swatch"
          :class="{ fresh: fresh.has(`${item.category}:${item.id}`) }"
          :data-locked="!isUnlocked(item)"
          :data-selected="isSelected(item)"
          :aria-label="item.name"
          :aria-pressed="isSelected(item)"
          @click="use(item)"
        >
          <span class="chip" :style="{ background: swatchOf(item) }" aria-hidden="true" />
          <span v-if="!isUnlocked(item)" class="lock" aria-hidden="true">·</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.mark {
  color: var(--ember-core);
  font-size: 1.1rem;
}

.close {
  margin-inline-start: auto;
}

.shelf-mark {
  opacity: 0.4;
  font-size: 0.85rem;
  margin-bottom: -2px;
}

.swatch {
  overflow: hidden;
}

.chip {
  position: absolute;
  inset: 6px;
  border-radius: calc(var(--radius) - 6px);
}

.lock {
  position: absolute;
  color: var(--soft-white);
  opacity: 0.7;
}
</style>
