/**
 * S20's only judgement: has today's count reached the line the player drew for themselves?
 *
 * Reaching it is not a stop — the break stays available, no dialog appears, nothing is locked
 * (§10's limitRule). The ceiling changes what a ring looks like and nothing else, which is why it
 * lives beside the preference in the shell rather than in the simulation that runs the rod.
 */

export function isOverLimit(sticks: number, limit: number | undefined): boolean {
  if (limit === undefined || limit <= 0) return false;
  return sticks >= limit;
}
