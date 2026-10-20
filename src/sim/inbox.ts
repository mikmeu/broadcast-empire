// The inbox (0.17.0, #60): every message of the simulation is an e-mail to the
// CEO, sent by the person in the company it is most about. This file says who
// that is, how much an e-mail matters, and the made-up addresses they write from.
// Like state.ts, which calls it for every message it adds, it imports only types
// and config, so that every sim module can use it without an import cycle.

import type { Department, Employee, GameState, Id, Message, MessageAbout, MessageTopic, Role, Sender } from './state';

/**
 * Where an e-mail comes from: a desk of the company, or Uncle Tabby or Penny Cash.
 * The desk becomes a person when the e-mail is sent (see `senderFor`).
 */
export type Desk = Department | 'channel' | 'staff' | 'cleaner' | 'technician' | 'maintenance' | 'tabby' | 'penny';

/** What a message says about its sender: a desk, and for news about a channel, the channel, whose own manager writes. */
export type From = Desk | { desk: Desk; channelId: Id };

/** News about a channel, from its own manager; without a channel, from the channel manager who has been there longest. */
export const fromChannel = (channelId?: Id | null): From => (channelId ? { desk: 'channel', channelId } : 'channel');

export type Priority = 'high' | 'medium' | 'low';

/** Your uncle, who writes about milestones and money: his own, which the dividend and a bailout are. */
export const TABBY: Sender = { name: 'Tabby Loid', title: 'Your uncle, Loid Enterprises', kind: 'tabby' };
/** His business consultant, who writes about the market, and in the place of anyone the company has not hired yet. */
export const PENNY: Sender = { name: 'Penny Cash', title: 'Business consultant, Loid Enterprises', kind: 'penny' };

/** The domain of your uncle's company, where Tabby and Penny write from. */
const LOID = 'loid-enterprises';

/** What someone does, as it stands under their name in an e-mail. */
const JOB_TITLES: Record<Role, string> = {
  host: 'Host',
  production: 'Production assistant',
  channelManager: 'Channel manager',
  manager: 'Manager',
  sales: 'Sales representative',
  marketing: 'Marketer',
  researcher: 'Researcher',
  cleaner: 'Cleaner',
  technician: 'Technician',
  maintenance: 'Maintenance',
  writer: 'Writer',
  editor: 'Video editor',
  engineer: 'Audio engineer',
  scheduler: 'Music scheduler',
  cook: 'Cook',
  clerk: 'Post room clerk',
  recruiter: 'Recruiter',
  talentManager: 'Talent manager',
};

/** The heads of the departments, by the department (DEPARTMENT_NAMES in staff.ts, which cannot be imported here). */
const HEAD_OF: Record<Department, string> = { production: 'Head of Production', sales: 'Head of Sales', marketing: 'Head of Marketing', research: 'Head of R&D' };

/** Who writes for a department when it has no head: its own people. Production has the channel managers, who lead it. */
const DEPARTMENT_STAFF: Record<Exclude<Department, 'production'>, Role> = { sales: 'sales', marketing: 'marketing', research: 'researcher' };

/**
 * The desk a message comes from when the code that sent it named none: a
 * milestone is Tabby's, the start of something in the country Penny's, and news
 * about a window is from whoever works behind it. The rest is Penny's.
 */
export function deskOf(message: { topic?: MessageTopic; about?: MessageAbout }): Desk {
  if (message.topic === 'milestone') return 'tabby';
  if (message.topic === 'event') return 'penny';
  switch (message.about) {
    case 'sales':
    case 'marketing':
    case 'research':
      return message.about;
    case 'broadcast:channels':
    case 'broadcast:staffing':
    case 'licenses':
      return 'channel';
    case 'broadcast:content':
      return 'production';
    case 'staff':
      return 'staff';
    default:
      return 'penny';
  }
}

/** The one of them who has been longest at it: the highest level, then the most skill, then the first hired. */
function senior(people: Employee[]): Employee | undefined {
  return [...people].sort((a, b) => b.level - a.level || b.skill - a.skill || a.hiredOn - b.hiredOn)[0];
}

/** The person at a desk today, or nobody: then Penny writes. */
function personAt(state: GameState, desk: Desk, channelId?: Id): Employee | undefined {
  const withRole = (role: Role) => state.employees.filter((e) => e.role === role);
  const channelManager = () => {
    const own = state.channels.find((c) => c.id === channelId)?.managerId;
    return state.employees.find((e) => e.id === own && e.role === 'channelManager') ?? senior(withRole('channelManager'));
  };
  switch (desk) {
    case 'channel':
      return channelManager();
    case 'production':
    case 'sales':
    case 'marketing':
    case 'research': {
      const head = state.employees.find((e) => e.role === 'manager' && e.department === desk);
      return head ?? (desk === 'production' ? channelManager() : senior(withRole(DEPARTMENT_STAFF[desk])));
    }
    case 'staff':
      return senior(withRole('recruiter'));
    case 'cleaner':
    case 'technician':
    case 'maintenance':
      return senior(withRole(desk));
    default:
      return undefined;
  }
}

/** What a member of staff is called under their name: their job, and for a channel manager the channel. */
function titleOf(state: GameState, person: Employee): string {
  if (person.role === 'manager' && person.department) return HEAD_OF[person.department];
  if (person.role === 'channelManager') {
    const channel = state.channels.find((c) => c.managerId === person.id);
    return channel ? `Channel manager, ${channel.name}` : JOB_TITLES.channelManager;
  }
  if (person.role === 'technician' && state.techs.includes('personalComputer')) return 'IT technician';
  return JOB_TITLES[person.role];
}

/**
 * Who sends a message: the desk the code named, or the one `deskOf` finds,
 * made a person. It is a copy, so that an e-mail still reads right after they leave.
 */
export function senderFor(state: GameState, message: { topic?: MessageTopic; about?: MessageAbout }, from?: From): Sender {
  const desk = from === undefined ? deskOf(message) : typeof from === 'string' ? from : from.desk;
  if (desk === 'tabby') return { ...TABBY };
  const person = personAt(state, desk, typeof from === 'object' ? from.channelId : undefined);
  return person ? { name: person.name, title: titleOf(state, person), kind: 'staff' } : { ...PENNY };
}

/**
 * How much an e-mail matters. Trouble and milestones are high; a warning, news
 * about a window, the start of something in the country and good news are
 * medium; the rest (the monthly report, a level reached, the weekly ratings) is
 * low, and only lands in the inbox, without a toast.
 */
export function priorityOf(message: Pick<Message, 'kind' | 'topic' | 'about'>): Priority {
  if (message.kind === 'danger' || message.topic === 'milestone') return 'high';
  if (message.kind === 'warning' || message.about !== undefined || message.topic === 'event') return 'medium';
  return message.kind === 'good' && message.topic !== 'routine' ? 'medium' : 'low';
}

/** A name made fit for an address: no accents, lower case, and anything but letters and digits a dash. */
export function slug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A person's address at a company: every part of the name, joined with dots. */
function personal(name: string, companyName: string): string {
  const local = name.split(/\s+/).map(slug).filter(Boolean).join('.');
  return `${local || 'staff'}@${slug(companyName) || 'company'}.eth`;
}

/** The made-up address an e-mail comes from: staff at the company, Tabby and Penny at their uncle's. */
export function addressOf(sender: Sender, companyName: string): string {
  if (sender.kind === 'tabby') return `tabby@${LOID}.eth`;
  if (sender.kind === 'penny') return `penny@${LOID}.eth`;
  return personal(sender.name, companyName);
}

/** Your own address, as the CEO. */
export const yourAddress = (state: GameState) => personal(state.playerName, state.companyName);

/** How long a subject may be. */
const SUBJECT_LENGTH = 60;

/** The subject of an e-mail: its text up to the first colon or the end of the first sentence, cut short if it is long. */
export function subjectOf(text: string): string {
  const first = /^(.+?)(?::|[.!?](?=\s|$))/.exec(text)?.[1] ?? text;
  if (first.length <= SUBJECT_LENGTH) return first;
  const cut = first.slice(0, SUBJECT_LENGTH - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > SUBJECT_LENGTH / 2 ? cut.lastIndexOf(' ') : cut.length)}…`;
}

/** How many e-mails are unread. */
export const unreadCount = (state: GameState) => state.messages.reduce((n, m) => n + (m.read ? 0 : 1), 0);
