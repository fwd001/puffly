/**
 * The start point of the player's own count, and the one moment it is chosen for them.
 *
 * The anchor is a date the statistics count from. Leaving it empty means the day's numbers have
 * no beginning, and asking someone to set a date before they are allowed to light anything is a
 * form §10 forbids — so the first cherry they light becomes it, once, and the row in settings
 * still lets them move it wherever they like.
 */

export function anchorAtLight(nowMs: number, current: number | undefined): number | undefined {
  return current === undefined ? nowMs : undefined;
}
