/**
 * The room, in the few numbers a backdrop needs.
 *
 * The 2D layer paints a sky by mixing two colours by the place's `warmth` and scaling everything by
 * its `ambient`; this reads the *same* two colours and the same mix helper, so switching venues moves
 * the 3D picture for the same reason it moves the painted one. What is deliberately missing here is
 * the room's `kind` — a stairwell or a forecourt is a drawn silhouette, and drawing nine of them is a
 * job for the scene's own art pass, not a colour.
 */
import type { Rgb } from '@puffly/shared';
import { skyPalette } from '@puffly/game-renderer';

/** Only what a backdrop reads: the state's own view is readonly, and a narrower parameter suits it. */
export interface RoomSource {
  readonly background: {
    readonly sky: readonly [Rgb, Rgb];
    readonly horizon: Rgb;
    readonly silhouette: Rgb;
  };
  readonly lighting: {
    readonly ambient: number;
    readonly warmth: number;
    readonly keyDirectionDeg: number;
  };
}
export interface StyleSource {
  readonly scene: { readonly pool: Rgb };
}

export interface RoomBackdrop {
  /** The sky behind the table, before `ambient` is applied. */
  readonly sky: Rgb;
  /** How exposed the room is, 0..1. */
  readonly ambient: number;
  /** The key light's direction in the scene plane, from the room's own angle. */
  readonly key: { readonly x: number; readonly y: number };
  /** The pool of light the table sits in. */
  readonly pool: Rgb;
  /** The two tones the interior's wall and its furniture are mixed from, exported palette included. */
  readonly horizon: Rgb;
  readonly silhouette: Rgb;
}

export function roomBackdrop(environment: RoomSource, style: StyleSource): RoomBackdrop {
  const light = environment.lighting;
  const radians = (light.keyDirectionDeg * Math.PI) / 180;
  const sky = skyPalette(light, environment.background);
  return {
    // The band that meets the table: a plane has one colour, and this is the one the eye reads as
    // "the room's light".
    sky: sky.skyBottom,
    ambient: light.ambient,
    key: { x: Math.cos(radians), y: Math.sin(radians) },
    pool: style.scene.pool,
    horizon: sky.horizon,
    silhouette: sky.silhouette,
  };
}
