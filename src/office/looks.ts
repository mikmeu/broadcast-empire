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

/**
 * The texture coordinates of one part of a character for a look: `uv` with
 * the points of the recolored features moved to their new swatch. Returns
 * null when the look changes nothing on this part.
 */
export function restyle(part: BodyPart, uv: ArrayLike<number>, look: Look): Float32Array | null {
  const own = BODIES[look.body];
  const moves = FEATURES_OF[part].flatMap((feature) => {
    const to = look[feature];
    if (!to || to === own[feature]) return [];
    const [a, b] = [SWATCHES[own[feature]], SWATCHES[to]];
    return [{ from: keyOf(own[feature]), du: (b.col - a.col) / SWATCH_GRID.cols, dv: (b.row - a.row) / SWATCH_GRID.rows }];
  });
  if (moves.length === 0) return null;
  const out = Float32Array.from(uv);
  for (let i = 0; i < out.length; i += 2) {
    const key = swatchAt(out[i]!, out[i + 1]!);
    const move = moves.find((m) => m.from === key);
    if (!move) continue;
    out[i]! += move.du;
    out[i + 1]! += move.dv;
  }
  return out;
}

/** The part of a character a mesh of its model is, by the mesh's name. */
export const partOf = (meshName: string): BodyPart | null => (meshName.startsWith('head') ? 'head' : meshName.startsWith('body') ? 'body' : null);
