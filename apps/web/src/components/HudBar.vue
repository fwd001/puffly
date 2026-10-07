<script setup lang="ts">
/**
 * The head-up row from S1–S5: one ring, and the two numbers that belong to whatever the rod is
 * doing right now.
 *
 * Icons and Arabic digits only (§9.2): the numbers are the same in every language, and the nouns
 * they need live in `aria-label`, because a screen reader is allowed a sentence and an eye on a
 * phone at 2am is not. Every figure here is a measurement the simulation already makes — nothing
 * is rounded up into a claim.
 */
import { computed } from 'vue';
import type { CopyKey } from '../i18n';
import type { Puffly } from '../composables/usePuffly';
import { useLongPress } from '../composables/useLongPress';

const props = defineProps<{ game: Puffly }>();
const emit = defineEmits<{ shelf: []; break: []; archive: []; archiveClose: [] }>();

/** The stick mark is a tap and a hold at once: the shelf, or S17's card about this rod. */
const mark = useLongPress(
  () => emit('archive'),
  () => emit('shelf'),
  () => emit('archiveClose'),
);

const copy = computed(() => props.game.copy.value);
const summary = computed(() => props.game.summary.value);
const fresh = computed(() => summary.value.fresh.length);

/** The ring's arc: a circle of radius 15 is 94.25 units around. */
const CIRCUMFERENCE = 94.25;

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/** The marks the cabinet already uses for these objects, so one shape means one thing. */
const MARKS = { rod: '—', lighter: '△', tray: '○', out: '◌' } as const;

/**
 * The row reads the break in three places — the ring's shape, the number you can press, and the
 * smaller number beside it — and each one has to say what it is on its own, because a bare
 * "80%" in a screen reader is not a reading of anything.
 */
const reading = computed(() => {
  const state = summary.value.state;
  const clock = summary.value.clock;
  if (!state) {
    return {
      mark: MARKS.rod,
      value: '',
      fraction: 0,
      primary: clock,
      secondary: '',
      label: copy.value.say('a11y.hud.rail'),
      numLabel: 'a11y.hud.clock' as CopyKey,
      altLabel: null,
    };
  }
  const rod = state.cigarette;
  const left = `${Math.round(rod.rodRemaining * 100)}%`;
  switch (summary.value.phase) {
    case 'light': {
      if (rod.state === 'LIGHTING') {
        return {
          mark: MARKS.lighter,
          value: '',
          fraction: state.lighter.flame,
          primary: seconds(state.lighter.heldMs),
          secondary: left,
          label: copy.value.say('a11y.hud.hold'),
          numLabel: 'a11y.hud.hold' as CopyKey,
          altLabel: 'a11y.hud.remaining' as CopyKey,
        };
      }
      // Which stick of the day this is — 1 before the first one has been saved, not 0.
      const sticks = (props.game.today.value?.sessionCount ?? 0) + 1;
      return {
        mark: '',
        value: String(sticks),
        fraction: rod.rodRemaining,
        // 已燃 next to 剩余: the two numbers have to be about the same object, which is the
        // consistency the deck's own audit page checked when it caught 「剩余 52% 与 03:12 不匹配」.
        // The session countdown is a different clock and belongs to the idle row, not this pair.
        primary: summary.value.burned,
        secondary: left,
        label: copy.value.say('a11y.hud.sticks'),
        numLabel: 'a11y.hud.burned' as CopyKey,
        altLabel: 'a11y.hud.remaining' as CopyKey,
      };
    }
    case 'puff':
      return {
        mark: '≡',
        value: '',
        fraction: rod.puff.active ? rod.puff.progress : rod.lengthRemaining,
        primary: `${rod.puff.count} / ${rod.readouts.puffsTarget}`,
        secondary: rod.puff.active ? seconds(rod.puff.heldMs) : left,
        label: copy.value.say('a11y.hud.puffs'),
        numLabel: 'a11y.hud.puffs' as CopyKey,
        altLabel: (rod.puff.active ? 'a11y.hud.hold' : 'a11y.hud.remaining') as CopyKey,
      };
    case 'tray':
      return {
        mark: MARKS.tray,
        value: '',
        fraction: rod.ash.ratio,
        primary: `${rod.readouts.ashMm}mm`,
        secondary: `${rod.readouts.ashGrams}g`,
        label: copy.value.say('a11y.hud.ash'),
        numLabel: 'a11y.hud.ash' as CopyKey,
        altLabel: 'a11y.hud.ashMass' as CopyKey,
      };
    default:
      return {
        mark: MARKS.out,
        value: '',
        fraction: 0,
        primary: clock,
        secondary: '',
        label: copy.value.say('a11y.hud.clock'),
        numLabel: 'a11y.hud.clock' as CopyKey,
        altLabel: null,
      };
  }
});
</script>

<template>
  <header class="hud" :data-phase="summary.phase" :data-over="summary.overLimit">
    <button
      class="cat"
      data-hook="category"
      :aria-label="copy.say('a11y.hud.category')"
      @pointerdown="mark.onPointerDown"
      @pointerup="mark.onPointerUp"
      @pointerleave="mark.onPointerLeave"
      @pointercancel="mark.onPointerCancel"
      @pointerenter="mark.onPointerEnter"
      @click="mark.onClick"
    >
      <span aria-hidden="true">{{ MARKS.rod }}</span>
      <!-- Unread unlocks: the only reason this row ever asks for attention. -->
      <span v-if="fresh > 0" class="badge" aria-hidden="true" />
    </button>

    <span class="ring" role="img" :aria-label="reading.label">
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle class="track" cx="18" cy="18" r="15" />
        <circle
          class="arc"
          cx="18"
          cy="18"
          r="15"
          :stroke-dasharray="`${(reading.fraction * CIRCUMFERENCE).toFixed(2)} ${String(CIRCUMFERENCE)}`"
        />
      </svg>
      <b v-if="reading.value !== '' && !summary.overLimit" class="digits">{{ reading.value }}</b>
      <span v-else class="mark" aria-hidden="true">{{
        summary.overLimit ? '◇' : reading.mark
      }}</span>
    </span>

    <!-- The numbers are the way into the break's own sheet: the count you can see is the
         button, so there is no fourth tab that only duplicates it. -->
    <button
      class="num"
      data-hook="break"
      :aria-label="copy.say(reading.numLabel)"
      @click="emit('break')"
    >
      {{ reading.primary }}
    </button>
    <span
      v-if="reading.secondary !== '' && reading.altLabel !== null"
      class="num alt"
      role="img"
      :aria-label="copy.say(reading.altLabel)"
      >{{ reading.secondary }}</span
    >
  </header>
</template>

<style scoped>
.hud {
  position: absolute;
  top: max(10px, env(safe-area-inset-top));
  display: flex;
  align-items: center;
  gap: 10px;
  /* Logical edges: the row mirrors with the document, the scene under it does not (§9.3). */
  inset-inline: 14px;
  justify-content: flex-start;
  z-index: 2;
  pointer-events: none;
}

.hud > * {
  pointer-events: auto;
}

.cat {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--chrome-line);
  border-radius: 50%;
  background: color-mix(in oklab, var(--deep-charcoal) 55%, transparent);
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
}

.cat {
  position: relative;
}

.badge {
  position: absolute;
  top: 3px;
  inset-inline-end: 3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ember-orange);
}

.ring {
  position: relative;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  flex: none;
}

.ring svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* The arc starts at the top and runs the way the rod burns. */
  transform: rotate(-90deg);
}

.track {
  fill: none;
  stroke: color-mix(in oklab, var(--soft-white) 16%, transparent);
  stroke-width: 2.4;
}

.arc {
  fill: none;
  stroke: var(--ember-orange);
  stroke-width: 2.4;
  stroke-linecap: round;
  transition: stroke-dasharray 120ms linear;
}

.ring .mark,
.ring .digits {
  position: relative;
  color: var(--soft-white);
  font-size: calc(15px * var(--text-scale));
  font-weight: 500;
  line-height: 1;
}

.num {
  color: var(--soft-white);
  font-size: calc(15px * var(--text-scale));
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  /* The cell is a button as often as it is a label, so it must look like neither. */
  padding: 0 2px;
  border: 0;
  background: transparent;
  font-family: inherit;
}

/* The amber figure is the one that changes fastest, so it is the one allowed to shout. */
.alt {
  color: var(--ember-core);
}

[data-phase='out'] .arc,
[data-over='true'] .arc {
  stroke: var(--smoke-gray);
}

/* S20's `onReach`: the ring goes quiet and the number becomes a mark. Nothing is blocked. */
[data-over='true'] .num,
[data-over='true'] .ring .mark {
  color: var(--smoke-gray);
}
</style>
