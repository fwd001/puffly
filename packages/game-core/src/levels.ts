/**
 * The ladder the smoking places are hung on (§6.1).
 *
 * Its own module because both halves of the ledger need it — `progress.ts` to decide whether a
 * rule is satisfied, `runtime.ts` to print the rung on the snapshot — and a ladder that lives in
 * one of them would make the other reach back.
 */

/**
 * Breaks kept needed to reach each level: index 0 is level 1, so a player who has kept two
 * breaks is level 2. Monotone by construction, and the shape is content's to read because the
 * ladder is what the places are hung on.
 */
export const LEVEL_THRESHOLDS: readonly number[] = [0, 2, 5, 9, 14, 20, 27, 35, 45];

/** 1-based. Every session count maps to exactly one level, and more sessions never lowers it. */
export function levelFor(sessions: number): number {
  const kept = Number.isFinite(sessions) && sessions > 0 ? Math.floor(sessions) : 0;
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i += 1) {
    const wanted = LEVEL_THRESHOLDS[i] ?? 0;
    if (kept >= wanted) level = i + 1;
  }
  return level;
}

/** How many more breaks before the next level, or 0 once the ladder runs out. */
export function sessionsToNextLevel(sessions: number): number {
  const level = levelFor(sessions);
  const next = LEVEL_THRESHOLDS[level];
  if (next === undefined) return 0;
  return Math.max(0, next - Math.max(0, Math.floor(sessions || 0)));
}
