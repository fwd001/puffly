<script setup lang="ts">
/**
 * The break panel: the §32 craving control, the §36 visual trigger tags, and the §34 journey
 * as a line of stops. Everything is a face, an icon or a dot — there is nothing to read.
 *
 * What the player has already submitted *during this live break* is tracked here, because the
 * statistics layer only sees saved sessions (§70): the current break is still in the engine.
 */
import { computed, nextTick, ref, watch } from 'vue';
import type { Puffly } from '../composables/usePuffly';
import type { CopyKey } from '../i18n';

const props = defineProps<{ open: boolean; game: Puffly }>();
const emit = defineEmits<{ close: [] }>();

const copy = computed(() => props.game.copy.value);

const TRIGGER_GLYPHS: readonly { tag: string; glyph: string; key: CopyKey }[] = [
  { tag: 'coffee', glyph: '☕', key: 'a11y.trigger.coffee' },
  { tag: 'drink', glyph: '🍺', key: 'a11y.trigger.drink' },
  { tag: 'work', glyph: '💼', key: 'a11y.trigger.work' },
  { tag: 'angry', glyph: '😤', key: 'a11y.trigger.angry' },
  { tag: 'night', glyph: '🌙', key: 'a11y.trigger.night' },
  { tag: 'people', glyph: '🧑‍🤝‍🧑', key: 'a11y.trigger.people' },
  { tag: 'drive', glyph: '🚗', key: 'a11y.trigger.drive' },
  { tag: 'meal', glyph: '🍽️', key: 'a11y.trigger.meal' },
];

const summary = computed(() => props.game.summary.value);
const stats = computed(() => props.game.stats.value);
const today = computed(() => props.game.today.value);
const journey = computed(() => props.game.journey.value);

type Submitted = 'none' | 'before' | 'both';
const submitted = ref<Submitted>('none');

/**
 * One slider, three faces (§32). The first drag means "before", the second means "after". The
 * player never picks which one they are recording, so there is no sentence to explain it.
 */
const cravingPhase = computed<'before' | 'after'>(() =>
  submitted.value === 'none' ? 'before' : 'after',
);
const filled = computed(() => submitted.value === 'both');

function setCraving(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  props.game.setCraving(value, cravingPhase.value);
  submitted.value = submitted.value === 'none' ? 'before' : 'both';
}

const savedTags = computed(() => new Set(props.game.triggers.value.map((entry) => entry.tag)));
const tappedTags = ref<Set<string>>(new Set());

function toggleTrigger(tag: string): void {
  props.game.addTrigger(tag);
  tappedTags.value = new Set([...tappedTags.value, tag]);
}

function isTagged(tag: string): boolean {
  return tappedTags.value.has(tag) || savedTags.value.has(tag);
}

/** §34 asks for a trajectory, not a table: the last stretch of stops, newest at the right. */
const stops = computed(() => journey.value.slice(-24));
const lastStop = computed(() => stops.value[stops.value.length - 1]);
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
    data-sheet="break"
    :data-open="open"
    :aria-label="copy.say('a11y.sheetBreak')"
  >
    <header class="row">
      <!-- The break's own clock lives in here now: the stage shows no numbers, and the time a
           player has spent is still worth seeing when they go looking for it (§31). -->
      <span class="count big" :class="{ reached: summary.targetReached }">{{ summary.clock }}</span>
      <span class="count">{{ today?.puffs ?? summary.puffs }}</span>
      <span class="count">☀ {{ today?.daylightHours ?? 0 }}h</span>
      <span class="count">🌙 {{ today?.nightHours ?? 0 }}h</span>
      <span class="count">🔥 {{ summary.puffs }}</span>
      <span class="count">🌫️ {{ today?.smokeEvents ?? 0 }}</span>
      <button class="icon-button close" :aria-label="copy.say('a11y.close')" @click="emit('close')">
        ×
      </button>
    </header>

    <div class="mood group">
      <span class="face" :class="{ lit: cravingPhase === 'before' }" aria-hidden="true">😌</span>
      <input
        class="slider"
        type="range"
        min="0"
        max="10"
        step="1"
        :aria-label="
          copy.say(cravingPhase === 'before' ? 'a11y.cravingBefore' : 'a11y.cravingAfter')
        "
        @change="setCraving"
      />
      <span class="face" :class="{ lit: cravingPhase === 'after' }" aria-hidden="true">😣</span>
      <span v-if="filled" class="dot" aria-hidden="true">✦</span>
    </div>

    <div class="tags group">
      <button
        v-for="item in TRIGGER_GLYPHS"
        :key="item.tag"
        class="icon-button tag"
        :aria-label="copy.say(item.key)"
        :aria-pressed="isTagged(item.tag)"
        @click="toggleTrigger(item.tag)"
      >
        {{ item.glyph }}
      </button>
    </div>

    <svg
      class="journey group"
      viewBox="0 0 320 44"
      :aria-label="copy.say('a11y.journey')"
      role="img"
    >
      <line
        x1="10"
        y1="24"
        x2="310"
        y2="24"
        stroke="currentColor"
        stroke-opacity="0.22"
        stroke-width="1"
      />
      <template v-for="(stop, index) in stops" :key="stop.dayKey">
        <circle
          :cx="stops.length === 1 ? 160 : 10 + (index * 300) / (stops.length - 1)"
          cy="24"
          :r="stop.isMilestone ? 6 : 3.5"
          :fill="stop.isMilestone ? 'var(--ember-orange)' : 'var(--smoke-gray)'"
          :fill-opacity="stop.isMilestone ? 0.95 : 0.66"
        />
        <text
          v-if="stop.isMilestone"
          :x="stops.length === 1 ? 160 : 10 + (index * 300) / (stops.length - 1)"
          y="10"
          text-anchor="middle"
          font-size="9"
          fill="var(--ember-core)"
          aria-hidden="true"
        >
          ✦
        </text>
      </template>
    </svg>

    <div class="row numbers">
      <span class="count">◍ {{ stats.sessionCount }}</span>
      <span class="count">✧ {{ stats.smokeFreeDays }}</span>
      <span class="count">▲ {{ stats.longestStreakDays }}</span>
      <span v-if="lastStop?.isMilestone" class="mark" aria-hidden="true">◆</span>
      <button class="icon-button" :aria-label="copy.say('a11y.endBreak')" @click="game.endBreak()">
        ◌
      </button>
    </div>
  </section>
</template>

<style scoped>
/* The break's own clock, which used to sit on the stage: amber once the target is reached. */
.count.reached {
  color: var(--ember-core);
}

.row {
  display: flex;
  align-items: center;
  gap: calc(12px * var(--text-scale));
  flex-wrap: wrap;
}

.count {
  font-variant-numeric: tabular-nums;
  opacity: 0.78;
  font-size: 0.95rem;
}

.big {
  font-size: 2rem;
  opacity: 0.95;
  margin-right: 6px;
}

.close {
  margin-inline-start: auto;
}

.mood {
  margin-top: 18px;
}

.face {
  opacity: 0.45;
  transition:
    opacity 260ms var(--ease-out),
    transform 260ms var(--ease-out);
}

.face.lit {
  opacity: 1;
  transform: scale(1.12);
}

.slider {
  flex: 1;
}

.dot {
  color: var(--ember-core);
}

.tags {
  justify-content: flex-start;
  display: flex;
  flex-wrap: wrap;
}

.tag {
  font-size: 1.2rem;
  opacity: 0.6;
}

.tag[aria-pressed='true'] {
  opacity: 1;
}

.journey {
  height: 44px;
  color: var(--smoke-gray);
}

.numbers {
  margin-top: 10px;
}

.mark {
  color: var(--ember-orange);
}
</style>
