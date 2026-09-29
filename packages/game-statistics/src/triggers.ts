/**
 * §36's trigger breakdown — derived, like everything else here (§70).
 *
 * The player taps an icon; the log keeps a tag on the session and a `TRIGGER` event.
 * This module reads both and simply counts, so a tag never needs a counter of its own.
 */

import type { Session } from '@puffly/game-core';
import { tagsOf } from './log';
import type { TriggerCount } from './types';

/**
 * `count` is the number of sessions that carry the tag — repeated taps inside one session
 * count once, because §36 asks "what set you off", not "how hard you tapped".
 *
 * Sorted by count (most reached-for first), then by tag, so two runs of the same log agree
 * on the order. Tags the player never tapped are absent rather than zero-filled: the wall
 * of icons is the shell's job, this is only the evidence.
 */
export function deriveTriggerBreakdown(sessions: readonly Session[]): TriggerCount[] {
  const counts = new Map<string, number>();
  for (const session of [...sessions]) {
    for (const tag of new Set(tagsOf(session))) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) =>
      right.count !== left.count
        ? right.count - left.count
        : left.tag === right.tag
          ? 0
          : left.tag < right.tag
            ? -1
            : 1,
    );
}

/** The tag the player reaches for most — one number the shell can iconise. */
export function dominantTrigger(sessions: readonly Session[]): TriggerCount | null {
  const [top] = deriveTriggerBreakdown(sessions);
  return top ?? null;
}

/** Flat `tag -> count` view, for shells that want a lookup instead of a list. */
export function triggerCounts(sessions: readonly Session[]): Record<string, number> {
  const record: Record<string, number> = {};
  for (const entry of deriveTriggerBreakdown(sessions)) record[entry.tag] = entry.count;
  return record;
}
