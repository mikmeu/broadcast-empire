// What is on someone's mind (0.20.0, #154): a few short thoughts in their own
// words, read from the state of the game as it is today. They come from what
// already drives morale (see `moraleParts`) and from the situation the Staff
// window already shows. Nothing is saved, nothing is drawn from a random
// stream and no number depends on them: they are only said.

import { MORALE, THOUGHTS } from '../config/balance';
import { showLoad } from './broadcast';
import { employeesWithDesk, needsDesk, ownDesk, type Desks } from './office';
import type { Employee, GameState } from './state';
import { awayWithoutTemp, onStrike, teamOf } from './teams';
import { guardedHosts, moraleParts, sharedMorale, workplaces, type MoraleParts } from './upkeep';

export type ThoughtKind =
  | 'noDesk'
  | 'brokenDesk'
  | 'noShow'
  | 'noChannel'
  | 'dirt'
  | 'fault'
  | 'fans'
  | 'strike'
  | 'offer'
  | 'raise'
  | 'leaving'
  | 'course'
  | 'talent'
  | 'meeting'
  | 'canteen'
  | 'meals'
  | 'post'
  | 'comfort'
  | 'mood';

export interface Thought {
  kind: ThoughtKind;
  tone: 'good' | 'bad';
  text: string;
}

/** What the rest of a state costs to work out, once for everyone (as `Teams` does). */
export interface ThoughtContext {
  desked: Desks;
  shared: ReturnType<typeof sharedMorale>;
  guarded: ReturnType<typeof guardedHosts>;
}

export function thoughtContext(state: GameState): ThoughtContext {
  const desked = employeesWithDesk(state);
  return { desked, shared: sharedMorale(state, desked), guarded: guardedHosts(state, desked) };
}

/** A number from a person's id, so that the same person always says the same wording. */
function wording(employee: Employee, kind: ThoughtKind): number {
  let h = 17;
  for (const c of employee.id + kind) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const pick = (employee: Employee, kind: ThoughtKind, options: string[]) => options[wording(employee, kind) % options.length]!;

/** The lowest number comes first: what the player can fix, then offers and leaving, then the good things. */
const ORDER: Record<ThoughtKind, number> = {
  noDesk: 0, brokenDesk: 0, noShow: 1, noChannel: 1, dirt: 2, fault: 3, fans: 4, strike: 5,
  offer: 10, raise: 11, leaving: 12, course: 20, talent: 21,
  meeting: 30, canteen: 31, meals: 32, post: 33, comfort: 34, mood: 40,
};

/** Up to `THOUGHTS.max` thoughts of someone, the most important first. */
export function thoughtsOf(state: GameState, employee: Employee, context: ThoughtContext = thoughtContext(state)): Thought[] {
  const { desked, shared, guarded } = context;
  const found: Thought[] = [];
  const say = (kind: ThoughtKind, tone: Thought['tone'], ...options: string[]) => found.push({ kind, tone, text: pick(employee, kind, options) });
  const rival = (id: string) => state.rivals.find((r) => r.id === id)?.name ?? 'a rival';

  // Their situation.
  const striking = onStrike(state, employee);
  if (striking) say('strike', 'bad', 'We are on strike, and we mean it.', 'Nobody is working until things change.');
  else {
    const team = teamOf(employee.role);
    if (team && state.unrest[team]?.warnedOn != null) say('strike', 'bad', 'If nothing changes, we are walking out.', 'We have warned you. We will strike.');
  }
  if (needsDesk(employee.role) && !desked.has(employee.id) && !striking && !awayWithoutTemp(state, employee)) {
    if (ownDesk(state, employee)) say('brokenDesk', 'bad', 'My own desk is broken, and there is no other.', 'Somebody please mend my desk.');
    else say('noDesk', 'bad', 'I have no desk. How am I meant to work?', 'Still no desk for me.');
  }
  const load = showLoad(state, employee.id);
  if (employee.role === 'host' && load === 0 && employee.talentUntil == null) say('noShow', 'bad', 'Nobody has given me a show.', 'I am a host with nothing to host.');
  else if ((employee.role === 'production' || employee.role === 'writer' || employee.role === 'editor') && load === 0)
    say('noShow', 'bad', 'I am on no show at all. What am I here for?', 'No show needs me yet.');
  if (employee.role === 'channelManager' && !state.channels.some((c) => c.managerId === employee.id)) say('noChannel', 'bad', 'I manage no channel.', 'A channel manager without a channel. Odd.');
  const offer = state.poachOffers.find((o) => o.hostId === employee.id);
  if (offer) say('offer', 'bad', `${rival(offer.rivalId)} has made me an offer.`, `${rival(offer.rivalId)} wants me, and pays more.`);
  if (state.awards.raises.some((r) => r.hostId === employee.id)) say('raise', 'bad', 'I won an award. I think I have earned a raise.', 'After that award, I expect the going rate.');
  if (employee.leaving) say('leaving', 'bad', `I am off to ${rival(employee.leaving.rivalId)}.`, `My notice is in. ${rival(employee.leaving.rivalId)} it is.`);
  if (employee.trainingUntil != null) say('course', 'good', 'This course is teaching me things.', 'Back to school for a while. I do not mind.');
  if (employee.talentUntil != null) say('talent', 'good', 'The talent programme is a lot of work, but worth it.', 'They are making something of me in the programme.');

  // What drives their morale.
  const parts = moraleParts(state, employee, desked, shared, guarded);
  const min = THOUGHTS.threshold;
  const rooms = workplaces(state, employee, desked);
  if (parts.dirt >= min) {
    const room = [...rooms].sort((a, b) => a.cleanliness - b.cleanliness)[0];
    const where = room?.name ?? 'This place';
    say('dirt', 'bad', `${where} is filthy.`, `Does anybody ever clean ${where}?`);
  }
  if (parts.issue > 0) {
    const room = rooms.find((r) => r.issue);
    const where = room?.name ?? 'here';
    if (room?.issue?.kind === 'heating') say('fault', 'bad', `The heating is off in ${where} again.`, `It is freezing in ${where}.`);
    else say('fault', 'bad', `The lights keep failing in ${where}.`, `I cannot see a thing in ${where}.`);
  }
  if (parts.fans >= min) say('fans', 'bad', 'Fans keep waiting for me at the door.', 'I am afraid of the fans. Where is a guard?');
  if (parts.meeting >= min) say('meeting', 'good', 'That meeting did us good.', 'It helped to be heard in the meeting.');
  if (parts.canteen + parts.canteenComfort >= min) say('canteen', 'good', 'A real canteen at last.', 'The canteen is the best part of my day.');
  if (parts.meals >= min) say('meals', 'good', 'Hot meals at lunch. I could get used to this.', 'The cooks are looking after us.');
  if (parts.post >= min) say('post', 'good', 'My letters arrive on time now.', 'The post room does a good job.');
  if (parts.comfort >= min) say('comfort', 'good', 'It is quite nice around my desk.', 'A few comforts make a difference.');

  const ranked = found.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]).slice(0, THOUGHTS.max);
  if (ranked.length === 0) {
    if (employee.morale >= THOUGHTS.happy) return [{ kind: 'mood', tone: 'good', text: pick(employee, 'mood', ['Good place to work.', 'I cannot complain.']) }];
    if (employee.morale < THOUGHTS.unhappy) return [{ kind: 'mood', tone: 'bad', text: pick(employee, 'mood', ['I cannot put my finger on it, but I am not happy.', 'Something is wrong, and I do not know what.']) }];
  }
  return ranked;
}

/** The parts of someone's morale target in words: “60 base, +20 canteen, −12 dirt”. Parts that are nil are left out. */
export function describeMorale(parts: MoraleParts): string {
  const part = (value: number, name: string) => (Math.round(value) === 0 ? null : `${value > 0 ? '+' : '−'}${Math.abs(Math.round(value))} ${name}`);
  return [
    `${MORALE.neutral} base`,
    part(parts.canteen, 'canteen'),
    part(parts.meals, 'hot meals'),
    part(parts.post, 'post'),
    part(parts.meeting, 'meeting'),
    part(parts.comfort, 'comfort'),
    part(parts.canteenComfort, 'canteen comfort'),
    part(-parts.dirt, 'dirt'),
    part(-parts.issue, 'faults'),
    part(-parts.fans, 'fans'),
  ]
    .filter(Boolean)
    .join(', ');
}

/** What people say across the company: the problems named most, with how many say it. Each person counts once per problem. */
export function thoughtTally(state: GameState, context: ThoughtContext = thoughtContext(state)): { kind: ThoughtKind; count: number }[] {
  const counts = new Map<ThoughtKind, number>();
  for (const e of state.employees) for (const t of thoughtsOf(state, e, context)) if (t.tone === 'bad') counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
  return [...counts].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count || ORDER[a.kind] - ORDER[b.kind]);
}

/** A problem as it is named in the summary: “8 about dirt”. */
export const TALLY_NAMES: Partial<Record<ThoughtKind, string>> = {
  noDesk: 'without a desk',
  brokenDesk: 'with a broken desk',
  noShow: 'without a show',
  noChannel: 'without a channel',
  dirt: 'about dirt',
  fault: 'about faults',
  fans: 'afraid of fans',
  strike: 'ready to strike',
  offer: 'with an offer',
  raise: 'asking for a raise',
  leaving: 'leaving',
  mood: 'unhappy',
};
