/**
 * A CSS colour string as a THREE colour, in the space the scene works in.
 *
 * Browsers hand computed colours back in three shapes — `rgb()`, `color(srgb …)` and, for anything
 * that went through `color-mix()`, `oklab(…)`, which computed values preserve rather than
 * normalising (measured: a hidden probe element reading the value back returns the same oklab
 * string). All three are parsed here; the oklab conversion is Ottosson's own reference matrices.
 * The first version of this only knew `rgb()` and the pill's whole gradient read as no stops at all
 * (the card came out invisible and only its glow showed), which is what sent it here.
 *
 * Two more shapes arrive when the value is read out of a **custom property** rather than off a
 * computed property: a custom property's computed value is its token stream with variables
 * substituted, so a token that holds `#c4c6cd` stays hex and one that holds a `color-mix()` stays a
 * `color-mix()`. The sliders' `--slider-*` variables are the first such readers. Only the mix shape
 * the stylesheet actually writes is understood — `color-mix(…, <colour> p%, transparent)`, which is
 * that colour at `p%` alpha (premultiplied mixing with transparent leaves the colour alone) — and
 * anything else returns null on purpose: falling through to a wrong colour is worse than skipping.
 *
 * Alpha rides along, because every caller needs it.
 */
import * as THREE from 'three';

export function parseColour(text: string): { colour: THREE.Color; alpha: number } | null {
  const trimmed = text.trim();
  const alphaOf = (value: string | undefined): number => {
    if (value === undefined) return 1;
    return value.endsWith('%') ? Number.parseFloat(value) / 100 : Number.parseFloat(value);
  };
  const mix = /^color-mix\(\s*in\s+[\w-]+\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/i.exec(
    trimmed,
  );
  if (mix !== null) {
    const inner = parseColour(mix[1] ?? '');
    if (inner === null) return null;
    return { colour: inner.colour, alpha: inner.alpha * (Number.parseFloat(mix[2] ?? '0') / 100) };
  }
  const oklab =
    /oklab\(\s*([\d.+-eE]+%?)\s+([\d.+-eE]+)\s+([\d.+-eE]+)\s*(?:\/\s*([\d.]+%?))?\s*\)/.exec(
      trimmed,
    );
  if (oklab !== null) {
    const lText = oklab[1] ?? '0';
    const L = Number.parseFloat(lText) / (lText.endsWith('%') ? 100 : 1);
    const a = Number.parseFloat(oklab[2] ?? '0');
    const b = Number.parseFloat(oklab[3] ?? '0');
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return {
      colour: new THREE.Color().setRGB(
        Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
        THREE.LinearSRGBColorSpace,
      ),
      alpha: alphaOf(oklab[4]),
    };
  }
  const rgb = /rgba?\(([^)]+)\)/.exec(trimmed);
  if (rgb !== null) {
    const values = (rgb[1] ?? '').split(/[,\s/]+/).map(Number);
    return {
      colour: new THREE.Color().setRGB(
        (values[0] ?? 0) / 255,
        (values[1] ?? 0) / 255,
        (values[2] ?? 0) / 255,
        THREE.SRGBColorSpace,
      ),
      alpha: alphaOf(rgb[1]?.split(/[,\s/]+/)[3]),
    };
  }
  const srgb = /color\(srgb\s+([^)]+)\)/.exec(trimmed);
  if (srgb !== null) {
    const values = (srgb[1] ?? '').split(/[\s/]+/).map(Number);
    return {
      colour: new THREE.Color().setRGB(
        values[0] ?? 0,
        values[1] ?? 0,
        values[2] ?? 0,
        THREE.SRGBColorSpace,
      ),
      alpha: alphaOf(srgb[1]?.split(/[\s/]+/)[3]),
    };
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (hex !== null) {
    const digits = hex[1] ?? '';
    const wide = digits.length === 6;
    const channel = (index: number): number =>
      Number.parseInt(
        wide ? digits.slice(index * 2, index * 2 + 2) : (digits[index] ?? '0').repeat(2),
        16,
      ) / 255;
    return {
      colour: new THREE.Color().setRGB(channel(0), channel(1), channel(2), THREE.SRGBColorSpace),
      alpha: 1,
    };
  }
  return null;
}
