<script setup lang="ts">
/**
 * §31: the only number on the main screen is the break clock — `◷ 03:00` — and it fades
 * away once the player is inside the moment.
 */
import { computed } from 'vue';

const props = defineProps<{
  clock: string;
  active: boolean;
  fading: boolean;
  reached: boolean;
}>();

const shown = computed(() => props.active && !props.fading);
</script>

<template>
  <div class="clock-wrap" :data-visible="shown" aria-hidden="true">
    <span class="glyph" :class="{ reached }">◷</span>
    <span class="digits">{{ clock }}</span>
  </div>
</template>

<style scoped>
.clock-wrap {
  position: absolute;
  top: calc(12px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  color: var(--soft-white);
  background: transparent;
  opacity: 0;
  transition: opacity 800ms var(--ease-out);
  pointer-events: none;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
}

.clock-wrap[data-visible='true'] {
  opacity: 0.62;
}

.glyph {
  font-size: 0.9em;
  opacity: 0.8;
}

.glyph.reached {
  color: var(--ember-core);
  animation: breathe 2600ms var(--ease-out) infinite;
}

.digits {
  font-size: 0.95rem;
}

@keyframes breathe {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .glyph.reached {
    animation: none;
  }
}
</style>
