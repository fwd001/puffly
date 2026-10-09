import { describe, expect, it } from 'vitest';
import { layoutText, parseAtlas } from '../text';

const ATLAS = parseAtlas({
  cell: 64,
  columns: 4,
  rows: 2,
  readout: '0123456789%',
  metrics: {
    0: { col: 0, row: 0, w: 64, h: 64, advance: 0.5 },
    1: { col: 1, row: 0, w: 64, h: 64, advance: 0.5 },
    ':': { col: 2, row: 0, w: 64, h: 64, advance: 0.3 },
    烟: { col: 3, row: 1, w: 64, h: 64, advance: 1 },
  },
});

describe('an atlas is refused where it is wrong, not where it is used', () => {
  it('takes a well-formed one', () => {
    expect(ATLAS.columns).toBe(4);
    expect(ATLAS.metrics['烟']?.advance).toBe(1);
  });

  it('refuses a metric outside the grid', () => {
    expect(() =>
      parseAtlas({
        cell: 64,
        columns: 2,
        rows: 2,
        readout: '0',
        metrics: { x: { col: 5, row: 0, w: 64, h: 64, advance: 1 } },
      }),
    ).toThrow(/bad metric/);
  });

  it('refuses a bad cell and a missing metrics table', () => {
    expect(() => parseAtlas({ cell: 0, columns: 1, rows: 1, readout: '0', metrics: {} })).toThrow(
      /bad cell/,
    );
    expect(() => parseAtlas({ cell: 64, columns: 1, rows: 1, readout: '0' })).toThrow(
      /bad metrics/,
    );
  });
});

describe('a run of text is a list of glyph quads on one baseline', () => {
  it('advances the pen by each glyph and reports the run width', () => {
    const layout = layoutText('00:00', ATLAS, 10);
    expect(layout.quads.map((quad) => quad.char)).toEqual(['0', '0', ':', '0', '0']);
    expect(layout.missing).toEqual([]);
    // Two 0.5em glyphs, a 0.3em colon, two more 0.5em glyphs — the pen's end is the width.
    expect(layout.width).toBeCloseTo(10 * (0.5 + 0.5 + 0.3 + 0.5 + 0.5), 6);
    expect(layout.quads[2]?.x).toBeCloseTo(10, 6);
  });

  it('keeps every quad inside the atlas and on its own cell', () => {
    const layout = layoutText('烟:', ATLAS, 10);
    for (const quad of layout.quads) {
      expect(quad.u0).toBeGreaterThanOrEqual(0);
      expect(quad.u1).toBeLessThanOrEqual(1);
      expect(quad.v0).toBeGreaterThanOrEqual(0);
      expect(quad.v1).toBeLessThanOrEqual(1);
    }
    const smoke = layout.quads[0];
    expect(smoke?.v0).toBeCloseTo(64 / 128, 6);
    expect(smoke?.u0).toBeCloseTo(192 / 256, 6);
  });

  it('moves the pen for a space without drawing anything', () => {
    const layout = layoutText('0 0', ATLAS, 10);
    expect(layout.quads).toHaveLength(2);
    expect(layout.quads[1]?.x).toBeCloseTo(10 * (0.5 + 0.32), 6);
  });

  it('reports a character the atlas has no glyph for, and still lays the rest out', () => {
    const layout = layoutText('0X0', ATLAS, 10);
    expect(layout.missing).toEqual(['X']);
    expect(layout.quads).toHaveLength(2);
    expect(layout.quads[1]?.x).toBeCloseTo(10 * (0.5 + 0.5), 6);
  });
});
