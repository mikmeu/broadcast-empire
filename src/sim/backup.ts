// A host's back-up (0.21.0, #352): when a host is ill, the host they named presents their shows as well as their own, at their own
// skill and fame, for the first LIFE.backup.maxDays days of the spell. A temp the player hired wins over the back-up. See LIFE.backup.

import { LIFE } from '../config/balance';
import { airings } from './deals';
import type { Employee, GameState, Id, Show } from './state';
import { awayWithoutTemp, isAway } from './teams';

const person = (state: Pick<GameState, 'employees'>, id: Id | null | undefined) => (id ? state.employees.find((e) => e.id === id) : undefined);

/** The slots a host's shows are on the air in, on your channels and sold. */
function slotsOfHost(state: GameState, hostId: Id): Set<number> {
  const mine = new Set(state.shows.filter((s) => s.hostId === hostId).map((s) => s.id));
  return new Set(airings(state).filter((a) => mine.has(a.showId)).map((a) => a.slot));
}

/** Whether this host's illness is one a back-up covers: sickness (not leave), no temp, in the first days of the spell. */
function coverable(state: GameState, host: Employee): boolean {
  const away = host.away;
  return !!away && away.reason === 'sick' && awayWithoutTemp(state, host) && state.day - away.from < LIFE.backup.maxDays;
}

/** Why the back-up of an ill host cannot step in today, or null if they can (leaving aside another host they may cover first). */
export function backupBlocker(state: GameState, host: Employee): string | null {
  const backup = person(state, host.backupId);
  if (!backup || backup.role !== 'host') return 'has no back-up';
  if (isAway(state, backup)) return `${backup.name} is away too`;
  if (backup.trainingUntil != null) return `${backup.name} is on a course`;
  if (backup.talentUntil != null) return `${backup.name} is in the talent programme`;
  if (sameSlot(state, host, backup)) return `${backup.name} is on the air at the same time`;
  return null;
}

/** Whether two hosts have shows on the air in the same slot: one cannot stand in for the other then. */
export function sameSlot(state: GameState, a: Employee, b: Employee): boolean {
  const theirs = slotsOfHost(state, b.id);
  return [...slotsOfHost(state, a.id)].some((slot) => theirs.has(slot));
}

/**
 * The back-up who presents an ill host's shows today, or null. The host fell ill with no temp, within the first days of the spell,
 * and the back-up is at work and free in the same slots. A back-up serves one host a day: the one who fell ill first.
 */
export function standInFor(state: GameState, host: Employee): Employee | null {
  if (!host.backupId || !coverable(state, host) || backupBlocker(state, host) !== null) return null;
  const rivals = state.employees.filter((h) => h.backupId === host.backupId && h.role === 'host' && h.id !== host.id && coverable(state, h) && backupBlocker(state, h) === null);
  const first = (a: Employee, b: Employee) => a.away!.from - b.away!.from || state.employees.indexOf(a) - state.employees.indexOf(b);
  if (rivals.some((h) => first(h, host) < 0)) return null;
  return person(state, host.backupId) ?? null;
}

/** Whoever presents a show today: the back-up of an ill host, otherwise the show's own host (null if it has none). Costs nothing on a normal day. */
export function presenterOf(state: GameState, show: Show): Employee | undefined {
  const host = person(state, show.hostId);
  if (!host || !host.backupId || !host.away) return host;
  return standInFor(state, host) ?? host;
}

/** Every ill host a back-up stands in for today, with the one who does. */
export function coverToday(state: GameState): { host: Employee; backup: Employee }[] {
  return state.employees.flatMap((host) => {
    const backup = host.role === 'host' && host.backupId && host.away && slotsOfHost(state, host.id).size > 0 ? standInFor(state, host) : null;
    return backup ? [{ host, backup }] : [];
  });
}

/** Daily: whoever stood in is a little more tired. */
export function tireBackups(draft: GameState): void {
  for (const { backup } of coverToday(draft)) backup.morale = Math.max(0, backup.morale - LIFE.backup.morale);
}
