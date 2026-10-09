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
