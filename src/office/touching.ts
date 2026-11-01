// For the tests of the traffic: whether two vehicles touch, by the ground
// each covers, a rectangle turned the way the vehicle points. The game does
// not use it: the traffic keeps them apart by its rules (traffic.ts).

import { trainAt, trainLength } from './city';
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

/** How far from their middle someone on foot reaches, in tiles. */
const PERSON = 0.12;

/** The first vehicle that touches someone on foot at a point, if one does. */
export function touchingPerson(traffic: Traffic, person: { x: number; z: number }): Vehicle | null {
  for (const vehicle of vehiclesIn(traffic)) {
    const box = boxOf(traffic, vehicle);
    // The point's distance from the box, in the box's own directions.
    const [dx, dz] = [person.x - box.x, person.z - box.z];
    const long = Math.abs(dx * box.along.x + dz * box.along.z) - box.half.length;
    const wide = Math.abs(dx * box.across.x + dz * box.across.z) - box.half.width;
    if (Math.max(long, 0) ** 2 + Math.max(wide, 0) ** 2 < PERSON * PERSON) return vehicle;
  }
  return null;
}

/** How wide the train is, in tiles: a double-decker is 1.285 of the kit's units wide, drawn 3 times that. */
const TRAIN_WIDTH = 3.9;

/** The ground the train covers now (0.21.0, #288), a rectangle along the line: null where there is none, or the town has no train. */
export function trainBox(traffic: Traffic): Box | null {
  const { train } = traffic;
  if (!train) return null;
  const { layout } = traffic.roads;
  const at = trainAt(traffic.time + train.offset, train.cars, layout);
  if (!at) return null;
  const length = trainLength(train.cars);
  return { x: at.x - (at.direction * length) / 2, z: layout.railway.z, along: { x: 1, z: 0 }, across: { x: 0, z: 1 }, half: { length: length / 2, width: TRAIN_WIDTH / 2 } };
}

/** The first vehicle that touches the train, or the first person (a point, as `touchingPerson`) it runs over, if any does. */
export function touchingTrain(traffic: Traffic, people: readonly { x: number; z: number }[] = []): Vehicle | { x: number; z: number } | null {
  const train = trainBox(traffic);
  if (!train) return null;
  for (const vehicle of vehiclesIn(traffic)) if (overlap(boxOf(traffic, vehicle), train)) return vehicle;
  for (const person of people) {
    const [dx, dz] = [person.x - train.x, person.z - train.z];
    if (Math.abs(dx) < train.half.length + PERSON && Math.abs(dz) < train.half.width + PERSON) return person;
  }
  return null;
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
