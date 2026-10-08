/**
 * 点内容区域之外就收起 — S10's sidebar panel and the phone's drawer both cover the thing the break
 * is made of, and the way out of an overlay is the part of the screen that is not the overlay.
 */

/**
 * True when a press landed on the scene itself. The canvas *is* the scene — every panel, row and
 * button the shell draws sits beside it, not inside it — so this one question answers "outside",
 * "on the break", and "the surface that has no other job right now" at the same time.
 */
export function isScenePress(
  scene: Element | null | undefined,
  target: EventTarget | null,
): boolean {
  if (scene === null || scene === undefined) return false;
  return target instanceof Node && scene.contains(target);
}
