// Host poaching (prompt.md section 10): rivals now and then make one of the
// player's famous hosts an offer, and the player can sign a rival's host.

import { MORALE, POACH, PRESTIGE } from '../config/balance';
import { getGenre, hasHost, type GenreId } from '../config/genres';
import { formatDate } from './calendar';
import { channelRegions } from './broadcast';
import { prestigePull, salaryFor } from './economy';
import { personName, rivalStrength } from './generate';
import { birthAt } from './life';
import { chargeRival } from './rivalMoney';
import { canAfford, rivalStance } from './rivals';
import type { Rng } from './rng';
import { removeEmployee } from './staff';
import { addHeadline, addMessage, newId, type GameState, type Id, type PoachOffer, type Rival, type RivalChannel, type RivalShow } from './state';

const formatEuro = (n: number) => `€${Math.round(n).toLocaleString('en-IE')}`;
const round50 = (n: number) => Math.round(n / 50) * 50;

/** The medium a host works in (hosts specialize in genres of one medium). */
const hostMedium = (specialties: readonly GenreId[]) => (specialties[0] ? getGenre(specialties[0]).medium : 'radio');

// --- Rivals poaching the player's hosts ---

/**
 * The listeners a host's shows take from this rival in the last weekly report:
 * the slots they hold on your channels of a medium where it has a channel in a
 * region you share. `top` is the show that takes most.
 */
function listenersTakenFrom(draft: GameState, rival: Rival, hostId: string): { heard: number; top: string } {
  const report = draft.weeklyReports[draft.weeklyReports.length - 1];
  let heard = 0;
  let top = { heard: 0, name: '' };
  if (!report) return { heard, top: '' };
  for (const channel of draft.channels) {
    const regions = channelRegions(draft, channel.id);
    if (!rival.channels.some((c) => c.medium === channel.medium && c.regionIds.some((r) => regions.includes(r)))) continue;
    const day = report.channels.find((c) => c.channelId === channel.id);
    channel.schedule.forEach((showId, slot) => {
      const show = showId ? draft.shows.find((s) => s.id === showId) : undefined;
      if (!show || show.hostId !== hostId) return;
      const listeners = day?.slots[slot]?.listeners ?? 0;
      heard += listeners;
      if (listeners > top.heard) top = { heard: listeners, name: show.name };
    });
  }
  return { heard, top: top.name };
}

/**
 * Monthly: a rival may offer one of the player's famous hosts more money. One offer at a time.
 * A rival that watches you and can pay the fee (0.23.0, #413) aims at the host whose shows take
 * most of its listeners, offers the top premium plus a signing fee, and tries up to twice as often.
 * Aimed offers draw no random numbers; the first draw is always the roll.
 */
export function rivalPoachAttempt(draft: GameState, rng: Rng): void {
  const roll = rng.next();
  const cut = 1 - PRESTIGE.poachCut * prestigePull(draft);
  if (draft.poachOffers.length > 0 || roll >= POACH.monthlyChance * 2 * cut) return;
  // A host whose offer you matched is left alone for a while, by every rival.
  const targets = draft.employees.filter((e) => e.role === 'host' && e.fame >= POACH.minFame && !e.leaving && (e.courtedOn == null || e.courtedOn + POACH.restDays <= draft.day));
  if (targets.length === 0) return;
  const aiming = draft.rivals
    .filter((r) => rivalStance(r) !== 'ignores' && canAfford(r, 0))
    .sort((a, b) => b.rivalry - a.rivalry || a.id.localeCompare(b.id));
  for (const rival of aiming) {
    if (roll >= POACH.monthlyChance * (1 + rival.rivalry) * cut) continue;
    let best: { host: (typeof targets)[number]; heard: number; top: string } | null = null;
    for (const host of targets) {
      const { heard, top } = listenersTakenFrom(draft, rival, host.id);
      if (heard > 0 && (!best || heard > best.heard)) best = { host, heard, top };
    }
    if (!best) continue;
    const { host, top } = best;
    const salary = round50(salaryFor('host', host.skill, host.fame, draft) * POACH.premium.max);
    const fee = salary * POACH.rivalFeeMonths;
    if (salary < host.salary * (1 + POACH.minRaise) || !canAfford(rival, fee)) continue;
    const reason = `Their “${top}” takes more of its listeners than any other show of yours.`;
    const offer: PoachOffer = { id: newId(draft, 'po'), hostId: host.id, rivalId: rival.id, salary, expiresOn: draft.day + POACH.answerDays, fee, reason };
    draft.poachOffers.push(offer);
    addHeadline(draft, `Rumour has it that ${rival.name} is courting ${host.name}.`);
    addMessage(
      draft,
      'danger',
      `${rival.name} has offered ${host.name} ${formatEuro(salary)} a month and a ${formatEuro(fee)} signing fee. ${reason} Match it on the Staff screen within ${POACH.answerDays} days, or they leave.`,
      undefined,
      'staff',
    );
    return;
  }
  if (roll >= POACH.monthlyChance * cut) return;
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
  // An aimed offer carries a signing fee, which the rival pays from its own money.
  if (offer.fee) rival.money = Math.max(0, rival.money - offer.fee);
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

/** A host joins a rival: its weakest show of that medium with a host gets them, and gains rivalGain. Returns that show. */
function joinRival(rival: Rival, name: string, fame: number, medium: string): RivalShow | undefined {
  const shows = rival.channels.filter((c) => c.medium === medium).flatMap((c) => c.schedule).filter((s) => hasHost(getGenre(s.genre)));
  const show = shows.sort((a, b) => a.quality - b.quality)[0];
  if (show) {
    show.hostName = name;
    show.hostFame = Math.max(show.hostFame, Math.round(fame));
    show.quality = Math.min(1, show.quality * POACH.rivalGain);
  }
  return show;
}

/** The host's notice is over: they leave, and the rival's weakest show of that medium with a host gets them. */
export function hostLeaves(draft: GameState, hostId: string): void {
  const host = draft.employees.find((e) => e.id === hostId);
  const rival = host?.leaving ? draft.rivals.find((r) => r.id === host.leaving!.rivalId) : undefined;
  if (!host) return;
  removeEmployee(draft, host.id);
  if (!rival) return;
  const show = joinRival(rival, host.name, host.fame, hostMedium(host.specialties));
  addMessage(draft, 'danger', `${host.name} has left for ${rival.name}${show ? ` and now presents “${show.name}”` : ''}.${draft.shows.some((s) => s.hostId === null && hasHost(getGenre(s.genre))) ? ' A show of yours has no host now.' : ''}`, undefined, undefined, 'staff');
}

/** Daily: hosts whose offer wasn't matched in time give notice, and those whose notice is over leave. */
export function resolvePoachOffers(draft: GameState): void {
  for (const offer of draft.poachOffers.filter((o) => o.expiresOn <= draft.day)) hostGivesNotice(draft, offer);
  for (const host of draft.employees.filter((e) => e.leaving && e.leaving.on <= draft.day)) hostLeaves(draft, host.id);
}

// --- A rival's second offer in the hiring pool (0.23.0, #415) ---

/** Does this rival have a channel of the medium in a region one of your channels of that medium reaches? */
function meetsInMedium(draft: GameState, rival: Rival, medium: string): boolean {
  return draft.channels.some((channel) => {
    if (channel.medium !== medium) return false;
    const regions = channelRegions(draft, channel.id);
    return rival.channels.some((c) => c.medium === medium && c.regionIds.some((r) => regions.includes(r)));
  });
}

/**
 * Monthly, after the pool is fresh: a rival that fights you makes an offer to the best-known host in
 * your hiring pool. They stay there until the 15th, asking POACH.poolRaise times their salary; the
 * rival must be able to pay the signing fee. One offer a month, no random numbers.
 */
export function rivalPoolOffer(draft: GameState): void {
  if (draft.candidates.some((c) => c.rivalOffer)) return;
  const rivals = draft.rivals.filter((r) => rivalStance(r) === 'fights').sort((a, b) => b.rivalry - a.rivalry || a.id.localeCompare(b.id));
  const hosts = draft.candidates
    .filter((c) => c.role === 'host' && c.fame >= POACH.poolFame && !c.foundFor && !c.rivalOffer)
    .sort((a, b) => b.fame - a.fame || b.skill - a.skill || a.id.localeCompare(b.id));
  for (const rival of rivals) {
    const host = hosts.find((h) => meetsInMedium(draft, rival, hostMedium(h.specialties)));
    if (!host) continue;
    const salary = round50(host.salary * POACH.poolRaise);
    if (!canAfford(rival, salary * POACH.rivalFeeMonths)) continue;
    const on = draft.day + POACH.poolDay - 1;
    host.salary = salary;
    host.rivalOffer = { rivalId: rival.id, on };
    addHeadline(draft, `${rival.name} has made ${host.name} an offer too.`);
    addMessage(
      draft,
      'warning',
      `${rival.name} has made ${host.name} an offer too. They are still in your hiring pool, now asking ${formatEuro(salary)} a month. Hire them by ${formatDate(on - 1)}, or they sign with ${rival.name} on the ${POACH.poolDay}th.`,
      undefined,
      'staff',
      'penny',
      'rivals',
    );
    return;
  }
}

/** Daily: a host in the pool whose rival's day has come leaves it, and signs with the rival if it still has a channel of that medium. */
export function resolvePoolOffers(draft: GameState): void {
  for (const host of draft.candidates.filter((c) => c.rivalOffer && c.rivalOffer.on <= draft.day)) {
    const rival = draft.rivals.find((r) => r.id === host.rivalOffer!.rivalId);
    draft.candidates = draft.candidates.filter((c) => c !== host);
    const medium = hostMedium(host.specialties);
    if (!rival || !rival.channels.some((c) => c.medium === medium)) continue;
    chargeRival(rival, host.salary * POACH.rivalFeeMonths);
    const show = joinRival(rival, host.name, host.fame, medium);
    addHeadline(draft, `${host.name} signs with ${rival.name}.`);
    addMessage(draft, 'info', `${host.name} was not hired in time and has signed with ${rival.name}${show ? `, where they now present “${show.name}”` : ''}.`, undefined, 'staff', undefined, 'rivals');
  }
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

/** A rival's host as your employee, with their fame, on the salary given (0.23.0, #477: `poachHost` and a whole takeover both make one). Returns their id. */
export function rivalHostEmployee(draft: GameState, name: string, fame: number, genre: GenreId, skill: number, salary: number): Id {
  const id = newId(draft, 'p');
  draft.employees.push({
    id,
    name,
    role: 'host',
    skill,
    salary,
    specialties: [genre],
    fame,
    department: null,
    // A rival's host has no age until they sign with you (0.20.0): between 25 and 45.
    bornOn: birthAt(draft, id, 25, 45),
    hiredOn: draft.day,
    xp: 0,
    level: 1,
    morale: MORALE.neutral,
    location: null,
    desk: null,
    trainingUntil: null,
    courseIn: null,
    leaving: null,
    talentUntil: null,
    away: null,
  });
  return id;
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
