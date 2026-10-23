// People stepping aside for each other (0.20.0), in the street and in the
// office. Pure: two people who come face to face each move a little to their
// own right until they have passed, then back. It is only how they are drawn;
// where they are going and what they do does not change.

/** Someone on foot: where they are and the way they face, as an angle around the vertical (0 faces +z, a quarter turn faces +x). */
export interface Foot {
  x: number;
  z: number;
  angle: number;
}

export const ASIDE = {
  /** How far ahead, in tiles, someone coming the other way makes a person step aside. */
  reach: 0.8,
  /** How far to the side they go at most, in tiles. */
  offset: 0.25,
  /** How far across the way of someone else's line a person is still in the way, in tiles. */
  across: 0.5,
  /** How far, in tiles, someone has to be past to be left alone. */
  past: 0.4,
};

/** The direction a person faces and the one to their right, as directions on the ground. */
const headingOf = (angle: number) => ({ x: Math.sin(angle), z: Math.cos(angle) });
const rightOf = (angle: number) => ({ x: -Math.cos(angle), z: Math.sin(angle) });

/**
 * How far to their right someone steps aside, in tiles, from where they are
 * among the others: up to `ASIDE.offset` for someone who comes the other way
 * within reach, and nothing for anyone else.
 */
export function asideFor(me: Foot, others: readonly Foot[]): number {
  const heading = headingOf(me.angle);
  const right = rightOf(me.angle);
  let aside = 0;
  for (const other of others) {
    const [dx, dz] = [other.x - me.x, other.z - me.z];
    const [there, across] = [dx * heading.x + dz * heading.z, dx * right.x + dz * right.z];
    // Facing each other, or nearly.
    const meets = headingOf(other.angle).x * heading.x + headingOf(other.angle).z * heading.z < -0.5;
    if (!meets || there > ASIDE.reach || there < -ASIDE.past || Math.abs(across) > ASIDE.across) continue;
    // Gently while they are still coming, fully once they are close.
    aside = Math.max(aside, ASIDE.offset * Math.min(1, (ASIDE.reach - there) / (ASIDE.reach / 2)));
  }
  return aside;
}

/** Where someone is drawn when they are `aside` tiles to their right of where they are. */
export function placedAside(me: Foot, aside: number): { x: number; z: number } {
  const right = rightOf(me.angle);
  return { x: me.x + right.x * aside, z: me.z + right.z * aside };
}

/** The offset of someone, eased towards where it should be: it grows and fades over a moment, not in a jump. `seconds` is the time since the last step. */
export const easeAside = (now: number, target: number, seconds: number) => now + (target - now) * Math.min(1, seconds * 8);
