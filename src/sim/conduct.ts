// The host who is unsafe to work with (0.22.0, #259): about once in a decade, for the company, one host does. The people
// around them lose morale, and their reality show is sued more often. You can fire them, or have a psychologist coach
// them. See PSYCHOLOGY in config/balance.ts. The roll comes from a stream of its own (see `lifeRng`), so the game's
// main stream does not move.

import { DAYS_PER_YEAR, LEGAL, PSYCHOLOGY } from '../config/balance';
import type { RegionId } from '../config/world';
import { formatDate } from './calendar';
import type { Desks } from './office';
import { lifeRng } from './life';
import { addHeadline, addMessage, type Employee, type GameState } from './state';
import { TEAMS } from './teams';

/** Whether a host is unsafe to work with today: they have turned and have not been coached yet. */
export const isUnsafe = (employee: Employee) => !!employee.conduct && !employee.conduct.cleared;

/** The host who is unsafe to work with today, if there is one. Only one at a time. */
export const unsafeHost = (state: Pick<GameState, 'employees'>): Employee | undefined => state.employees.find(isUnsafe);

/** Whether a psychologist is coaching this host today. */
export const isCoached = (employee: Employee) => isUnsafe(employee) && employee.conduct!.coachedUntil !== null;

/** The morale an unsafe host costs the hosts and the production team: PSYCHOLOGY.moralePenalty, half while they are coached. 0 when there is none. */
export function unsafePenalty(state: Pick<GameState, 'employees'>, employee: Pick<Employee, 'role'>): number {
  const host = unsafeHost(state);
  if (!host || !(TEAMS.hosts.roles.includes(employee.role) || TEAMS.production.roles.includes(employee.role))) return 0;
  return PSYCHOLOGY.moralePenalty * (isCoached(host) ? 0.5 : 1);
}

/** The psychologists who are at a desk and not coaching anyone. */
export function freePsychologists(state: GameState, desked: Desks): Employee[] {
  const busy = new Set(state.employees.flatMap((e) => (isCoached(e) && e.conduct!.coachId ? [e.conduct!.coachId] : [])));
  return state.employees.filter((e) => e.role === 'psychologist' && desked.has(e.id) && !busy.has(e.id));
}

/** Why a host cannot be coached today, or null if they can. */
export function coachBlocker(state: GameState, host: Employee, desked: Desks): string | null {
  if (!isUnsafe(host)) return `${host.name} needs no coaching.`;
  if (isCoached(host)) return `${host.name} is being coached until ${formatDate(host.conduct!.coachedUntil!)}.`;
  if (!state.employees.some((e) => e.role === 'psychologist')) return 'You need a psychologist.';
  if (freePsychologists(state, desked).length === 0) return 'Your psychologist has no workstation, or is coaching someone else.';
  return null;
}

/** Starts the coaching of a host by the first free psychologist. */
export function startCoaching(draft: GameState, host: Employee, desked: Desks): void {
  const psychologist = freePsychologists(draft, desked)[0]!;
  host.conduct = { ...host.conduct!, coachedUntil: draft.day + PSYCHOLOGY.coachDays, coachId: psychologist.id };
  addMessage(draft, 'info', `${psychologist.name} is coaching ${host.name} for ${PSYCHOLOGY.coachDays} days, until ${formatDate(host.conduct.coachedUntil!)}. ${host.name} stays on the air.`, undefined, 'staff', 'production', 'staffNews');
}

/** The daily chance that one host of the company turns unsafe. */
export const conductChance = () => 1 / (PSYCHOLOGY.everyYears * DAYS_PER_YEAR);

/** Daily, once the day has turned: a host turns unsafe, coaching ends, and the press hears of one who is left alone. */
export function conductEvents(draft: GameState): void {
  const current = unsafeHost(draft);
  if (current) return followUp(draft, current);
  const hosts = draft.employees.filter((e) => e.role === 'host' && !e.conduct && !e.leaving);
  if (hosts.length === 0) return;
  const rng = lifeRng(draft, 'company', 'conduct');
  if (rng.next() >= conductChance()) return;
  const host = hosts[Math.floor(rng.next() * hosts.length)]!;
  host.conduct = { since: draft.day, coachedUntil: null };
  addMessage(
    draft,
    'warning',
    `${host.name} has become hard to work with, and the people around them feel unsafe. The hosts and the production team are unhappier. You can let ${host.name} go, or have a psychologist coach them. It is on the Staff screen.`,
    undefined,
    'staff',
    'production',
    'staffNews',
  );
}

function followUp(draft: GameState, host: Employee): void {
  const conduct = host.conduct!;
  if (conduct.coachedUntil !== null) {
    if (!draft.employees.some((e) => e.id === conduct.coachId)) {
      conduct.coachedUntil = null;
      delete conduct.coachId;
      addMessage(draft, 'warning', `The coaching of ${host.name} has stopped: their psychologist has gone. ${host.name} is as hard to work with as before.`, undefined, 'staff', 'production', 'staffNews');
    } else if (draft.day >= conduct.coachedUntil) {
      host.conduct = { since: conduct.since, coachedUntil: null, cleared: true };
      addMessage(draft, 'good', `The coaching of ${host.name} is over. They are safe to work with now, and the studio is easier again.`, undefined, 'staff', 'production', 'staffNews');
    }
    return;
  }
  if (conduct.reported || draft.day - conduct.since < PSYCHOLOGY.reportDays) return;
  conduct.reported = true;
  addHeadline(draft, `The host ${host.name} is said to make the studio an unsafe place to work.`);
  const names: string[] = [];
  for (const channel of draft.channels) {
    if (!channel.schedule.some((id) => draft.shows.some((s) => s.id === id && s.hostId === host.id))) continue;
    names.push(channel.name);
    for (const [region, reputation] of Object.entries(channel.reputation) as [RegionId, number][]) channel.reputation[region] = Math.max(0, reputation - LEGAL.reputation);
  }
  addMessage(draft, 'danger', `The papers have heard that ${host.name} is hard to work with${names.length > 0 ? `, and the name of ${names.join(' and ')} has suffered` : ''}.`, undefined, 'staff', 'production', 'staffNews');
}
