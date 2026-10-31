import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../../config/office';
import { CAMERA, frameOf, maxZoomOf } from './frame';

// On screen a tile is as wide as `zoom / scale` (Office3D divides the fit by the frame's scale).
const tile = (zoom: number, scale: number) => zoom / scale;

describe('the closest zoom', () => {
  const all = Object.values(BUILDINGS);

  it('makes a tile the same size on screen in every building', () => {
    for (const b of all) {
      const f = frameOf(b);
      expect(tile(maxZoomOf(f), f.scale)).toBeCloseTo(CAMERA.maxZoom, 10);
    }
  });

  it('is the old limit in the standard building', () => {
    expect(maxZoomOf(frameOf(BUILDINGS.standard))).toBeCloseTo(CAMERA.maxZoom, 10);
  });

  it('never lies below the furthest zoom, which is unchanged', () => {
    expect(CAMERA.minZoom).toBe(0.65);
    for (const b of all) expect(maxZoomOf(frameOf(b))).toBeGreaterThan(CAMERA.minZoom);
  });
});
