// Reads a town drawing (design/towns/*.svg, as Illustrator exports it) into a
// table of whole tiles. Pure: the script (scripts/town-maps.ts) and the test do
// the reading of files.
//
// The drawing is 10 px a tile. It is mirrored left to right, and (0, 0) is the
// north-west corner of the U (the north wing and the spine) after mirroring.
// North is the top of the drawing. Kinds go by fill colour, not class name:
// Illustrator renumbers the classes on every export.

import { toMapFile, type Direction, type MapFile, type TileBox, type TileLane, type TilePoint, type TownMap } from '../mods/mapFile';

export const PX_PER_TILE = 10;
/** An edge further than this from the tile grid is reported. */
export const OFF_GRID_PX = 2;

type Kind = 'building' | 'alley' | 'green' | 'wing' | 'reception' | 'parking' | 'train' | 'water' | 'beach';

const KIND_BY_FILL: Record<string, Kind> = {
  '#3fc6ff': 'water',
  '#fffb15': 'beach',
  '#999': 'building',
  '#ccc': 'alley',
  lime: 'green',
  red: 'wing',
  '#fbb03b': 'reception',
  '#f0f': 'parking',
  '#42210b': 'train',
};

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** The capture groups of a match, empty where a group did not take part. */
function groups(found: RegExpMatchArray, count: number): string[] {
  return Array.from({ length: count }, (_, i) => found[i + 1] ?? '');
}

function numbers(s: string): number[] {
  return (s.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
}

function parseTransform(s: string | undefined): Matrix {
  let m = IDENTITY;
  if (!s) return m;
  for (const found of s.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const [name, args] = groups(found, 2);
    const n = numbers(args!);
    const n0 = n[0] ?? 0;
    let t: Matrix;
    if (name === 'translate') t = [1, 0, 0, 1, n0, n[1] ?? 0];
    else if (name === 'scale') t = [n0, 0, 0, n[1] ?? n0, 0, 0];
    else if (name === 'rotate') {
      const a = (n0 * Math.PI) / 180;
      t = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
    } else if (name === 'matrix') t = n as Matrix;
    else throw new Error(`Unknown transform "${name}" in "${s}"`);
    m = multiply(m, t);
  }
  return m;
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function attributes(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const found of s.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    const [k, v] = groups(found, 2);
    out[k!] = v!;
  }
  return out;
}

/** Class name to fill colour, from the <style> block. */
function fills(svg: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const found of svg.matchAll(/((?:\.[\w-]+\s*,?\s*)+)\{([^}]*)\}/g)) {
    const [selectors, body] = groups(found, 2);
    const fill = body!.match(/fill:\s*([^;\s]+)/)?.[1];
    if (!fill) continue;
    for (const cls of selectors!.matchAll(/\.([\w-]+)/g)) out[cls[1]!] = fill.toLowerCase();
  }
  return out;
}

interface PxBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Text {
  words: string;
  x: number;
  y: number;
  /** Rotation of the text, a multiple of 90, in degrees (clockwise on screen). */
  angle: number;
  /** The middle of the glyphs, for ">>>>". */
  mid: [number, number];
}

function decode(s: string): string {
  return s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

function readTexts(svg: string): Text[] {
  const out: Text[] = [];
  for (const found of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const [attrs, inner] = groups(found, 2);
    const m = parseTransform(attributes(attrs!).transform);
    const words = [...inner!.matchAll(/<tspan\b[^>]*>([^<]*)<\/tspan>/g)].map((t) => decode(t[1] ?? '')).join('');
    const [x, y] = apply(m, 0, 0);
    const raw = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    const angle = ((Math.round(raw / 90) * 90 + 540) % 360) - 180; // -90, 0, 90 or 180
    out.push({ words: words.trim(), x, y, angle, mid: apply(m, 11, -3.5) });
  }
  return out;
}

const DIRECTION_BY_ANGLE: Record<number, Direction> = { 0: 'east', 180: 'west', [-180]: 'west', 90: 'south', [-90]: 'north' };
const MIRRORED: Record<Direction, Direction> = { north: 'north', south: 'south', east: 'west', west: 'east', both: 'both' };
/** An arrow is on a lane if it is no further than this from it. */
const ARROW_REACH_PX = 60;

function distance(b: PxBox, [x, y]: [number, number]): number {
  return Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
}

function inside(b: PxBox, [x, y]: [number, number]): boolean {
  return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
}

export function readTownMap(svg: string): { map: TownMap; warnings: string[] } {
  const viewBox = numbers(svg.match(/viewBox="([^"]*)"/)?.[1] ?? '');
  if (viewBox.length !== 4) throw new Error('The drawing has no viewBox');
  const width = (viewBox[0] ?? 0) + (viewBox[2] ?? 0);
  const fillOf = fills(svg);

  // Every rect as a box in pixels, mirrored left to right.
  const rects: { kind: Kind | 'lane'; box: PxBox }[] = [];
  for (const found of svg.matchAll(/<rect\b([^>]*?)\/?>/g)) {
    const a = attributes(groups(found, 1)[0]!);
    const m = parseTransform(a.transform);
    const x = Number(a.x ?? 0);
    const y = Number(a.y ?? 0);
    const corners = [
      apply(m, x, y),
      apply(m, x + Number(a.width), y),
      apply(m, x, y + Number(a.height)),
      apply(m, x + Number(a.width), y + Number(a.height)),
    ];
    const xs = corners.map((c) => width - c[0]);
    const ys = corners.map((c) => c[1]);
    const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    if (!a.class) {
      rects.push({ kind: 'lane', box });
      continue;
    }
    const fill = fillOf[a.class.trim()];
    const kind = fill ? KIND_BY_FILL[fill] : undefined;
    if (!kind) throw new Error(`A rect (${a.class}) has a colour the reader does not know: ${fill ?? 'no fill'}`);
    rects.push({ kind, box });
  }

  const texts = readTexts(svg);
  // A grey rect with the word MOUNTAINS in it is mountains and not an alleyway (#218).
  const signs = texts.filter((t) => t.words.replace(/\s+/g, '') === 'MOUNTAINS').map((t) => [width - t.x, t.y] as [number, number]);
  const isMountains = (r: { kind: Kind | 'lane'; box: PxBox }) => r.kind === 'alley' && signs.some((at) => inside(r.box, at));
  const wings = rects.filter((r) => r.kind === 'wing').map((r) => r.box);
  if (wings.length === 0) throw new Error('The drawing has no U (red rects)');
  const origin = {
    x: Math.min(...wings.map((b) => b.x0)),
    y: Math.min(...wings.map((b) => b.y0)),
  };
  const u: PxBox = {
    x0: origin.x,
    y0: origin.y,
    x1: Math.max(...wings.map((b) => b.x1)),
    y1: Math.max(...wings.map((b) => b.y1)),
  };

  const warnings: string[] = [];
  const edge = (px: number, from: number, what: string): number => {
    const tiles = (px - from) / PX_PER_TILE;
    const rounded = Math.round(tiles);
    if (Math.abs(tiles - rounded) * PX_PER_TILE > OFF_GRID_PX) {
      warnings.push(`${what}: ${tiles.toFixed(2)} tiles, rounded to ${rounded}`);
    }
    return rounded;
  };
  const toBox = (b: PxBox, what: string): TileBox => {
    const x = edge(b.x0, origin.x, `${what} west edge`);
    const y = edge(b.y0, origin.y, `${what} north edge`);
    return {
      x,
      y,
      w: edge(b.x1, origin.x, `${what} east edge`) - x,
      h: edge(b.y1, origin.y, `${what} south edge`) - y,
    };
  };
  const toPoint = (x: number, y: number): TilePoint => ({
    x: Math.round((x - origin.x) / PX_PER_TILE),
    y: Math.round((y - origin.y) / PX_PER_TILE),
  });

  // The arrows were drawn on the unmirrored drawing: mirror their points too.
  const arrows = texts
    .filter((t) => /^>+$/.test(t.words))
    .map((t) => {
      const dir = DIRECTION_BY_ANGLE[t.angle];
      if (!dir) throw new Error(`An arrow (>>>>) is turned ${t.angle} degrees, not a multiple of 90`);
      return { at: [width - t.mid[0], t.mid[1]] as [number, number], dir: MIRRORED[dir] };
    });

  const lanes: TileLane[] = [];
  for (const r of rects.filter((r) => r.kind === 'lane')) {
    // The arrow on the lane gives its direction; a lane without one is a two-way lane.
    const along = r.box.x1 - r.box.x0 > r.box.y1 - r.box.y0 ? ['east', 'west'] : ['north', 'south'];
    let best: (typeof arrows)[number] | undefined;
    for (const arrow of arrows) {
      if (!along.includes(arrow.dir) || distance(r.box, arrow.at) > ARROW_REACH_PX) continue;
      if (!best || distance(r.box, arrow.at) < distance(r.box, best.at)) best = arrow;
    }
    lanes.push({ ...toBox(r.box, `lane ${lanes.length + 1}`), dir: best?.dir ?? 'both' });
  }

  const of = (kind: Kind) => rects.filter((r) => r.kind === kind).map((r) => r.box);
  const boxes = (kind: string, list: PxBox[]) => list.map((b, i) => toBox(b, `${kind} ${i + 1}`));
  const centre = (b: PxBox): [number, number] => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  const inU = (b: PxBox) => inside(u, centre(b));

  const fountainText = texts.find((t) => t.words.replace(/\s+/g, '') === 'GREENWITHAFOUNTAIN');
  const fountainAt: [number, number] | null = fountainText ? [width - fountainText.x, fountainText.y] : null;

  let busStop: TilePoint | null = null;
  // The words are one text, or "BUS" with "STOP" on the line below it (#218).
  const stop =
    texts.find((t) => t.words.replace(/\s+/g, '') === 'BUSSTOP') ??
    texts.find((t) => t.words === 'BUS' && texts.some((u) => u.words === 'STOP' && Math.abs(u.x - t.x) < 15 && u.y > t.y && u.y - t.y < 20));
  if (stop) {
    const at: [number, number] = [width - stop.x, stop.y];
    const lane = rects
      .filter((r) => r.kind === 'lane')
      .sort((p, q) => distance(p.box, at) - distance(q.box, at))[0];
    if (!lane) throw new Error('The bus stop has no lane to stand beside');
    // The nearest point of the lane's box is on its kerb.
    busStop = toPoint(
      Math.min(Math.max(at[0], lane.box.x0), lane.box.x1),
      Math.min(Math.max(at[1], lane.box.y0), lane.box.y1),
    );
  }

  const parking = of('parking');
  const greens = of('green');
  const reception = of('reception')[0];
  const train = of('train')[0];
  const map: TownMap = {
    lanes,
    buildings: boxes('building', of('building')),
    alleys: boxes('alley', rects.filter((r) => r.kind === 'alley' && !isMountains(r)).map((r) => r.box)),
    mountains: boxes('mountains', rects.filter(isMountains).map((r) => r.box)),
    greens: boxes('green', greens.filter((b) => !inU(b))),
    parking: boxes('parking', parking.filter((b) => !inU(b))),
    wings: boxes('wing', wings),
    courtyard: {
      parking: boxes('courtyard parking', parking.filter(inU)),
      green: boxes('courtyard green', greens.filter(inU)),
      fountain: fountainAt ? toPoint(...fountainAt) : null,
    },
    reception: reception ? toBox(reception, 'reception') : null,
    busStop,
    train: train ? toBox(train, 'train') : null,
    water: boxes('water', of('water')),
    beach: boxes('beach', of('beach')),
    concrete: [],
    trees: [],
    lamps: [],
    placed: [],
  };
  return { map, warnings };
}

// ---- The map files ----

/**
 * The text of the map files (src/config/maps/<id>.json), by id, with their `map` read again from the
 * drawings by file name (without .svg). The settings are kept from `current`: the drawing has none.
 */
export function mapFilesFrom(svgs: Record<string, string>, current: Record<string, MapFile>): { files: Record<string, string>; warnings: string[] } {
  const files: Record<string, string> = {};
  const warnings: string[] = [];
  for (const id of Object.keys(svgs).sort()) {
    const kept = current[id];
    if (!kept) throw new Error(`There is no src/config/maps/${id}.json to keep the settings of: add one with the train, the traffic and the floors.`);
    const read = readTownMap(svgs[id] ?? '');
    files[id] = toMapFile({ ...kept, map: read.map });
    warnings.push(...read.warnings.map((w) => `${id}: ${w}`));
  }
  return { files, warnings };
}
