/**
 * A soft disc, generated in code.
 *
 * The 2D layer's puffs are radial-gradient sprites it bakes at startup; the 3D layer needs the same
 * softness without reaching for a canvas (the whole point of this rewrite is that the interface
 * layer stops being canvas), so the alpha falloff is written straight into a `DataTexture`. One
 * texture, one shape: a puff is a soft disc whatever size it is drawn at.
 */
import * as THREE from 'three';

/**
 * `power` shapes the falloff: a higher power keeps the middle solid for longer and makes the rim
 * thinner, which is what stops a big puff from reading as a ring.
 */
export function softDisc(size = 64, power = 2.2): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - centre) / centre;
      const dy = (y - centre) / centre;
      const r = Math.min(1, Math.hypot(dx, dy));
      const alpha = Math.pow(1 - r, power);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * A solid disc, feathered only at the very rim.
 *
 * A grain of ash is a shape, not a puff: the painted layer draws it with `ctx.ellipse` — a hard edge
 * — and a `softDisc` would turn every flake into a smudge. The feather is one texel-ish band so the
 * edge is not jagged at the sizes the stage draws.
 */
export function solidDisc(size = 32, feather = 0.16): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - centre) / centre;
      const dy = (y - centre) / centre;
      const r = Math.hypot(dx, dy);
      const t = r <= 1 - feather ? 1 : Math.max(0, (1 - r) / feather);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.min(1, t) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * A rounded rectangle: opaque inside, feathered at the edge, corners turned by `radiusX`/`radiusY`
 * (each as a fraction of that axis's half-size, so a wide card's corners stay round). Both at 0.5
 * is a stadium — the pill's shape, since its CSS asks for a 30px radius on a 58px box and the
 * browser clamps it to half the height — and both at 1 is a circle.
 */
export function roundedRect(
  size = 128,
  radiusX = 0.5,
  radiusY = radiusX,
  feather = 1.5,
  /**
   * Per-corner radii in CSS order — top-left, top-right, bottom-right, bottom-left — each `[rx, ry]`
   * normalised like the scalars above. Omitted means all four corners take `radiusX/radiusY`, which
   * is what the stadium cards and the dials want. The sheet is why this exists: 22 px on its top two
   * corners and square at the bottom, and a uniformly rounded bottom would show two corners the
   * design does not have.
   */
  corners?: ReadonlyArray<readonly [number, number]>,
): THREE.DataTexture {
  const radii = corners ?? [
    [radiusX, radiusY],
    [radiusX, radiusY],
    [radiusX, radiusY],
    [radiusX, radiusY],
  ];
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = Math.abs((x - centre) / centre);
      const dy = Math.abs((y - centre) / centre);
      // The data's y=0 row is the card's bottom edge on screen (a DataTexture is not flipped and
      // the card's uvs put v=0 at its lower edge), so the quadrants map onto CSS corners like this.
      const corner =
        y < centre
          ? x < centre
            ? (radii[3] ?? radii[0])
            : (radii[2] ?? radii[0])
          : x < centre
            ? (radii[0] ?? radii[1])
            : (radii[1] ?? radii[0]);
      const [cornerX, cornerY] = corner ?? [radiusX, radiusY];
      // Distance to the inner rectangle whose corners the radii turn — per axis, so a card on a
      // wide quad keeps round corners instead of stretched ones.
      const cx = Math.max(0, dx - Math.max(0, 1 - cornerX)) / Math.max(1e-6, cornerX);
      const cy = Math.max(0, dy - Math.max(0, 1 - cornerY)) / Math.max(1e-6, cornerY);
      const radius = Math.min(cornerX, cornerY);
      const distance = Math.hypot(cx, cy);
      const t =
        distance <= 1
          ? 1
          : Math.max(
              0,
              (1 + feather / (centre * radius) - distance) * ((centre * radius) / feather),
            );
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.min(1, t) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * The room's vignette, as a texture: clear in the middle, opaque at the rim.
 *
 * The painted layer draws a radial gradient from the canvas centre out to `max(w, h) * 0.78`; the 3D
 * layer lays the same shape over the backdrop as a plane. `inner` is the fraction of the radius that
 * stays clear, `outer` where it is fully dark — one stop each, like the two colour stops it replaced.
 */
export function radialVignette(size = 128, inner = 0.25, outer = 1): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - centre) / centre;
      const dy = (y - centre) / centre;
      const r = Math.hypot(dx, dy);
      const t = Math.max(0, Math.min(1, (r - inner) / Math.max(1e-6, outer - inner)));
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(t * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}
