// The map editor's overlay of what the game generates from the roads (0.21.0, #330): flat ribbons with chevrons, because a WebGL line is one pixel wide.
// They are drawn over the houses (no depth test), and routes that share a lane lie a little apart. The data comes from src/office/routeOverlay.ts; the
// geometry is built once for it, and again only when it is a new one (the editor makes a new one when the structure of the map changes).

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { OVERLAY_LAYERS, type LayerId, type Point, type RouteOverlay } from '../routeOverlay';

const colourOf = (id: LayerId) => OVERLAY_LAYERS.find((l) => l.id === id)!.colour;

/** How a line is drawn: how wide, how far to the side of the line (so routes that share a lane lie apart), how high, and how far apart its chevrons are (0: none). */
interface Look {
  width: number;
  side: number;
  level: number;
  every: number;
}

/**
 * The triangles of a ribbon along each line: a quad for every stretch between two points and, along it, chevrons that point the way it goes. Pure, so a test can hold it.
 * Positions only, three numbers a vertex, in triangles.
 */
export function ribbonsOf(lines: readonly (readonly Point[])[], look: Look): number[] {
  const out: number[] = [];
  const quad = (a: Point, b: Point, c: Point, d: Point, y: number) => out.push(a.x, y, a.z, b.x, y, b.z, c.x, y, c.z, a.x, y, a.z, c.x, y, c.z, d.x, y, d.z);
  for (const line of lines) {
    let carried = 0;
    for (let k = 1; k < line.length; k++) {
      const [a, b] = [line[k - 1]!, line[k]!];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.01) continue;
      const [dx, dz] = [(b.x - a.x) / length, (b.z - a.z) / length];
      // (To the right of the way it goes, seen from above: the same side for every line that goes that way.)
      const [nx, nz] = [-dz, dx];
      const at = (along: number, across: number): Point => ({ x: a.x + dx * along + nx * (look.side + across), z: a.z + dz * along + nz * (look.side + across) });
      const h = look.width / 2;
      quad(at(0, -h), at(length, -h), at(length, h), at(0, h), look.level);
      if (look.every > 0) {
        // A chevron every so often along the line, the first half way into the first gap.
        for (let s = look.every / 2 - carried; s < length; s += look.every) {
          if (s < 0.2) continue;
          const [tip, back, wing] = [look.width * 1.2, look.width * 0.6, look.width * 1.1];
          const [p, q, r] = [at(s + tip, 0), at(s - back, -wing), at(s - back, wing)];
          out.push(p.x, look.level + 0.01, p.z, q.x, look.level + 0.01, q.z, r.x, look.level + 0.01, r.z);
        }
        carried = (carried + length) % look.every;
      }
    }
  }
  return out;
}

/** The triangles of a disc at each point. */
function discsOf(points: readonly Point[], radius: number, level: number): number[] {
  const out: number[] = [];
  const sides = 12;
  for (const p of points) {
    for (let k = 0; k < sides; k++) {
      const [a, b] = [(k / sides) * Math.PI * 2, ((k + 1) / sides) * Math.PI * 2];
      out.push(p.x, level, p.z, p.x + Math.cos(a) * radius, level, p.z + Math.sin(a) * radius, p.x + Math.cos(b) * radius, level, p.z + Math.sin(b) * radius);
    }
  }
  return out;
}

/** The colour of the ways to the entrance. */
export const WAY_COLOUR = '#c77dff';

/** A line cut into dashes of a length, with a gap as long between them. Pure, so a test can hold it. */
export function dashesOf(line: readonly Point[], length: number): Point[][] {
  const out: Point[][] = [];
  let skip = false;
  let left = length;
  for (let k = 1; k < line.length; k++) {
    const [a, b] = [line[k - 1]!, line[k]!];
    const total = Math.hypot(b.x - a.x, b.z - a.z);
    let at = 0;
    while (at < total - 1e-9) {
      const step = Math.min(left, total - at);
      const [p, q] = [at / total, (at + step) / total];
      if (!skip) out.push([{ x: a.x + (b.x - a.x) * p, z: a.z + (b.z - a.z) * p }, { x: a.x + (b.x - a.x) * q, z: a.z + (b.z - a.z) * q }]);
      at += step;
      left -= step;
      if (left <= 1e-9) {
        skip = !skip;
        left = length;
      }
    }
  }
  return out;
}

const geometryOf = (positions: number[]) => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

/** What is drawn for each layer: its triangles by colour. */
function layerParts(overlay: RouteOverlay, id: LayerId): { colour: string; positions: number[] }[] {
  const plain = (lines: readonly (readonly Point[])[], look: Look) => ribbonsOf(lines, look);
  switch (id) {
    case 'traffic':
      return [{ colour: colourOf(id), positions: plain(overlay.traffic, { width: 0.3, side: 0, level: 0.5, every: 6 }) }];
    case 'bus':
      return [
        { colour: colourOf(id), positions: plain([overlay.bus.line], { width: 0.4, side: 0.35, level: 0.56, every: 4 }) },
        { colour: '#ff9aa0', positions: plain([overlay.bus.onward], { width: 0.3, side: 0.35, level: 0.56, every: 4 }) },
        { colour: '#ffffff', positions: discsOf(overlay.bus.via, 0.7, 0.62) },
        { colour: colourOf(id), positions: discsOf(overlay.bus.via, 0.5, 0.63).concat(discsOf([overlay.bus.stop], 0.8, 0.64)) },
      ];
    case 'taxi':
      return [
        { colour: colourOf(id), positions: plain([overlay.taxi.line], { width: 0.4, side: -0.35, level: 0.54, every: 4 }) },
        { colour: '#ffe88a', positions: plain([overlay.taxi.onward], { width: 0.3, side: -0.35, level: 0.54, every: 4 }) },
        { colour: colourOf(id), positions: discsOf([overlay.taxi.stop], 0.7, 0.62) },
      ];
    case 'vans':
      return [
        { colour: colourOf(id), positions: plain([overlay.vans.line], { width: 0.4, side: 0.7, level: 0.52, every: 4 }) },
        { colour: colourOf(id), positions: discsOf(overlay.vans.gates, 0.7, 0.6) },
        { colour: '#b9f3d9', positions: discsOf(overlay.vans.mouths, 0.5, 0.6) },
      ];
    case 'train':
      return [{ colour: colourOf(id), positions: plain([[overlay.train.from, overlay.train.to]], { width: Math.min(overlay.train.width, 1), side: 0, level: 0.5, every: 8 }) }];
    case 'lights':
      return [
        { colour: '#ff9f1c', positions: discsOf(overlay.lights, 0.9, 0.6) },
        { colour: '#e5383b', positions: discsOf(overlay.levels, 0.9, 0.6) },
      ];
    case 'people':
      return [
        { colour: colourOf(id), positions: plain([...overlay.people.loops, ...overlay.people.paths], { width: 0.2, side: 0, level: 0.5, every: 5 }) },
        // (The paths drawn by hand, each with a dot at its ends.)
        { colour: '#f72585', positions: plain(overlay.people.drawn, { width: 0.3, side: 0, level: 0.52, every: 4 }).concat(discsOf(overlay.people.drawn.flat(), 0.45, 0.6)) },
        // (The ways to the entrance: solid where they are paved, dashed where they are bare, #339.)
        { colour: WAY_COLOUR, positions: plain(overlay.people.ways.filter((w) => !w.bare).map((w) => w.line), { width: 0.4, side: 0, level: 0.53, every: 4 }) },
        { colour: WAY_COLOUR, positions: plain(overlay.people.ways.filter((w) => w.bare).flatMap((w) => dashesOf(w.line, 0.6)), { width: 0.3, side: 0, level: 0.53, every: 0 }) },
      ];
  }
}

/** The overlay on the town: one mesh for each colour of each layer that is on. Inside the group at street level. */
export function RouteOverlayView({ overlay, layers }: { overlay: RouteOverlay; layers: Readonly<Record<LayerId, boolean>> }) {
  const parts = useMemo(
    () => OVERLAY_LAYERS.map(({ id }) => ({ id, meshes: layerParts(overlay, id).filter((p) => p.positions.length > 0).map((p) => ({ colour: p.colour, geometry: geometryOf(p.positions) })) })),
    [overlay],
  );
  useEffect(() => () => parts.forEach((p) => p.meshes.forEach((m) => m.geometry.dispose())), [parts]);
  return (
    <>
      {parts.map(({ id, meshes }) =>
        layers[id]
          ? meshes.map((m, n) => (
              <mesh key={`${id}:${n}`} geometry={m.geometry} renderOrder={10}>
                <meshBasicMaterial color={m.colour} transparent opacity={0.85} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
              </mesh>
            ))
          : null,
      )}
    </>
  );
}
