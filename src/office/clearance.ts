// How tall a thing in town can be before it hides the ground floor of the office. Pure, and with nothing of the town's maps in it, so that the
// converter of old map files (src/mods/oldMap.ts) can use it before there are map files to load.

import { BUILDINGS, westOf, type Building } from '../config/office';

/** How far the pavement is above the street. */
export const PAVEMENT = 0.2;

/** How tall a street lamp post stands (StreetLamp.tsx). */
export const LAMP_HEIGHT = 2.4;

/**
 * How tall something standing at (x, z) with this footprint can be before it
 * hides part of the ground floor. The view looks down a diagonal, so a
 * building in front hides whatever lies as far behind it as it is tall.
 * Infinity for buildings that aren't in front of the office at all.
 */
export function clearance(x: number, z: number, w: number, d: number, building: Building = BUILDINGS.standard): number {
  const nearX = x - w / 2;
  const nearZ = z - d / 2;
  if (nearX + w <= westOf(building) || nearZ + d <= 0) return Infinity;
  return Math.max(nearX - building.w, nearZ - building.depth);
}
