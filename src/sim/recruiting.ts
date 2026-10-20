// Recruiters (0.17.0): they bring better candidates into the hiring pool each
// month, and find someone in the place of a host who works out their notice.
// See RECRUITING in balance.ts.

import { POACH, RECRUITING } from '../config/balance';
import { formatDate } from './calendar';
import { hostAsking } from './economy';
import { personName } from './generate';
import type { Desks } from './office';
import { Rng } from './rng';
import { helperRate } from './upkeep';
import { addMessage, type Candidate, type Employee, type GameState } from './state';

/** The recruiters at a desk, the most productive first; no more than RECRUITING.max of them count. */
function workingRecruiters(state: GameState, desked: Desks): Employee[] {
  return state.employees
    .filter((e) => e.role === 'recruiter' && desked.has(e.id))
    .sort((a, b) => helperRate(state, b, desked) - helperRate(state, a, desked))
    .slice(0, RECRUITING.max);
}

/** Whether a recruiter is at a desk today. */
export const hasRecruiter = (state: GameState, desked: Desks) => state.employees.some((e) => e.role === 'recruiter' && desked.has(e.id));

/** How many more candidates the recruiters bring into this month's pool: RECRUITING.extraEach for one of skill 50 in good spirits. */
export function recruitedCandidates(state: GameState, desked: Desks): number {
  return Math.round(workingRecruiters(state, desked).reduce((sum, e) => sum + RECRUITING.extraEach * helperRate(state, e, desked), 0));
}

/** The day of a leaving host's notice: 0 on the day they gave it. */
const noticeDay = (state: GameState, host: Employee) => state.day - (host.leaving!.on - POACH.noticeDays);

/** A host in the place of one who leaves: the same medium and specialties, about as good. From a stream of chance of its own, so nothing else in the game moves. */
export function findReplacement(state: GameState, host: Employee): Candidate {
  const rng = new Rng(seedOf(`${host.id}@${state.day}`));
  const { skillSpread } = RECRUITING;
  const skill = Math.max(1, Math.min(100, host.skill + rng.int(-skillSpread, skillSpread)));
  const fame = rng.int(0, Math.round(skill / 3));
  return {
    id: `${host.id}-r`,
    name: personName(rng),
    role: 'host',
    skill,
    salary: hostAsking(state, skill, fame),
    specialties: [...host.specialties],
    fame,
    department: null,
    foundFor: host.id,
  };
}

/** Daily: on day RECRUITING.replaceDays of a host's notice (or the first day after it that a recruiter is at a desk), a recruiter finds someone in their place. Once per leaving host. */
export function findReplacements(draft: GameState, desked: Desks): void {
  if (!hasRecruiter(draft, desked)) return;
  for (const host of draft.employees.filter((e) => e.role === 'host' && e.leaving && !e.leaving.found && noticeDay(draft, e) >= RECRUITING.replaceDays)) {
    host.leaving!.found = true;
    const found = findReplacement(draft, host);
    draft.candidates.push(found);
    addMessage(
      draft,
      'good',
      `Your recruiter has found ${found.name} in the place of ${host.name}: a host of skill ${found.skill}, asking €${found.salary.toLocaleString('en-IE')} a month. They stay in the hiring pool while ${host.name} works out the notice, until ${formatDate(host.leaving!.on - 1)}.`,
      undefined,
      'staff',
    );
  }
}

/** A 32-bit seed from a string (FNV-1a). */
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
