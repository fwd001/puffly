<script setup lang="ts">
/**
 * The cabinet — S8 and S8b over the top of §38 and §39.
 *
 * The ladder comes first: eleven categories, grouped by what the hand does with them, with the
 * count of how many have been met. Everything else the player can change — rooms, lighters,
 * trays, plumes, voices — sits below it as the rest of the table, because those are props and
 * this is the subject.
 *
 * A card answers two ways, like the mark in the head-up row: a tap puts the rod in the hand, a
 * hold asks what it is. Choosing a rod is the picker, so there is no second menu to explain (§0).
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
import ArchiveTile from './ArchiveTile.vue';
import { PACKS, SKINS } from '@puffly/game-content';
import { shelfCount, shelvesOf } from '../shelf';

const props = defineProps<{ open: boolean; game: Puffly }>();
const emit = defineEmits<{ close: []; archive: [id: string] }>();

const copy = computed(() => props.game.copy.value);
const rods = DEFAULT_CONTENT.cigarettes;
const shelves = computed(() => shelvesOf(rods));
const met = computed(() => new Set(props.game.unlocked.value.cigarettes ?? []));
const count = computed(() => shelfCount(rods, [...met.value]));
const chosen = computed(() => props.game.settings.value.selection?.cigarette);

/** The other five categories, drawn from each item's own palette as before. */
const KIT: readonly { category: CollectionCategoryValue; glyph: string }[] = [
  { category: CollectionCategory.LIGHTERS, glyph: '△' },
  { category: CollectionCategory.ENVIRONMENTS, glyph: '▢' },
  { category: CollectionCategory.ASHTRAYS, glyph: '○' },
  { category: CollectionCategory.SMOKE, glyph: '≈' },
  { category: CollectionCategory.SOUNDS, glyph: '∿' },
];

const kit = computed(() =>
  KIT.map((shelf) => ({
    ...shelf,
    items: props.game.items.value.filter((item) => item.category === shelf.category),
  })),
);

const SELECTION_KEY: Partial<Record<CollectionCategoryValue, keyof Selection>> = {
  [CollectionCategory.LIGHTERS]: 'lighter',
  [CollectionCategory.ENVIRONMENTS]: 'environment',
  [CollectionCategory.ASHTRAYS]: 'ashtray',
};

const fresh = computed(() => new Set(props.game.summary.value.fresh));

/** S19: the twelve boxes. A collected one is a name in the archive; the rest are gaps. */
const packs = PACKS;
const collected = computed(() => new Set(props.game.progressPacks.value));

/** S18: a skin is four bars, and that is the whole of what a card can show about it. */
const skins = SKINS;
const worn = computed(() => props.game.settings.value.skin ?? 'night');
const unlockedSkins = computed(
  () => new Set(props.game.summary.value.state?.collection.unlockedSkins ?? []),
);

function isUnlocked(item: CollectionItem): boolean {
  return (props.game.unlocked.value[item.category] ?? []).includes(item.id);
}

/**
 * Everything dimmed on this sheet is dimmed for the same reason, and the reason has to be said:
 * a card that is only greyer reads as a design choice rather than as something not yet met.
 */
function nameFor(label: string, locked: boolean): string {
  return locked ? `${label} · ${copy.value.say('a11y.tileLocked')}` : label;
}

function isChosen(item: CollectionItem): boolean {
  const key = SELECTION_KEY[item.category];
  return key !== undefined && props.game.settings.value.selection?.[key] === item.id;
}

function use(item: CollectionItem): void {
  if (!isUnlocked(item)) return;
  if (item.category === CollectionCategory.LIGHTERS) props.game.select({ lighter: item.id });
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
      <span class="count digits">{{ count }}</span>
      <button class="icon-button close" :aria-label="copy.say('a11y.close')" @click="emit('close')">
        ×
      </button>
    </header>

    <div v-for="shelf in shelves" :key="shelf.kind" class="group">
      <p v-if="copy.t('shelf.rods') !== null" class="kind">
        {{ copy.t(`shelf.kind.${shelf.kind}` as 'shelf.kind.inhale') }}
      </p>
      <div class="tiles">
        <ArchiveTile
          v-for="rod in shelf.rods"
          :id="rod.id"
          :key="rod.id"
          :name="rod.name"
          :zh-name="rod.archive.zhName"
          :swatch="rgbToCss(rod.palette.paper)"
          :locked="!met.has(rod.id)"
          :selected="chosen === rod.id"
          :copy="copy"
          @use="game.select({ cigarette: $event })"
          @archive="emit('archive', $event)"
        />
      </div>
    </div>

    <p v-if="copy.t('shelf.hint') !== null" class="hint">
      {{ copy.t('shelf.hint', { total: String(rods.length) }) }}
    </p>

    <div class="group">
      <p v-if="copy.t('shelf.packs') !== null" class="kind">
        {{ copy.t('shelf.packs') }}
        <span class="digits">{{ collected.size }} / {{ String(packs.length) }}</span>
      </p>
      <div class="boxes">
        <button
          v-for="box in packs"
          :key="box.id"
          class="box"
          :data-pack="box.id"
          :data-collected="collected.has(box.id)"
          :aria-label="
            collected.has(box.id)
              ? copy.say('a11y.boxFound', { brand: box.brand, price: box.priceCny })
              : copy.say('a11y.boxEmpty')
          "
          @click="collected.has(box.id) && emit('archive', box.id)"
        >
          <span class="tier" aria-hidden="true">{{
            box.tier === 'low' ? '·' : box.tier === 'mid' ? '••' : '✦'
          }}</span>
          <span v-if="copy.t('shelf.packs') !== null && collected.has(box.id)" class="brand">{{
            box.brand
          }}</span>
          <span v-if="collected.has(box.id)" class="price digits">{{ box.priceCny }}</span>
        </button>
      </div>
    </div>

    <div class="group">
      <p v-if="copy.t('shelf.skins') !== null" class="kind">{{ copy.t('shelf.skins') }}</p>
      <div class="skins">
        <button
          v-for="skin in skins"
          :key="skin.id"
          class="skin"
          :data-skin="skin.id"
          :data-locked="!unlockedSkins.has(skin.id)"
          :data-selected="worn === skin.id"
          :aria-pressed="worn === skin.id"
          :aria-label="
            nameFor(copy.say('a11y.skin', { name: skin.name }), !unlockedSkins.has(skin.id))
          "
          @click="unlockedSkins.has(skin.id) && game.setSettings({ skin: skin.id })"
        >
          <span class="layers" aria-hidden="true">
            <span
              v-for="layer in ['paper', 'ember', 'smoke', 'pool']"
              :key="layer"
              :style="{ background: rgbToCss(skin.palette[layer as 'paper']) }"
            />
          </span>
        </button>
      </div>
    </div>

    <div
      v-for="shelf in kit"
      :key="shelf.category"
      class="group"
      role="group"
      :aria-label="copy.say('shelf.kit')"
    >
      <div class="shelf-mark" aria-hidden="true">{{ shelf.glyph }}</div>
      <div class="swatches">
        <button
          v-for="item in shelf.items"
          :key="`${item.category}:${item.id}`"
          class="swatch"
          :class="{ fresh: fresh.has(`${item.category}:${item.id}`) }"
          :data-locked="!isUnlocked(item)"
          :data-selected="isChosen(item)"
          :aria-label="nameFor(item.name, !isUnlocked(item))"
          :aria-pressed="isChosen(item)"
          @click="use(item)"
        >
          <span class="chip" :style="{ background: rgbToCss(item.swatch) }" aria-hidden="true" />
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
  gap: 10px;
  margin-bottom: 6px;
}

.mark {
  color: var(--ember-core);
  font-size: 1.1rem;
}

.count {
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
}

.digits {
  font-variant-numeric: tabular-nums;
}

.close {
  margin-inline-start: auto;
}

.group {
  margin-top: 12px;
}

.kind {
  margin: 0 0 6px;
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 8px;
}

.hint {
  margin: 14px 0 4px;
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.04em;
}

.shelf-mark {
  opacity: 0.4;
  font-size: calc(15px * var(--text-scale));
  margin-bottom: -2px;
}

.swatch {
  overflow: hidden;
}

.boxes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 6px;
}

.box {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 52px;
  padding: 7px 8px;
  border: 1px solid var(--chrome-line);
  border-radius: 10px;
  background: transparent;
  color: var(--smoke-gray);
  font: inherit;
  text-align: start;
}

.box[data-collected='true'] {
  color: var(--soft-white);
  border-color: color-mix(in oklab, var(--ember-orange) 40%, transparent);
}

.box .brand {
  font-size: calc(15px * var(--text-scale));
}

.box .price {
  color: var(--ember-core);
  font-size: calc(15px * var(--text-scale));
}

.box:not([data-collected='true']) {
  opacity: 0.4;
}

.skins {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px;
}

.skin {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
}

.layers {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.layers span {
  height: 7px;
  border-radius: 3px;
}

.skin[data-locked='true'] {
  opacity: 0.34;
}

.skin[data-selected='true'] {
  border-color: var(--ember-orange);
  background: color-mix(in oklab, var(--ember-orange) 12%, transparent);
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
