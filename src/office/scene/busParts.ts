// The bus, of shapes: the Car Kit has none. After the designer's photo of a bus: white above a blue skirt, a long band of dark windows,
// a tall windscreen with the destination over it, and two doors on the side of the kerb.

import type { Box } from './vehicleModels';

/** The shapes of a bus `length` long and `width` wide, pointing along +x and standing on y = 0; the doors are on the side of +z. */
export function busBoxes(length: number, width: number): Box[] {
  return [
    { at: [0, 1.4, 0], size: [length, 0.8, width - 0.08], part: 'body' },
    { at: [0, 0.56, 0], size: [length - 0.4, 0.32, width], part: 'dark' },
    { at: [0, 0.84, 0], size: [length + 0.04, 0.4, width], part: 'glass' },
    { at: [-0.2, 1.92, 0], size: [length - 1, 0.6, width], part: 'dark' },
    { at: [0, 2.34, 0], size: [length, 0.24, width - 0.08], part: 'body' },
    { at: [length / 2 - 0.04, 1.76, 0], size: [0.16, 1, width - 0.2], part: 'dark' },
    { at: [length / 2, 2.34, 0], size: [0.12, 0.2, 1.12], part: 'lamp' },
    { at: [1.9, 1.44, width / 2], size: [0.84, 1.44, 0.08], part: 'dark' },
    { at: [-0.7, 1.44, width / 2], size: [0.84, 1.44, 0.08], part: 'dark' },
  ];
}
