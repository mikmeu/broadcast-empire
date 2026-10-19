// Recoloring a character for a look (config/looks.ts). Pure: it works on the
// numbers of a model, so the 3D view only has to hand them over.
//
// Every point of a character's surface is painted from one swatch of the
// characters' picture. The swatches are all alike but for their color, so a
// part is recolored by moving its points to the same place in another swatch.

import { BODIES, SWATCHES, SWATCH_GRID, type Feature, type Look, type SwatchId } from '../config/looks';

/** The two parts a character's model is made of. */
export type BodyPart = 'head' | 'body';

/** The swatch a point is painted from, as a number: its row and column in the picture. */
export const swatchAt = (u: number, v: number) =>
  Math.min(SWATCH_GRID.rows - 1, Math.max(0, Math.floor(v * SWATCH_GRID.rows))) * SWATCH_GRID.cols + Math.min(SWATCH_GRID.cols - 1, Math.max(0, Math.floor(u * SWATCH_GRID.cols)));

const keyOf = (id: SwatchId) => SWATCHES[id].row * SWATCH_GRID.cols + SWATCHES[id].col;

/** Which features are painted on which part: hair is on the head, the outfit on the body, skin on both. */
const FEATURES_OF: Record<BodyPart, readonly Feature[]> = { head: ['skin', 'hair'], body: ['skin', 'outfit'] };

/** The shape of a part of a model: where its points are, and the triangles they make (null: every three points in turn). */
export interface Shape {
  position: ArrayLike<number>;
  index: ArrayLike<number> | null;
}

/**
 * Some characters have eyes and a mouth painted from the same swatch as their
 * hair (the black-haired ones). Each eye and the mouth is a small piece of its
 * own, 6 to 10 points, while the smallest piece of hair, a fringe, has 26: a
 * piece of the hair's swatch with fewer points than this is part of the face
 * and keeps its color (#61).
 */
export const FACE_PIECE_POINTS = 20;

/**
 * The pieces of a part a point belongs to, as one number per point: points
 * joined by a triangle, or at the same place, are of the same piece. The
 * models are drawn with flat faces, so each triangle has points of its own and
 * only their places tell which triangles touch.
 */
function piecesOf(shape: Shape): Int32Array {
  const count = shape.position.length / 3;
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  const join = (a: number, b: number) => {
    parent[root(a)] = root(b);
  };
  const at = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const place = [0, 1, 2].map((k) => Math.round(shape.position[i * 3 + k]! * 1e4)).join();
    const first = at.get(place);
    if (first === undefined) at.set(place, i);
    else join(i, first);
  }
  const corners = shape.index ? shape.index.length : count;
  const corner = (i: number) => (shape.index ? shape.index[i]! : i);
  for (let i = 0; i + 2 < corners; i += 3) {
    join(corner(i), corner(i + 1));
    join(corner(i), corner(i + 2));
  }
  return Int32Array.from({ length: count }, (_, i) => root(i));
}

/**
 * The texture coordinates of one part of a character for a look: `uv` with
 * the points of the recolored features moved to their new swatch. Returns
 * null when the look changes nothing on this part.
 */
export function restyle(part: BodyPart, uv: ArrayLike<number>, look: Look, shape: Shape): Float32Array | null {
  const own = BODIES[look.body];
  const moves = FEATURES_OF[part].flatMap((feature) => {
    const to = look[feature];
    if (!to || to === own[feature]) return [];
    const [a, b] = [SWATCHES[own[feature]], SWATCHES[to]];
    return [{ feature, from: keyOf(own[feature]), du: (b.col - a.col) / SWATCH_GRID.cols, dv: (b.row - a.row) / SWATCH_GRID.rows }];
  });
  if (moves.length === 0) return null;
  const out = Float32Array.from(uv);
  // The eyes and the mouth stay as they are when the hair is recolored.
  const pieces = moves.some((m) => m.feature === 'hair') ? piecesOf(shape) : null;
  const size = new Map<number, number>();
  for (const piece of pieces ?? []) size.set(piece, (size.get(piece) ?? 0) + 1);
  for (let i = 0; i < out.length; i += 2) {
    const key = swatchAt(out[i]!, out[i + 1]!);
    const move = moves.find((m) => m.from === key);
    if (!move) continue;
    if (move.feature === 'hair' && pieces && size.get(pieces[i / 2]!)! < FACE_PIECE_POINTS) continue;
    out[i]! += move.du;
    out[i + 1]! += move.dv;
  }
  return out;
}

/** The part of a character a mesh of its model is, by the mesh's name. */
export const partOf = (meshName: string): BodyPart | null => (meshName.startsWith('head') ? 'head' : meshName.startsWith('body') ? 'body' : null);
