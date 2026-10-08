/**
 * 力度对照图 — the exhale reading from 稿子 S4: 「力度条本身就是对照图：左端是细雾三道丝线图标，
 * 右端是浓团三层云朵图标，中间滑杆，零文字」.
 *
 * The deck struck the two Chinese labels that used to sit at the ends of the bar (「小口 · 薄雾」 and
 * 「大口 · 浓团」) and put the shapes they named in their place, so the bar is its own legend: three
 * hairlines at one end, three lobes of cloud at the other, a knob where the draw landed. Nothing here
 * is a word, and nothing here is a control — the press owns the draw (2026-10-08 拍板 ①), so this only
 * ever reports the one the finger just took.
 *
 * The figure has one owner on purpose: the ring's digits (S4 环内力度 62) and the knob are both read
 * from `forceReading`, because a number and a position that drift apart would be two readings of the
 * same draw. It is the core's `puff.lastDraw` rounded once here (§26), not recomputed per surface.
 */

import { clamp01 } from '@puffly/shared';

/** Where the track runs. The two pictograms own the margins outside it. */
export const FORCE_TRACK = { start: 26, end: 92, y: 12 } as const;

/** 三道丝线: three hairlines, longest nearest the track, so the thin end tapers away from it. */
export const FORCE_THREADS = [
  'M2 6c6-2 12 2 18 0',
  'M2 12c5-2 10 2 15 0',
  'M2 18c4-2 8 2 11 0',
] as const;

/** 三层云朵: three lobes overlapping into one mass, the largest one nearest the track. */
export const FORCE_CLOUD = [
  { cx: 100, cy: 14, r: 5 },
  { cx: 107, cy: 11, r: 6 },
  { cx: 113, cy: 15, r: 4.5 },
] as const;

/** What the pill and the ring need to agree about: the rod's state and its last draw. */
interface ForceSource {
  readonly state: string;
  readonly puff: { readonly lastDraw: number };
}

/**
 * The draw the player just took, as the 0–100 figure the deck shows, or `null` when the rod is not in
 * the window the smoke is leaving.
 *
 * `RESTING` is that window: it is what the state machine derives for the `restSettleMs` after a
 * release, and a long column or a stub pre-empts it on purpose — one screen reads one news. The
 * settle length is the core's decision and is not re-timed here (§81).
 */
export function forceReading(cigarette: ForceSource): number | null {
  if (cigarette.state !== 'RESTING') return null;
  const { lastDraw } = cigarette.puff;
  // Zero means "no draw has ended": a rod that was never breathed on, or one restored from a save,
  // has nothing to report and must not show a knob pinned at the thin end.
  if (!(lastDraw > 0)) return null;
  return Math.round(clamp01(lastDraw) * 100);
}

/** Where the knob sits for a reading, in the band's own units. */
export function forceKnobX(percent: number): number {
  const fraction = clamp01(Math.max(0, percent) / 100);
  return FORCE_TRACK.start + fraction * (FORCE_TRACK.end - FORCE_TRACK.start);
}
