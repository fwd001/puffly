<script setup lang="ts">
/**
 * S17: the archive card, at the density the hand asked for.
 *
 * Three tiers, none of which interrupts the burn — the rod keeps going behind this because the
 * burn timer is not a child of the interface (§ coreLoop.criticalRule). A short hold opens tier
 * two, the three numbers that describe the stick; pinning it opens tier three, the softer facts
 * that need sentences and therefore need the ≈ mark (§ dataHonesty).
 */
import { computed } from 'vue';
import type { ArchiveFacts, Puffly } from '../composables/usePuffly';

const props = defineProps<{
  game: Puffly;
  /** Whichever rod the hand asked about: the one burning, or one in the cabinet. */
  facts: ArchiveFacts | null;
  pinned: boolean;
}>();
const emit = defineEmits<{ close: []; pin: [pinned: boolean] }>();

const copy = computed(() => props.game.copy.value);
const facts = computed(() => props.facts);

/** Tier two: the three measurements, in the order the brief lists them. */
const cells = computed(() => {
  const rod = facts.value;
  if (!rod) return [];
  return [
    {
      key: 'archive.duration' as const,
      value: `${rod.minutes}${copy.value.t('archive.unitMin') ?? ''}`,
    },
    { key: 'archive.puffs' as const, value: `${rod.puffs}` },
    {
      key: 'archive.temp' as const,
      value: `${String(rod.tempLow)}–${String(rod.tempHigh)}${copy.value.t('archive.unitTemp') ?? ''}`,
    },
  ];
});
</script>

<template>
  <aside
    v-if="facts !== null"
    class="archive"
    data-hook="archive"
    :data-pinned="pinned"
    :aria-label="copy.say('a11y.archive')"
  >
    <header class="head">
      <span class="name">{{ facts.name }}</span>
      <span v-if="copy.t('archive.duration') !== null" class="zh">{{ facts.zhName }}</span>
      <button class="icon-button close" :aria-label="copy.say('a11y.close')" @click="emit('close')">
        ×
      </button>
    </header>

    <dl class="cells">
      <template v-for="cell in cells" :key="cell.key">
        <dt v-if="copy.t(cell.key) !== null">{{ copy.t(cell.key) }}</dt>
        <dd class="digits">{{ cell.value }}</dd>
      </template>
    </dl>

    <!-- Tier three: the parts that can only be said, and the one figure that must be marked as
         an estimate. It is a range with a source, never a percentage nobody published. -->
    <template v-if="pinned">
      <p v-if="facts.scenes.length > 0" class="scenes">
        <span v-if="copy.t('archive.scenes') !== null" class="label">{{
          copy.t('archive.scenes')
        }}</span>
        <span v-for="scene in facts.scenes" :key="scene" class="chip">{{ scene }}</span>
      </p>
      <p v-if="copy.t('archive.range') !== null" class="range">{{ copy.t('archive.range') }}</p>
    </template>

    <button
      v-if="copy.t('archive.pin') !== null || !pinned"
      class="pin"
      data-hook="pin"
      :aria-pressed="pinned"
      :aria-label="copy.say('archive.pin')"
      @click="emit('pin', !pinned)"
    >
      <span aria-hidden="true">{{ pinned ? '◆' : '◇' }}</span>
      <span v-if="copy.t('archive.pin') !== null" class="word">{{ copy.t('archive.pin') }}</span>
    </button>
  </aside>
</template>

<style scoped>
.archive {
  position: absolute;
  top: calc(58px + env(safe-area-inset-top));
  inset-inline-end: 14px;
  width: min(58vw, 240px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--chrome-line);
  border-radius: var(--radius);
  background: var(--chrome-bg);
  color: var(--soft-white);
  z-index: 3;
}

.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.name {
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.04em;
}

.zh {
  color: var(--smoke-gray);
  font-size: calc(12px * var(--text-scale));
}

.close {
  margin-inline-start: auto;
  width: 28px;
  min-width: 28px;
  min-height: 28px;
  font-size: calc(16px * var(--text-scale));
}

.cells {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 0;
}

.cells dt {
  color: var(--smoke-gray);
  font-size: calc(10px * var(--text-scale));
  letter-spacing: 0.08em;
}

.cells dd {
  margin: 2px 0 0;
  font-size: calc(15px * var(--text-scale));
  color: var(--ember-core);
}

.digits {
  font-variant-numeric: tabular-nums;
}

.scenes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin: 0;
}

.scenes .label {
  color: var(--smoke-gray);
  font-size: calc(10px * var(--text-scale));
  letter-spacing: 0.08em;
}

.chip {
  padding: 2px 7px;
  border: 1px solid var(--chrome-line);
  border-radius: 999px;
  font-size: calc(11px * var(--text-scale));
}

.range {
  margin: 0;
  color: var(--smoke-gray);
  font-size: calc(11px * var(--text-scale));
  /* The ≈ figure is a quote of a published range, so it is typeset like one. */
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.pin {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--chrome-line);
  border-radius: 999px;
  background: transparent;
  color: var(--smoke-gray);
  font: inherit;
  font-size: calc(11px * var(--text-scale));
}

.pin[aria-pressed='true'] {
  color: var(--ember-core);
  border-color: color-mix(in oklab, var(--ember-orange) 55%, transparent);
}
</style>
