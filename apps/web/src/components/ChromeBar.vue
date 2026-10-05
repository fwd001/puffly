<script setup lang="ts">
/**
 * The whole chrome: one mark, hidden until the player is awake, that opens the menu (§10, §44).
 *
 * It used to be three icons always on screen — break, shelf, settings — which made the scene a
 * page with a toolbar. Now the stage is the only thing at rest, and the way out of it appears in
 * the seconds after you touch something and then goes away.
 */
import type { I18n } from '../i18n';

const props = defineProps<{
  visible: boolean;
  /** Unread unlocks: the only reason the mark ever asks for attention. */
  fresh: number;
  open: boolean;
  copy: I18n;
}>();

const emit = defineEmits<{ open: [] }>();
</script>

<template>
  <nav class="chrome" :data-visible="visible" :aria-label="props.copy.say('app.name')">
    <button
      class="icon-button menu"
      :aria-pressed="open"
      :aria-label="props.copy.say('a11y.menu')"
      :disabled="!visible"
      @click="emit('open')"
    >
      <span class="mark" aria-hidden="true">···</span>
      <span v-if="fresh > 0" class="badge" aria-hidden="true" />
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
  z-index: 2;
}

.mark {
  line-height: 1;
  letter-spacing: 0.12em;
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

/* The mark is not tappable while the chrome is faded, and it never looks like it is. */
.menu:disabled {
  opacity: 0;
  pointer-events: none;
}
</style>
