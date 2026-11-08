// The bus, of shapes: the Car Kit has none. After the designer's photo of a bus: white above a blue skirt, a long band of dark windows,
// a tall windscreen with the destination over it, and two doors on the side of the kerb.

import type { Box } from './vehicleModels';

/** The shapes of a bus `length` long and `width` wide, pointing along +x and standing on y = 0; the doors are on the side of +z. */
export function busBoxes(length: number, width: number): Box[] {
  // In the kit's manner: a chunky body of a few big boxes, stepped at the roof, with wheels (0.6 tall, 0.35 wide) standing a little out of the sides.
  const body = width - 0.2; // the body is narrower than the wheels' outer faces, which are at width / 2
  const wheelX = length / 2 - 1.4;
  const wheelZ = width / 2 - 0.175;
  const end = length / 2;
  const wheels: Box[] = [];
  for (const x of [wheelX, -wheelX]) {
    for (const z of [wheelZ, -wheelZ]) wheels.push({ at: [x, 0.3, z], size: [0.6, 0.6, 0.35], part: 'dark' });
  }
  return [
    ...wheels,
    // the blue skirt, the white waist, the roof with a stepped edge
    { at: [0, 0.58, 0], size: [length - 0.06, 0.56, body], part: 'glass' },
    { at: [0, 1.0, 0], size: [length, 0.3, body], part: 'body' },
    { at: [0, 2.0, 0], size: [length, 0.3, body], part: 'body' },
    { at: [0, 2.21, 0], size: [length - 0.4, 0.12, body - 0.3], part: 'body' },
    // the white body between the windows, then the long band of windows, a little proud of it
    { at: [0, 1.5, 0], size: [length - 0.1, 0.7, body - 0.06], part: 'body' },
    { at: [-0.1, 1.5, 0], size: [length - 0.7, 0.62, body + 0.06], part: 'dark' },
    // the tall windscreen and, over it, the destination
    { at: [end - 0.04, 1.5, 0], size: [0.08, 0.9, body - 0.2], part: 'dark' },
    { at: [end - 0.04, 2.0, 0], size: [0.08, 0.2, 1.0], part: 'lamp' },
    // headlamps
    { at: [end - 0.03, 0.68, wheelZ - 0.1], size: [0.06, 0.16, 0.26], part: 'lamp' },
    { at: [end - 0.03, 0.68, -wheelZ + 0.1], size: [0.06, 0.16, 0.26], part: 'lamp' },
    // the two doors on the kerb side, the front one ahead of the front wheel
    { at: [2.6, 1.05, body / 2 + 0.02], size: [0.8, 1.5, 0.06], part: 'dark' },
    { at: [-0.6, 1.05, body / 2 + 0.02], size: [0.8, 1.5, 0.06], part: 'dark' },
  ];
}
