<script setup lang="ts">
/**
 * S20's numbers, as one block: the day's count against the ceiling the player set, the last seven
 * days as bars, and the difference against the same span a week ago. That is the whole of it — the
 * block is compared to last week and to nothing else, and the three alternatives are marks rather
 * than instructions.
 *
 * It is a component because the phone puts it behind the break and the PC keeps it on screen at all
 * times (S10's 常驻数据栏), and a second copy of the delta line would be two facts to keep true.
 */
import { computed } from 'vue';
import type { Puffly } from '../composables/usePuffly';

const props = defineProps<{ game: Puffly }>();

const copy = computed(() => props.game.copy.value);
const summary = computed(() => props.game.summary.value);

const reduction = computed(() => props.game.reduction.value);
const limit = computed(() => props.game.settings.value.dailyLimitSticks);
const tallest = computed(() => Math.max(1, ...reduction.value.week.map((day) => day.sticks)));
/** With no words the comparison is still a direction and a number — the tier three fallback. */
const deltaLine = computed(() => {
  const delta = reduction.value.deltaSticks;
  if (delta === 0) return copy.value.t('reduction.deltaSame') ?? '—';
  const count = String(Math.abs(delta));
  if (delta > 0) {
    return copy.value.t('reduction.deltaMore', { count }) ?? `▲ ${count}`;
  }
  return copy.value.t('reduction.deltaFewer', { count }) ?? `▼ ${count}`;
});
/** Only ever shown when the ring has no cap to read against. */
const noLimitLine = computed(() =>
  limit.value === undefined ? copy.value.t('reduction.noLimit') : null,
);
/**
 * The bars are one image to a screen reader, so the text alternative has to carry all seven
 * counts rather than only saying that a week exists.
 */
const trendLabel = computed(() =>
  reduction.value.week
    .map((day) =>
      copy.value.say('a11y.reduction.bar', { day: day.dayKey, count: String(day.sticks) }),
    )
    .join(', '),
);
/** The bars' caption: what they are, and the unit they count. Falls away with the words. */
const trendCaption = computed(() => {
  const span = copy.value.t('reduction.week');
  const unit = copy.value.t('reduction.sticks');
  if (span === null && unit === null) return null;
  return [span, unit].filter((part) => part !== null).join(' · ');
});
const ringArc = computed(() => {
  const cap = limit.value ?? Math.max(1, reduction.value.todaySticks);
  return (Math.min(1, reduction.value.todaySticks / cap) * 119.4).toFixed(2);
});
const ALTERNATIVES = [
  { key: 'reduction.alt.breathe', glyph: '〜' },
  { key: 'reduction.alt.water', glyph: '◍' },
  { key: 'reduction.alt.walk', glyph: '⌇' },
] as const;
</script>

<template>
  <div class="reduction group" data-hook="reduction" :data-over="summary.overLimit">
    <span
      class="ring"
      role="img"
      :aria-label="
        limit === undefined
          ? copy.say('a11y.reduction.ringNoLimit', { count: String(reduction.todaySticks) })
          : copy.say('a11y.reduction.ring', {
              count: String(reduction.todaySticks),
              limit: String(limit),
            })
      "
    >
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle class="track" cx="22" cy="22" r="19" />
        <circle class="run" cx="22" cy="22" r="19" :stroke-dasharray="`${ringArc} 119.4`" />
      </svg>
      <b class="digits">
        {{ summary.overLimit ? '◇' : reduction.todaySticks
        }}<template v-if="limit !== undefined && !summary.overLimit"> / {{ limit }}</template>
      </b>
    </span>

    <span class="trend-wrap">
      <svg class="trend" viewBox="0 0 148 44" role="img" :aria-label="trendLabel">
        <rect
          v-for="(day, index) in reduction.week"
          :key="day.dayKey"
          :x="6 + index * 20"
          :y="40 - Math.max(2, (day.sticks / tallest) * 34)"
          width="13"
          :height="Math.max(2, (day.sticks / tallest) * 34)"
          :class="{ today: day.isToday }"
        />
      </svg>
      <span v-if="trendCaption !== null" class="cap digits">{{ trendCaption }}</span>
    </span>

    <p class="delta digits">{{ deltaLine }}</p>
    <p v-if="noLimitLine !== null" class="delta foot">{{ noLimitLine }}</p>

    <div class="alts">
      <span v-for="alt in ALTERNATIVES" :key="alt.key" class="alt">
        <i aria-hidden="true">{{ alt.glyph }}</i>
        <span v-if="copy.t(alt.key) !== null">{{ copy.t(alt.key) }}</span>
      </span>
    </div>
    <p v-if="copy.t('reduction.footer') !== null" class="foot">
      {{ copy.t('reduction.footer') }}
    </p>
  </div>
</template>

<style scoped>
.reduction {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--chrome-line);
}

.ring {
  position: relative;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  flex: none;
}

.ring svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring .track {
  fill: none;
  stroke: color-mix(in oklab, var(--soft-white) 14%, transparent);
  stroke-width: 2.4;
}

.ring .run {
  fill: none;
  stroke: var(--cool-blue, #a8d4e0);
  stroke-width: 2.4;
  stroke-linecap: round;
}

.ring b {
  position: relative;
  font-size: calc(15px * var(--text-scale));
  font-variant-numeric: tabular-nums;
}

.reduction[data-over='true'] .ring b,
.reduction[data-over='true'] .run {
  color: var(--smoke-gray);
  stroke: var(--smoke-gray);
}

.trend-wrap {
  display: flex;
  flex: 1;
  min-width: 120px;
  flex-direction: column;
  gap: 3px;
}

.trend {
  width: 100%;
  height: 44px;
}

.cap {
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
}

.trend rect {
  fill: color-mix(in oklab, var(--soft-white) 22%, transparent);
}

.trend rect.today {
  fill: #a8d4e0;
}

.delta {
  margin: 0;
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
}

.alts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.alt {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border: 1px solid var(--chrome-line);
  border-radius: 999px;
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
}

.foot {
  width: 100%;
  margin: 0;
  color: var(--smoke-gray);
  font-size: calc(15px * var(--text-scale));
  opacity: 0.8;
}
</style>
