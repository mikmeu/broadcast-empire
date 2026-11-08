// The view: how much of the floor shows, how the camera may move, and what the parts of the scene share (turn, building, clock).

import { useThree } from '@react-three/fiber';
import { createContext, useEffect } from 'react';
import { BUILDINGS, FLOOR, westOf, widthOf, type Building } from '../../config/office';

// --- The view ---

/** How much of the floor the view shows at least, across and down, in tiles. */
export const VIEW = { width: 28.8, height: 21 };

export const WALL = { low: 0.3, high: 1.5, thick: 0.12 };

/**
 * Where the view looks and how much it shows, for a building: at the middle of
 * its floor and a little below it, which leaves room under the office for the
 * street. A longer building is seen from further away, so that it fits.
 */
export function frameOf(building: Building): { center: [number, number, number]; scale: number } {
  const scale = (widthOf(building) + building.depth) / (widthOf(BUILDINGS.standard) + FLOOR.h);
  return { center: [westOf(building) + widthOf(building) / 2 - 0.4, -1.6, building.depth / 2 - 0.4], scale };
}

export type Frame = ReturnType<typeof frameOf>;

/** How far the player can change the view. */
export const CAMERA = {
  /** Zoom, as a factor of the view that fits the whole floor. */
  minZoom: 0.65,
  maxZoom: 2.2,
  /** One press of a zoom button or key. */
  zoomStep: 1.25,
  /** How far the view can move from the middle of the floor, in tiles each way. */
  reach: 9,
  /** Tiles per second when a key is held, at the starting zoom. */
  speed: 14,
  /** How fast the view follows a quarter turn; higher is quicker. */
  turnRate: 9,
  /** How far the pointer travels, in pixels, before a press counts as dragging the view and no longer as a click. */
  drag: { mouse: 5, touch: 10 },
  /** A tile looks this much shorter from front to back than from side to side: the sine of the camera's angle to the floor. */
  depth: 1 / Math.sqrt(3),
};

/**
 * The closest zoom in a building. Zoom is a factor of the view that fits the whole building, and a bigger building
 * fits at a smaller scale, so the limit is scaled with it: a tile looks as big on screen at the closest zoom in every building.
 */
export function maxZoomOf(frame: Frame): number {
  return CAMERA.maxZoom * frame.scale;
}

/** The view the player has set: zoom and where it looks. `redraw` asks for a new frame when the picture stands still. */
export interface View {
  zoom: number;
  x: number;
  z: number;
  keys: Set<string>;
  /** As the camera stands now: the angle it looks from, and how many pixels a tile is wide. Dragging goes by these. */
  angle: number;
  px: number;
  redraw: () => void;
}

/** Quarter turns of the view, 0 to 3: which side of the office is looked at. */
export const ViewTurn = createContext(0);

/** The building in view: the game's own, or in the preview the one a region gets. */
export const Shape = createContext<Building>(BUILDINGS.standard);

/** The game's clock for everything that moves: see `now` and `pace` in Props. */
export const World = createContext<{ now: () => number; hours: () => number; pace: number }>({ now: () => 0, hours: () => 0, pace: 1 });

/** With motion reduced the canvas only draws on demand, so ask for a frame when something changed. */
export function useRedraw(deps: unknown[]) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), deps);
}

/** Shows a hand over things that can be clicked (the cursor of the stylesheet: src/ui/cursors.test.ts keeps keywords out of here). */
export function usePointerCursor(enabled: boolean) {
  const canvas = useThree((s) => s.gl.domElement);
  if (!enabled) return {};
  return {
    onPointerOver: () => void (canvas.style.cursor = 'var(--cursor-pointer)'),
    onPointerOut: () => void (canvas.style.cursor = ''),
  };
}
