// The layout of the cable drawing in the Cables window (0.22.0, #371). Pure geometry, so it can be tested without a
// browser: CableDiagram.tsx only draws what comes out of here. One band per floor with the roof on top; in a band the
// rooms are boxes in the order of the building, holding their points. Lines run at right angles: down from a point to
// a rail under the boxes, along it, and between floors up or down a shaft at the left, each line in a lane of its own.

import type { ChainKind, ChainLink, ChainPoint } from '../sim/control';

export const DIAGRAM = {
  pointW: 72,
  pointH: 34,
  roomPad: 6,
  roomLabel: 14,
  bandLabel: 16,
  bandGap: 4,
  rail: 6,
  lane: 6,
  margin: 8,
};

const KIND_LABEL: Record<ChainKind, string> = {
  camera: 'Camera',
  video: 'Video mixer',
  audio: 'Audio mixer',
  studio: 'Radio studio',
  mcr: 'Master control',
  antenna: 'Antenna',
  dish: 'Dish',
};

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagramBand extends Box {
  /** The floor, or null for the roof. */
  floor: number | null;
  label: string;
}

export interface DiagramRoom extends Box {
  id: string;
  name: string;
}

export interface DiagramPoint extends Box {
  id: string;
  kind: ChainKind;
  label: string;
  missing: boolean;
}

export interface DiagramLine {
  key: string;
  status: ChainLink['status'];
  /** The corners of the line, from the source to the target. */
  path: [number, number][];
}

export interface DiagramLayout {
  width: number;
  height: number;
  bands: DiagramBand[];
  rooms: DiagramRoom[];
  points: DiagramPoint[];
  lines: DiagramLine[];
}

/**
 * Lays the chain out. `order` is the rooms by id in the order of the building (it decides the order of the boxes in a band),
 * `bandLabel` names a floor (null: the roof) and `roomName` a room.
 */
export function layoutChain(
  chain: { points: ChainPoint[]; links: ChainLink[] },
  order: readonly string[],
  bandLabel: (floor: number | null) => string,
  roomName: (roomId: string) => string,
): DiagramLayout {
  const D = DIAGRAM;
  const pointById = new Map(chain.points.map((p) => [p.id, p]));
  const bandOf = (p: ChainPoint) => p.floor;

  // The bands: the roof first, then the floors from the top down.
  const floors = [...new Set(chain.points.map(bandOf))].sort((a, b) => (a === null ? -1 : b === null ? 1 : b - a));

  // Lanes: a line that changes band gets a lane of its own in the shaft; every line gets a rail in each band it touches.
  const lanes = new Map<string, number>();
  const rails = new Map<string, Map<number | null, number>>();
  const railsIn = new Map<number | null, number>();
  let lane = 0;
  for (const link of chain.links) {
    const a = pointById.get(link.from);
    const b = pointById.get(link.to);
    if (!a || !b) continue;
    const key = `${link.from}>${link.to}`;
    if (bandOf(a) !== bandOf(b)) lanes.set(key, lane++);
    const mine = new Map<number | null, number>();
    for (const f of new Set([bandOf(a), bandOf(b)])) {
      mine.set(f, railsIn.get(f) ?? 0);
      railsIn.set(f, (railsIn.get(f) ?? 0) + 1);
    }
    rails.set(key, mine);
  }
  const shaft = lane > 0 ? lane * D.lane + D.margin : 0;
  const left = D.margin + shaft;

  const bands: DiagramBand[] = [];
  const rooms: DiagramRoom[] = [];
  const points: DiagramPoint[] = [];
  const pointBoxes = new Map<string, DiagramPoint>();
  const roomH = D.roomLabel + D.pointH + D.roomPad * 2;
  let y = D.margin;
  let width = left;
  const railTop = new Map<number | null, number>();

  for (const floor of floors) {
    const inBand = chain.points.filter((p) => bandOf(p) === floor);
    const roomIds = [...new Set(inBand.map((p) => p.room))].sort((a, b) => (a === null ? -1 : b === null ? 1 : order.indexOf(a) - order.indexOf(b)));
    const bandTop = y;
    const boxTop = bandTop + D.bandLabel;
    let x = left + D.roomPad;
    for (const id of roomIds) {
      const mine = inBand.filter((p) => p.room === id);
      const w = mine.length * D.pointW + D.roomPad * (mine.length + 1);
      rooms.push({ id: id ?? 'roof', name: id === null ? '' : roomName(id), x, y: boxTop, w, h: roomH });
      mine.forEach((p, n) => {
        const box: DiagramPoint = {
          id: p.id,
          kind: p.kind,
          label: p.missing ? `${KIND_LABEL[p.kind]} (missing)` : KIND_LABEL[p.kind],
          missing: p.missing,
          x: x + D.roomPad + n * (D.pointW + D.roomPad),
          y: boxTop + D.roomLabel + D.roomPad,
          w: D.pointW,
          h: D.pointH,
        };
        points.push(box);
        pointBoxes.set(p.id, box);
      });
      x += w + D.roomPad;
    }
    width = Math.max(width, x);
    railTop.set(floor, boxTop + roomH + D.rail);
    const h = D.bandLabel + roomH + D.rail * ((railsIn.get(floor) ?? 0) + 1);
    bands.push({ floor, label: bandLabel(floor), x: D.margin, y: bandTop, w: 0, h });
    y = bandTop + h + D.bandGap;
  }
  width += D.margin;
  for (const band of bands) band.w = width - D.margin * 2;

  const lines: DiagramLine[] = [];
  for (const link of chain.links) {
    const a = pointBoxes.get(link.from);
    const b = pointBoxes.get(link.to);
    const pa = pointById.get(link.from);
    const pb = pointById.get(link.to);
    if (!a || !b || !pa || !pb) continue;
    const key = `${link.from}>${link.to}`;
    const railY = (floor: number | null) => railTop.get(floor)! + rails.get(key)!.get(floor)! * D.rail;
    const ax = a.x + a.w / 2;
    const bx = b.x + b.w / 2;
    const path: [number, number][] = [[ax, a.y + a.h]];
    if (bandOf(pa) === bandOf(pb)) {
      const ry = railY(bandOf(pa));
      path.push([ax, ry], [bx, ry]);
    } else {
      const sx = D.margin + lanes.get(key)! * D.lane + D.lane / 2;
      path.push([ax, railY(bandOf(pa))], [sx, railY(bandOf(pa))], [sx, railY(bandOf(pb))], [bx, railY(bandOf(pb))]);
    }
    path.push([bx, b.y + b.h]);
    lines.push({ key, status: link.status, path });
  }
  return { width, height: y + D.margin, bands, rooms, points, lines };
}
