/**
 * 稿子 S17 的「外加一个环境预设」—— 2026-10-08 拍板放行：一套皮肤可以带来一个地方。
 *
 * The field is a *pointer* to an environment that already exists, so a skin never carries light, wind
 * or 通风系数 of its own: those stay the place's facts, and a place is something the player can already
 * walk into from the cabinet. The one new decision this ruling creates is whether wearing a skin moves
 * them, and that is what this function owns — a skin may bring a place, but it may not open a door.
 *
 * Pure, because apps/web has no component harness and this is the part worth proving: the sheet then
 * only calls it and passes the answer to the same `select` a tap on the place grid already uses.
 */
export function presetForSkin(
  skin: { environmentId?: string } | null | undefined,
  unlockedPlaces: readonly string[],
): string | null {
  const id = skin?.environmentId;
  if (id === undefined || id === '') return null;
  return unlockedPlaces.includes(id) ? id : null;
}
