<script setup lang="ts">
/**
 * The cabinet — S8 and S8b over the top of §38 and §39.
 *
 * The ladder comes first: eleven categories, grouped by what the hand does with them, with the
 * count of how many have been met. Then the two ways to change what the scene looks like — the four
 * palette layers and the seven rooms, each room showing the rung that opens it. Lighters, trays,
 * plumes and voices sit below those as the rest of the table, because those are props.
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
import { nextRodGate, shelfCount, shelvesOf } from '../shelf';
import { byRung, cardLabel, rungCount, rungShown, rungShownFor } from '../scenes';

const props = defineProps<{
  open: boolean;
  game: Puffly;
  /** Which group the player asked for — S10's sidebar lands on a section, not just on a sheet. */
  section?: string | null;
}>();

/** The groups the sheet owns, and the only values `section` is allowed to name. */
const SECTIONS = ['rods', 'packs', 'skins', 'kit'] as const;
const emit = defineEmits<{ close: []; archive: [id: string] }>();

const copy = computed(() => props.game.copy.value);
const rods = DEFAULT_CONTENT.cigarettes;
const shelves = computed(() => shelvesOf(rods));
const met = computed(() => new Set(props.game.unlocked.value.cigarettes ?? []));
const count = computed(() => shelfCount(rods, [...met.value]));
/** Sticks kept is the unit the rod ladder counts in, so the ladder line and the tiles agree. */
const sticks = computed(() => props.game.summary.value.state?.progress.sessionCount ?? 0);
const ladder = computed(() => nextRodGate(rods, sticks.value));
const chosen = computed(() => props.game.settings.value.selection?.cigarette);

/**
 * The other four categories, drawn from each item's own palette as before. The rooms are not here:
 * they are the scene the table sits in, not a prop on it, and they got their own row above (S10's
 * 皮肤 entry is where a player goes to change what the background looks like — palette is half of
 * that, the room is the other half).
 */
const KIT: readonly { category: CollectionCategoryValue; glyph: string }[] = [
  { category: CollectionCategory.LIGHTERS, glyph: '△' },
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

/**
 * The rooms as a set with a ladder: every one the content defines, in the order a player meets
 * them, each carrying the number of its own rung. They left the props row because a room is where a
 * break happens, not a thing on the table — and because "set the background" has two halves, the
 * palette and the place.
 */
const scenes = computed(() =>
  byRung(
    props.game.items.value.filter((item) => item.category === CollectionCategory.ENVIRONMENTS),
  ),
);
const metScenes = computed(
  () => new Set(props.game.unlocked.value[CollectionCategory.ENVIRONMENTS] ?? []),
);
const sceneCount = computed(() => rungCount(scenes.value, [...metScenes.value]));

/**
 * A card shows digits, which is what the wordless tier can carry. What it *counts* — days, breaks,
 * boxes — is only ever spoken, because "3" without an axis is a number with no door on it. The
 * sentence itself lives in `cardLabel`, one order for every grid on this sheet.
 */
function sceneLabel(item: CollectionItem): string {
  return cardLabel(
    copy.value,
    copy.value.say('a11y.scene', { name: item.name }),
    item.unlock,
    !metScenes.value.has(item.id),
  );
}

function isUnlocked(item: CollectionItem): boolean {
  return (props.game.unlocked.value[item.category] ?? []).includes(item.id);
}

/**
 * Everything dimmed on this sheet is dimmed for the same reason, and the reason has to be said:
 * a card that is only greyer reads as a design choice rather than as something not yet met.
 */
function nameFor(item: CollectionItem, locked: boolean): string {
  return cardLabel(copy.value, item.name, item.unlock, locked);
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
// One writer for the sheet's own scroll. There used to be two watchers — one to land on the
// requested section, one to reset to the top — and the reset ran second and undid the jump, so the
// section entry never actually landed. `scrollIntoView` is gone too: it walks every scrollable
// ancestor, and the stage is one (the closed sheets hang below its edge), so asking to reveal a
// group pushed the whole scene 620 px up on the desk and nothing ever brought it back.
watch(
  () => [props.open, props.section] as const,
  ([open, section]) => {
    if (!open) return;
    void nextTick(() => {
      const sheet = root.value;
      if (!sheet) return;
      const wanted =
        section !== null && SECTIONS.includes(section as (typeof SECTIONS)[number])
          ? sheet.querySelector<HTMLElement>(`[data-group="${section}"]`)
          : null;
      if (!wanted) {
        sheet.scrollTo({ top: 0 });
        return;
      }
      // Rects, not `offsetTop`: the group may sit inside a positioned row, and both rects carry
      // the sheet's own slide-in transform, so the difference is right mid-animation.
      const top = wanted.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
      sheet.scrollTo({ top: Math.max(0, sheet.scrollTop + top), behavior: 'smooth' });
    });
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
      <!-- 累计 42 支 · 下一档解锁 75 支, said in digits and an arrow so it survives the icons tier;
           the sentence lives in the label, which is the only place a screen reader is reading. -->
      <span
        v-if="ladder !== null"
        class="ladder digits"
        :aria-label="
          copy.say('shelf.rods.ladder', { total: String(sticks), next: String(ladder.at) })
        "
      >
        {{ String(sticks) }} → {{ String(ladder.at) }}
      </span>
      <button class="icon-button close" :aria-label="copy.say('a11y.close')" @click="emit('close')">
        ×
      </button>
    </header>

    <div v-for="shelf in shelves" :key="shelf.kind" class="group" data-group="rods">
      <p v-if="copy.t('shelf.rods') !== null" class="kind">
        {{ copy.t(`shelf.kind.${shelf.kind}` as 'shelf.kind.inhale') }}
        <!-- 吸入型 7 / 品鉴型 3 / 过滤型 1: the deck prints the size of each family next to its
             name, because the count is what says the split is a real partition and not three labels. -->
        <span class="digits">{{ String(shelf.rods.length) }}</span>
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
          :rung="rungShownFor(rod.unlock)"
          :unlock="rod.unlock"
          :copy="copy"
          @use="game.select({ cigarette: $event })"
          @archive="emit('archive', $event)"
        />
      </div>
    </div>

    <p v-if="copy.t('shelf.hint') !== null" class="browse-hint">
      {{ copy.t('shelf.hint', { total: String(rods.length) }) }}
    </p>

    <div class="group" data-group="packs">
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
              ? copy.say('a11y.boxFound', { brand: box.brand })
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
        </button>
      </div>
    </div>

    <div class="group" data-group="skins">
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
            cardLabel(
              copy,
              copy.say('a11y.skin', { name: skin.name }),
              skin.unlock,
              !unlockedSkins.has(skin.id),
            )
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

      <p v-if="copy.t('shelf.scenes') !== null" class="kind rooms-kind">
        {{ copy.t('shelf.scenes') }}
        <span class="digits">{{ sceneCount }}</span>
      </p>
      <div class="rooms">
        <button
          v-for="scene in scenes"
          :key="scene.id"
          class="room"
          :class="{ fresh: fresh.has(`${scene.category}:${scene.id}`) }"
          :data-scene="scene.id"
          :data-locked="!metScenes.has(scene.id)"
          :data-selected="isChosen(scene)"
          :aria-pressed="isChosen(scene)"
          :aria-label="sceneLabel(scene)"
          @click="use(scene)"
        >
          <span class="chip" :style="{ background: rgbToCss(scene.swatch) }" aria-hidden="true" />
          <span v-if="!metScenes.has(scene.id)" class="rung digits" aria-hidden="true">{{
            rungShown(scene)
          }}</span>
          <span v-if="copy.t('shelf.scenes') !== null" class="room-name">{{ scene.name }}</span>
        </button>
      </div>
    </div>

    <div
      v-for="shelf in kit"
      :key="shelf.category"
      class="group"
      data-group="kit"
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
          :aria-label="nameFor(item, !isUnlocked(item))"
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

/* 累计 → 下一档: pushed to the right of the count, and at the deck's own 15px floor for digits. */
.ladder {
  margin-left: auto;
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
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

.browse-hint {
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

/* The rooms are a card with a caption, so they are their own size: wide enough for a name to stay
   on one line (the lesson of 烟灰缸 on a phone), tall enough for a finger. */
.rooms-kind {
  margin-top: 14px;
}

.rooms {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: calc(10px * var(--text-scale));
}

.room {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-height: 64px;
  padding: 7px;
  border: 1px solid var(--chrome-line);
  border-radius: var(--radius);
  background: var(--deep-charcoal);
  color: var(--soft-white);
  text-align: start;
  cursor: pointer;
}

.room .chip {
  position: relative;
  inset: auto;
  height: 30px;
}

.room[data-locked='true'] {
  opacity: 0.45;
  cursor: default;
}

.room[data-selected='true'] {
  border-color: var(--ember-orange);
}

.rung {
  position: absolute;
  top: 11px;
  inset-inline-end: 11px;
  color: var(--soft-white);
  font-size: calc(15px * var(--text-scale));
  font-weight: 500;
  text-shadow: 0 1px 3px rgb(0 0 0 / 0.7);
}

.room-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: calc(15px * var(--text-scale));
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
