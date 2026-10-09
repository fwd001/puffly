/**
 * Prop sizes, in stage units — the same units the core's layout and the Canvas 2D props use.
 *
 * One stage unit is the stage's own height (the 2D viewport's `unit` is `min(width / 0.75, height)`,
 * which is the height for any stage at or wider than 3:4), so a size here multiplies `WORLD_HEIGHT`
 * to become world units. Getting that wrong is how the first draft of this layer drew a lighter two
 * thirds of its real width.
 *
 * The numbers are the 2D renderer's own exports while that renderer still ships; `apps/web` carries
 * a parity test pinning the two together, and that test retires with the 2D layer (P5).
 */
export const LIGHTER_SIZE = { width: 0.05, height: 0.075 } as const;
export const PACK_SIZE = { width: 0.058, height: 0.088 } as const;

/** A size in stage units → world units, given the stage's world height. */
export function toWorldSize(size: number, worldHeight: number): number {
  return size * worldHeight;
}

/**
 * The ashtray's radius comes from the core instead (`anchors.ashtrayRadius`), published through the
 * stage mirror: it is a fact about the layout, and a copy of it here would be the second source this
 * repository has already been burned by twice.
 */
export function ashtrayRadiusWorld(stageUnits: number, worldHeight: number): number {
  return stageUnits * worldHeight;
}

/** The mirrored ashtray radius: stage units, or null when the mirror is missing or unreadable. */
export function parsePropScale(text: string): number | null {
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}
