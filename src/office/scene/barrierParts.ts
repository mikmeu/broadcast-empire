// The barrier of a level crossing ("boom gate"), of shapes: a squat post with a lamp housing, and a thin arm in red and white stripes.
// Made in the kit's manner (chunky boxes, flat colours); no model of Kenney's was used.

import type { Box } from './vehicleModels';

/** Where the arm turns, from the foot of the post: at the post, a little below its head. */
export const ARM_PIVOT: [number, number, number] = [0, 1.2, 0];

/** The arm's angle about z (+x raised towards +y): flat across the road when the barrier is closed, tipped up when it is open. */
export const BARRIER = { arm: { down: 0, up: Math.PI / 2.4 }, length: 2.2 } as const;

/** The stripe lengths of the arm, in tiles. */
const STRIPE = 0.2;
const ARM = { height: 0.08, depth: 0.12 };

/** The post, standing on y = 0 at the origin: a foot, a shaft, and a lamp housing on top (1.6 tall in all). */
export function postBoxes(): Box[] {
  return [
    { at: [0, 0.05, 0], size: [0.4, 0.1, 0.4], part: 'metalMid' },
    { at: [0, 0.65, 0], size: [0.22, 1.1, 0.22], part: 'body' },
    // a red band round the shaft
    { at: [0, 0.35, 0], size: [0.24, 0.16, 0.24], part: 'stripe' },
    // the housing the arm is hung in, with a hood and a dark face on the side of the drivers (+z)
    { at: [0, 1.4, 0], size: [0.3, 0.4, 0.3], part: 'metal' },
    { at: [0, 1.62, 0], size: [0.36, 0.04, 0.36], part: 'dark' },
    { at: [0, 1.4, 0.16], size: [0.18, 0.2, 0.02], part: 'dark' },
  ];
}

/** The arm, along +x from its pivot at the origin, `length` long: white and red in turn, with a dark core's worth of thickness and a tip. */
export function armBoxes(length: number): Box[] {
  const boxes: Box[] = [];
  const count = Math.max(1, Math.round(length / STRIPE));
  const each = length / count;
  for (let i = 0; i < count; i++) {
    boxes.push({ at: [each * (i + 0.5), 0, 0], size: [each, ARM.height, ARM.depth], part: i % 2 === 0 ? 'stripe' : 'body' });
  }
  // a short stub behind the pivot, in the housing, so that the arm does not seem cut off when it is raised
  boxes.push({ at: [-0.12, 0, 0], size: [0.24, ARM.height + 0.04, ARM.depth + 0.04], part: 'dark' });
  return boxes;
}

/** Two small lamps on the arm's side facing the drivers (+z), from the foot of the post with the arm down; they are lit while the barrier is closed. */
export function lampBoxes(): { at: [number, number, number]; size: [number, number, number] }[] {
  const [px, py, pz] = ARM_PIVOT;
  const z = pz + ARM.depth / 2 + 0.02;
  return [px + BARRIER.length * 0.45, px + BARRIER.length * 0.85].map((x) => ({ at: [x, py, z] as [number, number, number], size: [0.12, 0.12, 0.04] as [number, number, number] }));
}
