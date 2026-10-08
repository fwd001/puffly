<script setup lang="ts">
/**
 * The big pill from S1–S5, and the little graphic under it that says what the hand should do.
 *
 * It is a handle on the real gesture, not a picture of one: pressing it sends exactly what the
 * space bar sends (§65), aimed at exactly the anchor the engine is nudging, so the scene never
 * has two sources of truth about what "held" means. The label stays in every tier but `icons`
 * because §9.2 keeps a button's short label as the anchor a translation hangs on.
 */
import { computed, ref } from 'vue';
import type { Puffly } from '../composables/usePuffly';
import { ctaKeyFor } from '../i18n';
import { isSustained } from '../phase';

const props = defineProps<{ game: Puffly }>();

const copy = computed(() => props.game.copy.value);
const summary = computed(() => props.game.summary.value);
const affordance = computed(() => summary.value.affordance);
const sustained = computed(() => isSustained(affordance.value));
const held = ref(false);

/**
 * Which verb the handle shows is the rod's own measurement, not a category the interface keeps a
 * list of: `ctaKeyFor` is the one place that knows a mouthed draw is not an inhalation.
 */
const savourMs = computed(() => summary.value.state?.cigarette.readouts.savourMs ?? 0);

const label = computed(() => {
  const key = ctaKeyFor(affordance.value, savourMs.value);
  return key === undefined ? null : copy.value.t(key);
});

/** The arc around the glyph is the hold itself: how far this draw has come, or the flame coming up. */
const arc = computed(() => {
  const state = summary.value.state;
  if (!state) return 0;
  if (state.cigarette.puff.active) return state.cigarette.puff.progress;
  if (state.cigarette.state === 'LIGHTING') return state.lighter.flame;
  if (state.cigarette.state === 'EXTINGUISHING') return state.cigarette.extinguishProgress;
  return 0;
});

function down(): void {
  if (!sustained.value) return;
  held.value = true;
  props.game.gesture('hold');
}

function up(): void {
  if (!sustained.value || !held.value) return;
  held.value = false;
  props.game.gesture('release');
}

function tap(): void {
  if (sustained.value) return;
  props.game.gesture('tap');
}

/** The graphic the brief names per phase (§9.2), drawn from the same numbers the HUD reads. */
const wave = computed(() => {
  const state = summary.value.state;
  if (!state) return '';
  const puff = state.cigarette.puff;
  const strength = puff.active ? puff.intensity : 0.18;
  const points: string[] = [];
  for (let step = 0; step <= 24; step += 1) {
    const x = step * 5;
    const wobble = Math.sin(step * 1.7 + state.nowMs / 90) * strength * 9;
    points.push(`${String(x)},${(12 - wobble).toFixed(1)}`);
  }
  return points.join(' ');
});
</script>

<template>
  <div class="cta" :data-affordance="affordance" :data-held="held">
    <button
      class="pill"
      data-hook="pill"
      :aria-label="
        label === null
          ? copy.say('a11y.pill', { word: affordance })
          : copy.say('a11y.pill', { word: label })
      "
      :aria-pressed="sustained ? held : undefined"
      @pointerdown.prevent="down"
      @pointerup="up"
      @pointercancel="up"
      @pointerleave="up"
      @click="tap"
    >
      <svg class="arc" viewBox="0 0 44 44" aria-hidden="true">
        <circle class="track" cx="22" cy="22" r="19" />
        <circle
          class="run"
          cx="22"
          cy="22"
          r="19"
          :stroke-dasharray="`${(arc * 119.4).toFixed(2)} 119.4`"
        />
      </svg>
      <span class="glyph" aria-hidden="true">
        <template v-if="affordance === 'puff'">—·</template>
        <template v-else-if="affordance === 'lighter'">△</template>
        <template v-else-if="affordance === 'flick'">⌁</template>
        <template v-else-if="affordance === 'extinguish'">◌</template>
        <template v-else-if="affordance === 'discard'">○</template>
        <!-- 取烟 is the box: the gesture wears the shape of the thing it now acts on, which is the
             pack on the table rather than the rod it hands over. `—` stays the rod's own. -->
        <template v-else-if="affordance === 'pick'">▭</template>
        <template v-else>—</template>
      </span>
      <span v-if="label !== null" class="word">{{ label }}</span>
    </button>

    <!-- 阻力波形条: the lungs' resistance, drawn while the draw is happening (§9.2).
         The 品鉴型 have no lungs in this design's vocabulary — 「雪茄、斗烟、水烟都不是往肺里吸的」 —
         and the deck rules their feedback must not show a resistance readout. `loadPerPuff` is 0 for
         them in content, so a bar here would be reporting a quantity the simulation holds at zero. -->
    <svg
      v-if="
        summary.phase === 'puff' &&
        (game.archive.value?.subject === 'rod' ? game.archive.value.kind : 'inhale') !== 'savor'
      "
      class="art wave"
      viewBox="0 0 120 24"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <polyline :points="wave" />
      <line class="floor" x1="0" y1="12" x2="120" y2="12" />
    </svg>

    <!-- 磕灰演示条: a short tap sends the column off the rod. -->
    <svg
      v-else-if="summary.phase === 'tray'"
      class="art flick"
      viewBox="0 0 120 24"
      aria-hidden="true"
    >
      <line class="floor" x1="6" y1="12" x2="96" y2="12" />
      <line class="dash" x1="98" y1="12" x2="118" y2="12" />
      <circle class="dot" cx="14" cy="12" r="3.4" />
    </svg>

    <!-- 薄雾丝线 / 浓团云朵: what this rod's smoke is made of, on the way out. -->
    <svg
      v-else-if="affordance === 'discard'"
      class="art cloud"
      viewBox="0 0 120 24"
      aria-hidden="true"
    >
      <path class="wisp" d="M8 16c8-9 14 3 22-5" />
      <path class="blob" d="M74 16c-9 0-9-11 1-11 2-7 13-6 14 1 8 0 8 10-1 10z" />
    </svg>
  </div>
</template>

<style scoped>
.cta {
  position: absolute;
  bottom: calc(74px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  z-index: 2;
}

.pill {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 58px;
  /* Generous on purpose: this is the one control meant to be hit with a thumb in the dark. */
  padding: 0 30px;
  border: 1px solid transparent;
  border-radius: 30px;
  background: linear-gradient(
    100deg,
    color-mix(in oklab, var(--ember-orange) 88%, var(--deep-charcoal)) 0%,
    var(--ember-orange) 55%,
    color-mix(in oklab, var(--ember-core) 70%, var(--ember-orange)) 100%
  );
  color: #1a1109;
  font: inherit;
  font-size: calc(15px * var(--text-scale));
  letter-spacing: 0.04em;
  box-shadow: 0 10px 30px -12px color-mix(in oklab, var(--ember-orange) 70%, transparent);
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  transition:
    transform 240ms cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 200ms var(--ease-out);
}

.pill:active,
.cta[data-held='true'] .pill {
  /* 0.96, not 0.97: the deck's own number for how far a press goes, and the curve above is what
     makes it come back past itself rather than settling flat (S7, 「缩放回弹」). */
  transform: scale(0.96);
  box-shadow: 0 4px 16px -8px color-mix(in oklab, var(--ember-orange) 70%, transparent);
}

/* The non-sustained states are a handle, not a target: keep them quiet until they are the news. */
.cta:not([data-affordance='puff']) .pill {
  background: color-mix(in oklab, var(--deep-charcoal) 72%, var(--soft-white) 4%);
  border-color: color-mix(in oklab, var(--ember-orange) 45%, transparent);
  color: var(--soft-white);
}

.arc {
  position: absolute;
  inset: 8px auto 8px 12px;
  width: 42px;
  height: 42px;
  transform: rotate(-90deg);
}

.track {
  fill: none;
  stroke: color-mix(in oklab, currentColor 22%, transparent);
  stroke-width: 2;
}

.run {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

.glyph {
  min-width: 30px;
  margin-left: 34px;
  font-size: calc(15px * var(--text-scale));
  line-height: 1;
}

.word {
  font-variant-numeric: tabular-nums;
}

.art {
  width: min(64vw, 240px);
  height: 24px;
  opacity: 0.8;
}

.wave polyline {
  fill: none;
  stroke: var(--ember-orange);
  stroke-width: 1.6;
  stroke-linejoin: round;
}

.flick .floor,
.wave .floor {
  stroke: color-mix(in oklab, var(--soft-white) 22%, transparent);
  stroke-width: 1;
}

.flick .dash {
  stroke: color-mix(in oklab, var(--soft-white) 40%, transparent);
  stroke-width: 1;
  stroke-dasharray: 3 4;
}

.flick .dot {
  fill: var(--ember-core);
  animation: tap-here 1.5s var(--ease-out) infinite;
}

.cloud .wisp {
  fill: none;
  stroke: color-mix(in oklab, var(--soft-white) 45%, transparent);
  stroke-width: 1.2;
}

.cloud .blob {
  fill: color-mix(in oklab, var(--soft-white) 22%, transparent);
}

@keyframes tap-here {
  0%,
  55% {
    transform: translateX(0);
  }
  70% {
    transform: translateX(10px);
  }
  85%,
  100% {
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .flick .dot {
    animation: none;
  }
}
</style>
