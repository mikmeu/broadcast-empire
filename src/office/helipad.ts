// The helipad on every roof (0.22.0, #395): a square of the roof that is left free, drawn whether the company owns a
// helicopter or not. It stands on a wing of the building, clear of the housings of the stairs and the lifts, the
// antenna, the dish and the units of the air conditioning. Pure: the roof scene and the tests both ask it.

import { coreOf, type Building, type Rect } from '../config/office';

/** Where the antenna and the dish stand on the roof, across the building from front to back. */
export const ANTENNA_Z = 3.5;
export const DISH_Z = 5.5;

/** The units of the air conditioning on a roof, where they stand (x across, z deep) and how big they are. The ones too near the east end are left out. */
export const AIR_CONDITIONING: readonly (readonly [number, number])[] = [[3, 2], [5.5, 2], [12, 8.6]];
export const AIR_CONDITIONING_SIZE = { w: 1.6, h: 1.1 };

export const airConditioningOf = (building: Building) => AIR_CONDITIONING.filter(([x]) => x < building.w - 2);

/** The sizes of pad tried in turn, in tiles: the first that fits is used. */
export const HELIPAD_SIZES: readonly number[] = [4, 3.5, 3, 2.5];

export interface HelipadSpot {
  /** The middle of the pad, in tiles on the roof. */
  x: number;
  z: number;
  /** Its side, in tiles. */
  size: number;
}

const around = (cx: number, cz: number, w: number, h: number): Rect => ({ x: cx - w / 2, y: cz - h / 2, w, h });

/** What stands on a roof and has to be kept clear, with the room each needs round it. */
function obstacles(building: Building): { rect: Rect; room: number }[] {
  const { stairs, lifts } = coreOf(building);
  return [
    // The housings, with room to walk to the door onto the roof.
    { rect: stairs, room: 1.5 },
    { rect: lifts, room: 1 },
    { rect: around(building.w - 4, ANTENNA_Z, 1.8, 1.8), room: 0.8 },
    { rect: around(building.w - 10, DISH_Z, 2.2, 2.2), room: 0.8 },
    ...airConditioningOf(building).map(([x, z]) => ({ rect: around(x, z, AIR_CONDITIONING_SIZE.w, AIR_CONDITIONING_SIZE.h), room: 0.6 })),
  ];
}

/** How far apart two rectangles are (0 if they touch or overlap). */
function gap(a: Rect, b: Rect): number {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.hypot(dx, dy);
}

/**
 * Where the helipad goes on a roof: the biggest square of `HELIPAD_SIZES` that fits wholly in one wing, a tile in from
 * the wall, with the room each obstacle needs round it, and of those the one with the most free ground round it.
 * Null only for a building with no room for the smallest pad.
 */
export function helipadSpot(building: Building): HelipadSpot | null {
  const blocks = obstacles(building);
  for (const size of HELIPAD_SIZES) {
    let best: { spot: HelipadSpot; free: number } | null = null;
    for (const wing of building.wings) {
      const inner = { x: wing.x + 1, y: wing.y + 1, w: wing.w - 2, h: wing.h - 2 };
      for (let x = inner.x + size / 2; x <= inner.x + inner.w - size / 2 + 1e-9; x += 0.5) {
        for (let z = inner.y + size / 2; z <= inner.y + inner.h - size / 2 + 1e-9; z += 0.5) {
          const pad = around(x, z, size, size);
          // The pad must lie in the wing (not astride a courtyard) and clear of everything with its room.
          let free = 3;
          for (const { rect, room } of blocks) free = Math.min(free, gap(pad, rect) - room);
          if (free < 0) continue;
          // Of the spots that fit, the one with most free ground round it; the first found on a tie, so the answer is the same each time.
          if (!best || free > best.free + 1e-9) best = { spot: { x, z, size }, free };
        }
      }
    }
    if (best) return best.spot;
  }
  return null;
}

/** How high the helicopter flies above the roof, in tiles. */
export const FLIGHT_HEIGHT = 11;
/** The share of a flight spent climbing from the pad, and again coming down to it. */
const CLIMB = 0.07;
/** How many times it circles the town in each flight. */
const LAPS = 2;

export interface FlightAt {
  /** On the roof, in tiles. */
  x: number;
  y: number;
  z: number;
  /** The way the nose points, about the vertical axis (nose to +z at 0). */
  yaw: number;
  /** Off the pad: the rotors turn, and the sound plays. */
  airborne: boolean;
}

/** The middle of the roof and the radius of the circle the helicopter flies round it. */
export function circuitOf(building: Building): { x: number; z: number; radius: number } {
  const left = Math.min(...building.wings.map((r) => r.x));
  const right = Math.max(...building.wings.map((r) => r.x + r.w));
  const top = Math.min(...building.wings.map((r) => r.y));
  const bottom = Math.max(...building.wings.map((r) => r.y + r.h));
  return { x: (left + right) / 2, z: (top + bottom) / 2, radius: Math.max(right - left, bottom - top) * 0.55 + 6 };
}

const ease = (s: number) => s * s * (3 - 2 * s);

/** Where the helicopter is at an hour of the day: standing on the pad outside the `windows` of its flights, circling over the town in them. */
export function flightAt(building: Building, pad: HelipadSpot, windows: readonly (readonly [number, number])[], hour: number): FlightAt {
  const window = windows.find(([from, to]) => hour >= from && hour <= to);
  const parked: FlightAt = { x: pad.x, y: 0, z: pad.z, yaw: 0, airborne: false };
  if (!window) return parked;
  const { x, z, radius } = circuitOf(building);
  const [from, to] = window;
  const orbit = (angle: number) => ({ x: x + Math.sin(angle) * radius, z: z + Math.cos(angle) * radius });
  const start = Math.atan2(pad.x - x, pad.z - z);
  const at = (p: number): { x: number; y: number; z: number } => {
    if (p < CLIMB || p > 1 - CLIMB) {
      const s = ease(Math.min(p, 1 - p) / CLIMB);
      const o = orbit(start + (p < CLIMB ? 0 : LAPS * Math.PI * 2));
      return { x: pad.x + (o.x - pad.x) * s, y: FLIGHT_HEIGHT * s, z: pad.z + (o.z - pad.z) * s };
    }
    return { ...orbit(start + ((p - CLIMB) / (1 - 2 * CLIMB)) * LAPS * Math.PI * 2), y: FLIGHT_HEIGHT };
  };
  const p = Math.min(1, Math.max(0, (hour - from) / (to - from)));
  const here = at(p);
  const ahead = at(Math.min(1, p + 0.004));
  const yaw = Math.hypot(ahead.x - here.x, ahead.z - here.z) > 1e-6 ? Math.atan2(ahead.x - here.x, ahead.z - here.z) : 0;
  return { ...here, yaw, airborne: here.y > 0.05 };
}
