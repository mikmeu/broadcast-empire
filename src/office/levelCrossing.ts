// Where a road crosses a railway on the ground (0.21.0, #288): when its barrier is closed. Pure, from the same sums as `trainAt` (city.ts), so
// the traffic, the sound and the drawing all agree with the train that is drawn. A crossing closes `RAILWAY.closed.before` seconds before the
// front of the train reaches it and opens `RAILWAY.closed.after` seconds after its tail has left it, whichever way the train goes.

import { RAILWAY } from '../config/balance';
import { CITY } from './assets';
import { trainLength } from './city';
import type { Layout } from './townLayout';

/** A stretch of time, in seconds on the clock the train runs on. */
export interface Span {
  from: number;
  to: number;
}

/** Where a crossing is on the line: the middle of the road along the track, and half the width of the road (kerb to kerb). */
export interface Crossed {
  x: number;
  half: number;
}

/** The time a barrier is closed for the train of a pass (see `trainAt`: they alternate direction, the first goes east). */
function spanOf(pass: number, at: Crossed, length: number, rail: Layout['railway']): Span {
  const { every, speed } = CITY.railway;
  const east = pass % 2 === 0;
  // How far the front has travelled when it reaches the road, and when the tail has left it.
  const near = east ? at.x - at.half - rail.from : rail.from + rail.length - (at.x + at.half);
  const far = east ? at.x + at.half - rail.from : rail.from + rail.length - (at.x - at.half);
  const start = pass * every;
  return { from: start + near / speed - RAILWAY.closed.before, to: start + (far + length) / speed + RAILWAY.closed.after };
}

/** The times a crossing is closed for the trains that pass between two moments, in order (some may overlap: the line is long, and the trains close). */
export function closures(from: number, to: number, at: Crossed, cars: readonly string[], layout: Layout): Span[] {
  const { every, speed } = CITY.railway;
  const length = trainLength(cars);
  const longest = (layout.railway.length + length) / speed + RAILWAY.closed.after;
  const out: Span[] = [];
  for (let pass = Math.floor((from - longest) / every); pass <= Math.floor((to + RAILWAY.closed.before) / every) + 1; pass++) {
    const span = spanOf(pass, at, length, layout.railway);
    if (span.to >= from && span.from <= to) out.push(span);
  }
  return out;
}

/** Whether the barrier of a crossing is closed `ahead` seconds from `time` (on the train's clock). */
export function closedAt(time: number, at: Crossed, cars: readonly string[], layout: Layout, ahead = 0): boolean {
  const t = time + ahead;
  return closures(t, t, at, cars, layout).some((span) => t >= span.from && t <= span.to);
}

/**
 * The longest a vehicle that comes to the barrier has to wait for it to open: the longest stretch it is closed for in a row, passes that
 * follow each other so closely that the barrier hardly opens between them included. Seconds.
 */
export function worstWait(at: Crossed, cars: readonly string[], layout: Layout): number {
  const { every } = CITY.railway;
  const spans = closures(0, 8 * every, at, cars, layout).sort((a, b) => a.from - b.from);
  let worst = 0;
  let run: Span | null = null;
  for (const span of spans) {
    // (Barely opening between two trains is not opening: a vehicle does not get across in under a second.)
    if (run && span.from <= run.to + 1) run = { from: run.from, to: Math.max(run.to, span.to) };
    else {
      if (run) worst = Math.max(worst, run.to - run.from);
      run = span;
    }
  }
  return Math.max(worst, run ? run.to - run.from : 0);
}

/**
 * The stretches of a ground track that are laid as track, between the crossings (`trackStretches`, for the drawing): from where the line begins to the
 * first road, between roads, and from the last to where it ends. Each is a pair of x. A road is crossed on a flat deck of its own.
 */
export function trackStretches(layout: Layout, crossings: readonly Crossed[]): Span[] {
  const { from, length } = layout.railway;
  const sorted = [...crossings].sort((a, b) => a.x - b.x);
  const out: Span[] = [];
  let at = from;
  for (const c of sorted) {
    if (c.x - c.half > at + 0.01) out.push({ from: at, to: c.x - c.half });
    at = Math.max(at, c.x + c.half);
  }
  if (from + length > at + 0.01) out.push({ from: at, to: from + length });
  return out;
}

/**
 * The bell: of the crossings that close, the one nearest the listener rings, once for each closing, however many close (a long town would otherwise ring ten times).
 * Returns the crossing's index in `crossings` and the moment it closed (the key of this ringing), or null when none is closed.
 */
export function bellAt(time: number, crossings: readonly Crossed[], listener: number, cars: readonly string[], layout: Layout): { crossing: number; since: number } | null {
  let best: { crossing: number; since: number; apart: number } | null = null;
  crossings.forEach((at, crossing) => {
    const span = closures(time, time, at, cars, layout).find((s) => time >= s.from && time <= s.to);
    if (!span) return;
    const apart = Math.abs(at.x - listener);
    if (!best || apart < best.apart) best = { crossing, since: span.from, apart };
  });
  return best ? { crossing: (best as { crossing: number }).crossing, since: (best as { since: number }).since } : null;
}
