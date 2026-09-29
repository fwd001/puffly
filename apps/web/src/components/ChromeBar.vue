<script setup lang="ts">
/**
 * The whole chrome: three icons, hidden until the player is awake, and one of them pulses
 * to match what Game Core thinks the player is about to do (§10, §28, §44). No labels.
 */
defineProps<{
  visible: boolean;
  affordance: string;
  open: 'none' | 'settings' | 'session' | 'collection';
  fresh: number;
}>();

const emit = defineEmits<{ open: ['settings' | 'session' | 'collection'] }>();
</script>

<template>
  <nav class="chrome" :data-visible="visible" aria-label="Puffly">
    <button
      class="icon-button"
      :class="{ dim: !visible }"
      :aria-pressed="open === 'session'"
      aria-label="break"
      @click="emit('open', 'session')"
    >
      <span class="mark">◍</span>
    </button>

    <button
      class="icon-button"
      :class="{ pulse: affordance !== 'none' && visible }"
      :aria-pressed="open === 'collection'"
      aria-label="collection"
      @click="emit('open', 'collection')"
    >
      <span class="mark">✦</span>
      <span v-if="fresh > 0" class="badge" aria-hidden="true" />
    </button>

    <button
      class="icon-button"
      :aria-pressed="open === 'settings'"
      aria-label="settings"
      @click="emit('open', 'settings')"
    >
      <span class="mark">⚙</span>
    </button>
  </nav>
</template>

<style scoped>
.chrome {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  justify-content: center;
}

.mark {
  line-height: 1;
}

.pulse .mark {
  animation: nudge 2400ms var(--ease-out) infinite;
  color: var(--ember-core);
}

.badge {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ember-orange);
}

@keyframes nudge {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.7;
  }
  50% {
    transform: translateY(-2px);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pulse .mark {
    animation: none;
  }
}
</style>
