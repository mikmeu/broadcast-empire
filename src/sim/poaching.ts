// Host poaching (prompt.md section 10): rivals now and then make one of the
// player's famous hosts an offer, and the player can sign a rival's host.

import { POACH, PRESTIGE } from '../config/balance';
import { getGenre, hasHost, type GenreId } from '../config/genres';
import { formatDate } from './calendar';
import { prestigePull, salaryFor } from './economy';
import { personName, rivalStrength } from './generate';
import type { Rng } from './rng';
import { removeEmployee } from './staff';
import { addHeadline, addMessage, newId, type GameState, type PoachOffer, type Rival, type RivalChannel, type RivalShow } from './state';

const formatEuro = (n: number) => `€${Math.round(n).toLocaleString('en-IE')}`;
const round50 = (n: number) => Math.round(n / 50) * 50;

/** The medium a host works in (hosts specialize in genres of one medium). */
const hostMedium = (specialties: readonly GenreId[]) => (specialties[0] ? getGenre(specialties[0]).medium : 'radio');

// --- Rivals poaching the player's hosts ---

/** Monthly: a rival may offer one of the player's famous hosts more money. One offer at a time. */
export function rivalPoachAttempt(draft: GameState, rng: Rng): void {
  const roll = rng.next();
  // Hosts are harder to lure away from a company with prestige.
  if (draft.poachOffers.length > 0 || roll >= POACH.monthlyChance * (1 - PRESTIGE.poachCut * prestigePull(draft))) return;
  const targets = draft.employees.filter((e) => e.role === 'host' && e.fame >= POACH.minFame && !e.leaving);
  if (targets.length === 0) return;
  const host = rng.pick(targets);
  const rivals = draft.rivals.filter((r) => r.channels.some((c) => c.medium === hostMedium(host.specialties)));
  if (rivals.length === 0) return;
  const rival = rng.pick(rivals);
  const premium = POACH.premium.min + rng.next() * (POACH.premium.max - POACH.premium.min);
  const salary = round50(salaryFor('host', host.skill, host.fame, draft) * premium);
  // A host who is already paid well above the going rate isn't worth the rival's trouble.
  if (salary < host.salary * (1 + POACH.minRaise)) return;
  const offer: PoachOffer = { id: newId(draft, 'po'), hostId: host.id, rivalId: rival.id, salary, expiresOn: draft.day + POACH.answerDays };
  draft.poachOffers.push(offer);
  addHeadline(draft, `Rumour has it that ${rival.name} is courting ${host.name}.`);
  addMessage(
    draft,
    'danger',
    `${rival.name} has offered ${host.name} ${formatEuro(offer.salary)} a month. Match it on the Staff screen within ${POACH.answerDays} days, or they leave.`,
    undefined,
    'staff',
  );
}

/**
 * The host takes the rival's offer and works out their notice (0.14.0): they
 * present their shows as before until POACH.noticeDays have gone by, which
 * gives the player that long to find someone in their place.
 */
export function hostGivesNotice(draft: GameState, offer: PoachOffer): void {
  draft.poachOffers = draft.poachOffers.filter((o) => o.id !== offer.id);
  const host = draft.employees.find((e) => e.id === offer.hostId);
  const rival = draft.rivals.find((r) => r.id === offer.rivalId);
  if (!host || !rival) return;
  host.leaving = { on: draft.day + POACH.noticeDays, rivalId: rival.id };
  const shows = draft.shows.filter((s) => s.hostId === host.id).map((s) => `“${s.name}”`);
  const until = formatDate(host.leaving.on - 1);
  addHeadline(draft, `${host.name} signs with ${rival.name}.`);
  addMessage(
    draft,
    'danger',
    `${host.name} has signed with ${rival.name} and works out the month: ${shows.length > 0 ? `they present ${shows.join(' and ')} until ${until}` : `they are with you until ${until}`}. Hire a new host and give them the show before then.`,
    undefined,
    'staff',
  );
}

/** The host's notice is over: they leave, and the rival's weakest show of that medium with a host gets them. */
export function hostLeaves(draft: GameState, hostId: string): void {
  const host = draft.employees.find((e) => e.id === hostId);
  const rival = host?.leaving ? draft.rivals.find((r) => r.id === host.leaving!.rivalId) : undefined;
  if (!host) return;
  removeEmployee(draft, host.id);
  if (!rival) return;

  const shows = rival.channels.filter((c) => c.medium === hostMedium(host.specialties)).flatMap((c) => c.schedule).filter((s) => hasHost(getGenre(s.genre)));
  const show = shows.sort((a, b) => a.quality - b.quality)[0];
  if (show) {
    show.hostName = host.name;
    show.hostFame = Math.max(show.hostFame, Math.round(host.fame));
    show.quality = Math.min(1, show.quality * POACH.rivalGain);
  }
  addMessage(draft, 'danger', `${host.name} has left for ${rival.name}${show ? ` and now presents “${show.name}”` : ''}.${draft.shows.some((s) => s.hostId === null && hasHost(getGenre(s.genre))) ? ' A show of yours has no host now.' : ''}`, undefined, undefined, 'staff');
}

/** Daily: hosts whose offer wasn't matched in time give notice, and those whose notice is over leave. */
export function resolvePoachOffers(draft: GameState): void {
  for (const offer of draft.poachOffers.filter((o) => o.expiresOn <= draft.day)) hostGivesNotice(draft, offer);
  for (const host of draft.employees.filter((e) => e.leaving && e.leaving.on <= draft.day)) hostLeaves(draft, host.id);
}

// --- The player poaching rival hosts ---

/** A rival host's skill, read off the quality of their show. */
export function rivalHostSkill(show: RivalShow, state: Pick<GameState, 'difficulty' | 'day'>): number {
  const skill = (100 * show.quality) / rivalStrength(state);
  return Math.round(Math.max(POACH.skill.min, Math.min(POACH.skill.max, skill)));
}

export interface PoachTarget {
  rival: Rival;
  channel: RivalChannel;
  slot: number;
  show: RivalShow;
  skill: number;
  /** Monthly salary they ask for, and the one-off signing fee. */
  salary: number;
  fee: number;
}

/** Every rival host the player could sign, most famous first. */
export function poachTargets(state: GameState): PoachTarget[] {
  return state.rivals
    .flatMap((rival) =>
      rival.channels.flatMap((channel) =>
        channel.schedule.map((show, slot): PoachTarget => {
          const skill = rivalHostSkill(show, state);
          const salary = round50(salaryFor('host', skill, show.hostFame, state) * POACH.salaryPremium);
          return { rival, channel, slot, show, skill, salary, fee: salary * POACH.signingMonths };
        }),
      ),
    )
    .filter((t) => t.show.hostName !== '')
    .sort((a, b) => b.show.hostFame - a.show.hostFame || b.skill - a.skill);
}

/** Days until the player may sign another rival host (0 = now). */
export function poachCooldown(state: GameState): number {
  return state.lastPoachDay === null ? 0 : Math.max(0, state.lastPoachDay + POACH.cooldownDays - state.day);
}

/** The rival promotes an unknown to replace a host the player signed. */
export function replaceRivalHost(show: RivalShow, rng: Rng): void {
  show.hostName = personName(rng);
  show.hostFame = rng.int(0, 15);
  show.quality *= POACH.rivalLoss;
}
