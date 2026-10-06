<script setup lang="ts">
/**
 * One rod in the 图鉴 (S8). A card is a chip of its own paper colour, its name in the language
 * it was given and the one it is read by, and two gestures: tap to put it in the hand, hold for
 * its archive. A rod that has not been met yet is shown rather than hidden — the ladder is the
 * point of the screen, and an empty grid teaches nothing.
 */
import { computed } from 'vue';
import type { I18n } from '../i18n';
import { useLongPress } from '../composables/useLongPress';

const props = defineProps<{
  id: string;
  name: string;
  zhName: string;
  swatch: string;
  locked: boolean;
  selected: boolean;
  copy: I18n;
}>();

const emit = defineEmits<{ use: [id: string]; archive: [id: string] }>();

const hold = useLongPress(
  () => emit('archive', props.id),
  () => {
    if (!props.locked) emit('use', props.id);
  },
);

/** The dot that marks a card as unreadable is decoration; the name has to carry it instead. */
const label = computed(() => {
  const named = props.copy.say('a11y.tile', { name: props.name, zhName: props.zhName });
  return props.locked ? `${named} · ${props.copy.say('a11y.tileLocked')}` : named;
});
</script>

<template>
  <button
    class="tile"
    :data-rod="id"
    :data-locked="locked"
    :data-selected="selected"
    :aria-pressed="selected"
    :aria-label="label"
    @pointerdown="hold.onPointerDown"
    @pointerup="hold.onPointerUp"
    @pointerleave="hold.onPointerLeave"
    @pointercancel="hold.onPointerCancel"
    @pointerenter="hold.onPointerEnter"
    @click="hold.onClick"
  >
    <span class="chip" :style="{ background: swatch }" aria-hidden="true" />
    <span v-if="locked" class="lock" aria-hidden="true">·</span>
    <span v-if="copy.t('shelf.rods') !== null" class="names">
      <span class="name">{{ name }}</span>
      <span class="zh">{{ zhName }}</span>
    </span>
  </button>
</template>

<style scoped>
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 92px;
  min-height: var(--tap-target, 44px);
  padding: 8px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: color-mix(in oklab, var(--soft-white) 4%, transparent);
  color: var(--soft-white);
  font: inherit;
  text-align: start;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  transition:
    border-color 180ms var(--ease-out),
    background-color 180ms var(--ease-out);
}

.chip {
  width: 100%;
  height: 22px;
  border-radius: 5px;
}

.names {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.name {
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.03em;
}

.zh {
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
}

.lock {
  position: absolute;
  top: 6px;
  inset-inline-end: 10px;
  color: var(--soft-white);
  opacity: 0.7;
}

.tile[data-locked='true'] {
  opacity: 0.42;
}

.tile[data-locked='false']:hover,
.tile[data-locked='false']:active {
  background: color-mix(in oklab, var(--soft-white) 9%, transparent);
}

.tile[data-selected='true'] {
  border-color: var(--ember-orange);
  background: color-mix(in oklab, var(--ember-orange) 14%, transparent);
}
</style>
