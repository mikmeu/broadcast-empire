// For the tests of the traffic: whether two vehicles touch, by the ground
// each covers, a rectangle turned the way the vehicle points. The game does
// not use it: the traffic keeps them apart by its rules (traffic.ts).

import { placeOf, vehiclesIn, type Traffic, type Vehicle } from './traffic';

interface Box {
  x: number;
  z: number;
  /** Along the vehicle and across it, as directions on the ground. */
  along: { x: number; z: number };
  across: { x: number; z: number };
  half: { length: number; width: number };
}

function boxOf(traffic: Traffic, vehicle: Vehicle): Box {
  const { x, z, angle } = placeOf(traffic, vehicle);
  // An angle of 0 points along x; a quarter turn points along -z (see placeOf).
  const along = { x: Math.cos(angle), z: -Math.sin(angle) };
  return { x, z, along, across: { x: -along.z, z: along.x }, half: { length: vehicle.length / 2, width: vehicle.width / 2 } };
}

/** How far a box reaches from its middle in a direction. */
const reach = (box: Box, d: { x: number; z: number }) =>
  box.half.length * Math.abs(box.along.x * d.x + box.along.z * d.z) + box.half.width * Math.abs(box.across.x * d.x + box.across.z * d.z);

/** Two turned rectangles overlap unless one of their four sides' directions separates them. */
function overlap(a: Box, b: Box): boolean {
  for (const d of [a.along, a.across, b.along, b.across]) {
    const apart = Math.abs((b.x - a.x) * d.x + (b.z - a.z) * d.z);
    if (apart >= reach(a, d) + reach(b, d)) return false;
  }
  return true;
}

/** The first two vehicles that touch, if any do. */
export function touching(traffic: Traffic): [Vehicle, Vehicle] | null {
  const all = vehiclesIn(traffic);
  const boxes = all.map((v) => boxOf(traffic, v));
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) if (overlap(boxes[i]!, boxes[j]!)) return [all[i]!, all[j]!];
  }
  return null;
}
