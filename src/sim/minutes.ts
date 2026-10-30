// The minutes of a meeting (0.20.0, #151): the leader of the team writes to the
// CEO what was said. The words come from the state of the game and a hash of the
// team and the day, as the staff's thoughts do (thoughts.ts): nothing is drawn
// from the random stream and nothing in the simulation depends on them. The
// morale code (morale.ts) gathers the facts, so that this file imports no
// meeting rules.

import { ANY_OTHER_BUSINESS, ANY_OTHER_BUSINESS_IF, BUSINESS, LEADER, MOOD } from '../config/minutes';
import { CLEANLINESS, THOUGHTS } from '../config/balance';
import { formatDate } from './calendar';
import type { Employee, GameState, Id, TeamId } from './state';

/** What the minutes need to know of a meeting. */
export interface MinutesFacts {
  /** The team that met, or a channel's production team. */
  of: { team: TeamId } | { channelId: Id };
  /** In the middle of a sentence: “the sales team”. */
  inText: string;
  /** Who chaired it, and who else came (the leader not among them). */
  leader: Employee;
  members: Employee[];
  room: { name: string; seats: number; flipChart: boolean; cleanliness: number };
  /** The day of the next meeting if the team meets every month, otherwise null. */
  next: number | null;
}

/** The most names listed under “Present”. */
const NAMED = 3;

function hash(text: string): number {
  let h = 17;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const fill = (line: string, values: Record<string, string | number>) => line.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));

/** One thing the team did this week, for the point of business. */
function business(state: GameState, facts: MinutesFacts, pick: (options: string[], salt: string) => string): string {
  const plural = (n: number) => (n === 1 ? '' : 's');
  if ('channelId' in facts.of) {
    const channelId = facts.of.channelId;
    const week = state.weeklyReports.at(-1)?.channels.find((c) => c.channelId === channelId);
    const best = week && [...week.slots].sort((a, b) => b.listeners - a.listeners)[0];
    return best ? fill(pick(BUSINESS.channel.some, 'item'), { name: best.programName }) : pick(BUSINESS.channel.none, 'item');
  }
  const { team } = facts.of;
  const count = (n: number, lines: { some: string[]; none: string[] }) =>
    fill(pick(n > 0 ? lines.some : lines.none, 'item'), { n, s: plural(n), points: Math.floor(state.researchPoints) });
  switch (team) {
    case 'production':
      return count(new Set(state.channels.flatMap((c) => c.schedule.filter((id): id is Id => id !== null))).size, BUSINESS.production);
    case 'sales':
      return count(state.offers.length, BUSINESS.sales);
    case 'marketing':
      return count(state.campaigns.length, BUSINESS.marketing);
    default:
      return count(state.techs.length, BUSINESS.research);
  }
}

/** The minutes as the text of an e-mail: paragraphs divided by a blank line. The first paragraph's part before the colon is the subject. */
export function minutesOf(state: GameState, facts: MinutesFacts): string {
  const id = 'channelId' in facts.of ? facts.of.channelId : facts.of.team;
  const pick = (options: string[], salt: string) => options[hash(`${id}${state.day}${salt}`) % options.length]!;
  const { leader, members, room } = facts;

  const opening = `Minutes of the meeting of ${facts.inText}: we met in ${room.name} on ${formatDate(state.day)}.`;

  const named = members.slice(0, NAMED).map((e) => e.name);
  const left = members.length - named.length;
  const who = left > 0 ? `${named.join(', ')} and ${left} other${left === 1 ? '' : 's'}` : named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${named.at(-1)}` : (named[0] ?? 'nobody');
  const seats = room.seats >= members.length ? `${room.seats} seats for ${members.length} of us.` : `${room.seats} seats for ${members.length} of us, so some stood.`;
  const present = `Present: ${who}, with me in the chair. ${seats}`;

  const flipChart = room.flipChart ? ANY_OTHER_BUSINESS_IF.flipChart : [];
  const dirt = room.cleanliness < CLEANLINESS.cleanEnough ? ANY_OTHER_BUSINESS_IF.dirt : [];
  const noCook = state.employees.some((e) => e.role === 'cook') ? [] : ANY_OTHER_BUSINESS_IF.noCook;
  const other = pick([...ANY_OTHER_BUSINESS, ...flipChart, ...dirt, ...noCook], 'other');

  const crowded = room.seats < members.length;
  const mood = [pick(crowded ? MOOD.crowded : MOOD.good, 'mood')];
  if (leader.morale < THOUGHTS.unhappy) mood.push(pick(LEADER.low, 'leader'));
  else if (leader.morale >= THOUGHTS.happy) mood.push(pick(LEADER.high, 'leader'));
  mood.push(facts.next === null ? 'No date set for the next one.' : `Next meeting: ${formatDate(facts.next)}.`);

  return [opening, present, `${business(state, facts, pick)}\n${other}`, mood.join(' ')].join('\n\n');
}
