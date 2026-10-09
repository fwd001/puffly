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
  return maskTexture(size, roundedMask(size, 1, 1, radii, feather));
}

/**
 * The same shape as a ring — the outer rounded rectangle minus an inner one inset by the border
 * width — which is what a control's 1px border is. CSS's own rule for the inner corner comes along:
 * its radius is the outer radius minus the border. Both edges keep their own feather, so a hairline
 * stays a hairline instead of turning into a soft band.
 */
export function frameRect(
  size: number,
  outer: ReadonlyArray<readonly [number, number]>,
  insetX: number,
  insetY: number,
  feather = 1.5,
): THREE.DataTexture {
  const inner = outer.map(
    ([rx, ry]) => [Math.max(0, rx - insetX), Math.max(0, ry - insetY)] as [number, number],
  );
  const whole = roundedMask(size, 1, 1, outer, feather);
  const hole = roundedMask(
    size,
    Math.max(1e-6, 1 - insetX),
    Math.max(1e-6, 1 - insetY),
    inner,
    feather,
  );
  const coverage = new Float32Array(size * size);
  for (let i = 0; i < coverage.length; i += 1) {
    coverage[i] = Math.max(0, (whole[i] ?? 0) - (hole[i] ?? 0));
  }
  return maskTexture(size, coverage);
}

/**
 * The flame gradient's alpha profile, hue-free: 0.7 on the wick, 0.85 at the belly, gone by the
 * tip — the vertical slice the scene multiplies its vertex colours by (the painted layer's three
 * `addColorStop` opacities, in one place).
 */
export function flameAlpha(): THREE.DataTexture {
  const width = 2;
  const height = 32;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const t = y / (height - 1);
    const alpha = t <= 0.45 ? 0.7 + (0.85 - 0.7) * (t / 0.45) : 0.85 * (1 - (t - 0.45) / 0.55);
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/** Rounded-rectangle coverage per texel, 0..1 — the one copy of the corner distance math. */
function roundedMask(
  size: number,
  spanX: number,
  spanY: number,
  radii: ReadonlyArray<readonly [number, number]>,
  feather: number,
): Float32Array {
  const mask = new Float32Array(size * size);
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
      const [cornerX, cornerY] = corner ?? [0.5, 0.5];
      // The edge bounds and the radius that turns them — per axis, so a card on a wide quad keeps
      // round corners instead of stretched ones. A radius never exceeds its half-span, the way CSS
      // clamps.
      const edgeX = Math.max(1e-6, spanX - Math.min(cornerX, spanX));
      const edgeY = Math.max(1e-6, spanY - Math.min(cornerY, spanY));
      const radius = Math.min(Math.min(cornerX, spanX), Math.min(cornerY, spanY));
      const cx = Math.max(0, dx - edgeX) / Math.max(1e-6, radius);
      const cy = Math.max(0, dy - edgeY) / Math.max(1e-6, radius);
      const distance = Math.hypot(cx, cy);
      mask[y * size + x] =
        distance <= 1
          ? 1
          : Math.max(
              0,
              Math.min(
                1,
                (1 + feather / (centre * radius) - distance) * ((centre * radius) / feather),
              ),
            );
    }
  }
  return mask;
}

function maskTexture(size: number, coverage: ArrayLike<number>): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    const base = i * 4;
    data[base] = 255;
    data[base + 1] = 255;
    data[base + 2] = 255;
    data[base + 3] = Math.round(Math.min(1, Math.max(0, coverage[i] ?? 0)) * 255);
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
