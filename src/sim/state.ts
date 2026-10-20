// Game state types and the small helpers that write to a draft state.
// This file imports only types and config, and inbox.ts, which does the same,
// so every sim module can import it without creating an import cycle. New games
// are built in newGame.ts.

import type { Look } from '../config/looks';
import type { Difficulty } from '../config/balance';
import type { GenreId } from '../config/genres';
import type { MilestoneId } from '../config/milestones';
import type { BuildingId, FurnitureType, RoomShape, RoomType } from '../config/office';
import type { Feature, WindowRef } from '../config/unlocks';
import type { Personality } from '../config/rivals';
import type { TechId } from '../config/tech';
import type { AudienceId, Medium, RegionId } from '../config/world';
import { senderFor, type From } from './inbox';

export type Id = string;

// --- Office ---

export interface Furniture {
  id: Id;
  type: FurnitureType;
  /** Tile position inside the room. */
  x: number;
  y: number;
  /** Quarter turns, counter-clockwise seen from above (0–3). An odd turn swaps the footprint's width and depth. */
  turn: number;
  /** Technology tier (1 for furniture without tiers). */
  tier: number;
  /** 0–100; at 0 the item is broken. Durable furniture stays at 100. */
  condition: number;
  /** The day it was bought. What it sells for falls with its age (see `resaleValue`). */
  boughtOn: number;
}

/** A fault in the building that makes a room unpleasant to work in until maintenance fixes it. */
export interface BuildingIssue {
  kind: 'lighting' | 'heating';
  /** Days of maintenance work still needed. */
  workLeft: number;
}

/**
 * A room the player has: one they rent, or the reception. It carries its own
 * place in the building (its floor, its rectangle and its door), so a room is
 * where the game says it is, not where the building once had it.
 */
export interface RentedRoom extends RoomShape {
  roomId: string;
  name: string;
  /** Comes with the building: it is not rented and can't be given up. */
  fixed?: true;
  type: RoomType | null;
  furniture: Furniture[];
  /** 0–100; drops with use and is restored by cleaners. */
  cleanliness: number;
  issue: BuildingIssue | null;
}

// --- People ---

export type Role =
  | 'host'
  | 'production'
  | 'channelManager'
  | 'sales'
  | 'marketing'
  | 'researcher'
  | 'manager'
  | 'cleaner'
  | 'technician'
  | 'maintenance'
  | 'writer'
  | 'editor'
  | 'engineer'
  | 'cook'
  | 'clerk'
  | 'recruiter';

/**
 * The teams of the company (0.15.0): the people who meet together in a
 * meeting room, and who strike together when their morale is low. Managers
 * belong to none of them. See TEAMS in sim/teams.ts.
 */
export type TeamId = 'hosts' | 'production' | 'sales' | 'marketing' | 'research' | 'support';

/** When a team last met in a meeting room, and whether it meets every month by itself (0.15.0). */
export interface Meeting {
  /** The day of the last meeting, or null if it has not met yet. */
  on: number | null;
  /** The morale it lifts each member by, for MEETINGS.lasts days: less when the room had fewer seats than the team had people. */
  lift: number;
  /** Called again by itself as soon as it may be (see MEETINGS.every). */
  monthly: boolean;
}

/** A team whose morale is too low (0.15.0; see STRIKES in balance.ts). */
export interface Unrest {
  /** The first day of the spell of low morale. */
  since: number;
  /** The day the team threatened to strike, or null if it has not yet. */
  warnedOn: number | null;
  /** The team is on strike until the start of this day, or null if it is not. */
  strikeUntil: number | null;
}

/** Departments that can have a manager. */
export type Department = 'production' | 'sales' | 'marketing' | 'research';

export interface Person {
  id: Id;
  name: string;
  role: Role;
  /** 1–100 */
  skill: number;
  /** Per month. */
  salary: number;
  /** Hosts only: genres where their skill counts in full. */
  specialties: GenreId[];
  /** Hosts only: 0–100. */
  fame: number;
  /** Managers only: the department they lead. */
  department: Department | null;
}

/** Someone in the hiring pool. */
export interface Candidate extends Person {
  /**
   * A host a recruiter found in the place of one who works out their notice
   * (0.17.0), by the leaving host's id: they stay in the pool past the monthly
   * refresh until they are hired or that host has gone. Unset or null for everyone else.
   */
  foundFor?: Id | null;
}

export interface Employee extends Person {
  hiredOn: number;
  /** XP towards the next level. */
  xp: number;
  level: number;
  /** 0–100; see MORALE in balance.ts. */
  morale: number;
  /** Support staff only: the room they worked in today, if any. */
  location: string | null;
  /**
   * The workstation or manager's desk they were given as their own, by its
   * id, or null: then they take whatever is free (see `employeesWithDesk`).
   */
  desk: Id | null;
  /** Away on a course until this day, with a stand-in at their work, or null (see TRAINING). */
  trainingUntil: number | null;
  /**
   * A host who has signed with a rival and works out their notice: they leave at the start of `on` (see POACH.noticeDays), or null.
   * `found` once a recruiter has found someone in their place (0.17.0; see RECRUITING).
   */
  leaving: { on: number; rivalId: Id; found?: true } | null;
  /** A host in the talent programme until this day, presenting nothing meanwhile (see TALENT), or null. */
  talentUntil: number | null;
}

// --- Broadcasting ---

export interface License {
  id: Id;
  regionId: RegionId;
  medium: Medium;
  channelId: Id;
  /** What was paid for it (counts towards company value). */
  price: number;
  /** The license returns to auction on this day (see RENEWAL in balance.ts). */
  expiresOn: number;
}

export type LogoShape = 'circle' | 'square' | 'diamond' | 'shield';

export interface Logo {
  shape: LogoShape;
  color: string;
  initials: string;
}

export interface Channel {
  id: Id;
  name: string;
  logo: Logo;
  medium: Medium;
  managerId: Id | null;
  /** Show per slot, in SLOTS order. */
  schedule: (Id | null)[];
  /** 0–1 per region. */
  reputation: Partial<Record<RegionId, number>>;
  /** The last day this channel staged an event of its own, or null. */
  lastEventDay: number | null;
}

/**
 * A produced show (host, staff, studio) or, for licensed genres, a program slot
 * that airs a title from the library each day (no host, staff or studio).
 */
export interface Show {
  id: Id;
  name: string;
  genre: GenreId;
  hostId: Id | null;
  staffIds: Id[];
  /** The writers who write it (0.14.0): see `writers` in config/genres.ts. */
  writerIds: Id[];
  /** The video editor who edits it, for a produced TV show (0.14.0): none or one. */
  editorIds: Id[];
  /** Room id of the studio. */
  studioId: string | null;
  /** 0.6–1 */
  freshness: number;
}

// --- Content (licensed titles) and sports rights ---

/** A licensed title the player owns. */
export interface Title {
  id: Id;
  name: string;
  genre: GenreId;
  /** 0–1 */
  quality: number;
  airingsLeft: number;
  /** CONTENT.minFreshness–1; drops each airing and recovers off air. */
  freshness: number;
  /** Teleshopping only: paid per airing instead of ad revenue. */
  fee: number;
  /** What each airing costs: a title is paid an airing at a time, on the days it airs. */
  perAiring: number;
}

export interface TitleOffer {
  id: Id;
  name: string;
  genre: GenreId;
  quality: number;
  airings: number;
  price: number;
  fee: number;
}

export interface RightsOffer {
  id: Id;
  name: string;
  /** Multiplies the appeal of sports shows. */
  prestige: number;
  months: number;
  price: number;
}

export interface SportsRights {
  id: Id;
  name: string;
  prestige: number;
  /** First day the rights no longer apply. */
  endDay: number;
}

/** A newly issued license, sold by sealed bid. */
export interface Auction {
  id: Id;
  medium: Medium;
  regionId: RegionId;
  /** Minimum bid: the license's list price. */
  reserve: number;
  /** Bids close at the start of this day. */
  endsOn: number;
  /** Rivals that want this license (shown to the player as a hint). */
  interested: number;
  bid: { channelId: Id; amount: number } | null;
  /**
   * Null for a newly issued license. For a renewal round: who holds the license
   * now (PLAYER or a rival's id), on which channel, and what it earns a year.
   */
  holder: { ownerId: Id; channelId: Id; value: number } | null;
}

export interface RivalShow {
  name: string;
  genre: GenreId;
  quality: number;
  hostFame: number;
  /** The show's host; empty for licensed programs. */
  hostName: string;
}

export interface RivalChannel {
  id: Id;
  name: string;
  logo: Logo;
  medium: Medium;
  regionIds: RegionId[];
  schedule: RivalShow[];
  reputation: Partial<Record<RegionId, number>>;
  /** The day each of its regional licenses returns to auction. */
  licenseExpiry: Partial<Record<RegionId, number>>;
}

export interface Rival {
  id: Id;
  name: string;
  personality: Personality;
  channels: RivalChannel[];
}

// --- Sales, marketing and loans ---

export interface SponsorOffer {
  id: Id;
  sponsor: string;
  /** Radio offers fit radio shows, TV offers fit TV shows. */
  medium: Medium;
  /** Multiplies the baseline ad rate. */
  cpmMultiplier: number;
  /** Ad revenue from this audience is multiplied by SALES.preferredAudienceBonus. */
  preferredAudience: AudienceId | null;
  /** Average daily listeners the show must reach over the contract. */
  minListeners: number;
  weeks: number;
  penalty: number;
  /** Last day the offer can be accepted. */
  expiresOn: number;
}

export interface SponsorContract extends Omit<SponsorOffer, 'expiresOn'> {
  showId: Id;
  startDay: number;
  endDay: number;
  /** Sum of the show's daily listeners so far; days it doesn't air count as 0. */
  listenerSum: number;
  daysRun: number;
}

/** How well the company knows a sponsor (see RELATIONS in balance.ts). */
export interface Relation {
  /** 1 and up. */
  level: number;
  /** Points towards the next level. */
  points: number;
}

export type CampaignAudience = AudienceId | 'all';

export interface Campaign {
  id: Id;
  /** A channel or a show. */
  targetId: Id;
  audience: CampaignAudience;
  weeklyBudget: number;
  marketerId: Id;
  endDay: number;
  /** How many weeks it runs each time. */
  weeks: number;
  /** Starts again by itself when it ends (0.13.0). */
  repeat: boolean;
}

export interface Loan {
  amount: number;
  /** Principal still owed. */
  balance: number;
  monthlyPayment: number;
  monthsLeft: number;
}

// --- Events and poaching ---

/** A line in the news ticker. */
export interface Headline {
  day: number;
  text: string;
}

/** The TV rights to a World Cup or Olympics, sold by sealed bid before the event. */
export interface RightsAuction {
  id: Id;
  /** See SportsEvent in events.ts. */
  eventId: string;
  name: string;
  reserve: number;
  /** Bids close at the start of this day. */
  endsOn: number;
  /** Rivals with a TV channel (shown to the player as a hint). */
  interested: number;
  /** The player's sealed bid. */
  bid: number | null;
}

/** Who won an event's TV rights: PLAYER or a rival's id. Dropped once the event is over. */
export interface EventRights {
  eventId: string;
  holderId: Id;
}

/** A rival's offer to one of the player's hosts; the host leaves unless the player matches it in time. */
export interface PoachOffer {
  id: Id;
  hostId: Id;
  rivalId: Id;
  /** Monthly salary offered. */
  salary: number;
  /** The host leaves at the start of this day. */
  expiresOn: number;
}

// --- Results & reports ---

export interface SlotResult {
  /** Show id, or null for a rerun / off air. */
  showId: Id | null;
  /** The library title that aired, for licensed programs. */
  titleId: Id | null;
  programName: string;
  /** Quality of what aired (0 when off air). */
  quality: number;
  listeners: number;
  /** Listeners as a share of everyone tuned in to this medium in this slot. */
  share: number;
  /** Everything the slot earned: ads, what a sponsor adds to them, and a teleshopping fee. */
  revenue: number;
  /** Of the revenue, what the show's sponsor added to the ad rate (0.13.0; missing in older results). */
  sponsorRevenue?: number;
  /** Of the revenue, a teleshopping fee (0.13.0; missing in older results). */
  fee?: number;
}

/**
 * What a program's appeal is made of in one slot, averaged over the audiences
 * tuned in where its channel broadcasts, each counted by its people and what
 * advertisers pay for them: the figures the share formula multiplies, and the
 * strongest rival program in the same slot, measured the same way.
 */
export interface SlotFactors {
  quality: number;
  /** How well the genre suits the audiences tuned in (0.25–1). */
  fit: number;
  freshness: number;
  reputation: number;
  /** The host's fame, 0–100. */
  fame: number;
  /** Lift from marketing (0 = none). */
  promotion: number;
  /** Specialization, sports rights and events together (1 = none). */
  bonus: number;
  appeal: number;
  /** The rival program with the most appeal in this slot, where it competes. */
  rival: { channel: string; program: string; appeal: number } | null;
  /** Everyone tuned in to this medium where the channel broadcasts. */
  tunedIn: number;
}

/** The figures of a slot at the start of a week, with what it drew then (0.13.0). */
export interface SlotSnapshot extends SlotFactors {
  showId: Id;
  listeners: number;
}

/** Owner id of everything the player runs. */
export const PLAYER = 'player';

export interface ChannelDay {
  channelId: Id;
  name: string;
  /** PLAYER or a rival's id. */
  ownerId: Id;
  isPlayer: boolean;
  medium: Medium;
  onAir: boolean;
  slots: SlotResult[];
  /** Listeners per region, summed over the day's slots. */
  regionListeners: Partial<Record<RegionId, number>>;
  /** Listeners per audience, summed over the day's slots. */
  audienceListeners: Partial<Record<AudienceId, number>>;
}

export interface DayResult {
  day: number;
  channels: ChannelDay[];
}

export interface WeeklyReport {
  /** First day covered by the report. */
  fromDay: number;
  days: number;
  channels: {
    channelId: Id;
    name: string;
    ownerId: Id;
    isPlayer: boolean;
    medium: Medium;
    slots: { programName: string; listeners: number; share: number }[];
    /** Average listeners per slot, by region and by audience. */
    regionListeners: Partial<Record<RegionId, number>>;
    audienceListeners: Partial<Record<AudienceId, number>>;
    revenue: number;
  }[];
}

export interface Ledger {
  /** Everything earned on the air; the two below are part of it. */
  revenue: number;
  /** Of the revenue, what sponsors added to the ad rate of their shows. */
  sponsorRevenue: number;
  /** Of the revenue, teleshopping fees. */
  fees: number;
  salaries: number;
  rent: number;
  licenseFees: number;
  purchases: number;
  /** Severance, and signing fees for hosts hired away from rivals. */
  severance: number;
  revamps: number;
  marketing: number;
  /** Sports rights. */
  content: number;
  /** Licensed titles, paid an airing at a time. */
  titles: number;
  /** Episode budgets of produced TV shows. */
  production: number;
  sponsorPenalties: number;
  /** Loan repayments (interest and principal). */
  loanPayments: number;
  /** Money borrowed this month; not counted as revenue. */
  loanProceeds: number;
  /** The player's own concerts, galas and telethons. */
  events: number;
  /** Licenses kept or taken over in renewal rounds. */
  renewals: number;
  /** Courses staff were sent on. */
  training: number;
  /** Paid to the owners on 1 January; a share of the cash, not a cost, so not part of the month's result. */
  dividends: number;
  /** What Uncle Tabby sent for milestones: not income from the business, but it is money in. */
  gifts: number;
}

export interface MonthlyReport extends Ledger {
  year: number;
  /** 1–12 */
  month: number;
  net: number;
  balance: number;
}

export type MessageKind = 'info' | 'good' | 'warning' | 'danger';

/**
 * What a message is about, for the few kinds the game treats apart from their
 * tone: a milestone, the start of something in the country (a sports event, an
 * election, a recession), and routine good news (the monthly report, a sponsor
 * contract that ran its course), which comes too often to make a fuss about.
 */
export type MessageTopic = 'milestone' | 'event' | 'routine';

/** The window a message is about, for news the player will want to act on: a pop-up names it and its menu icon gets a dot. */
export type MessageAbout = WindowRef;

/**
 * Who sent an e-mail (0.17.0): a copy of their name and title as they were that
 * day, so that it reads the same after they leave. Uncle Tabby and Penny Cash
 * are not on the staff. See sim/inbox.ts.
 */
export interface Sender {
  name: string;
  title: string;
  kind: 'staff' | 'tabby' | 'penny';
}

/** A message from the simulation: a toast or a pop-up when it comes, and an e-mail in the inbox (0.17.0) after. */
export interface Message {
  id: number;
  day: number;
  kind: MessageKind;
  text: string;
  topic?: MessageTopic;
  about?: MessageAbout;
  from: Sender;
  /** Whether the player has opened it in the inbox. */
  read: boolean;
}

// --- The guide ---

/**
 * Where the player stands with Penny Cash, the business consultant who shows a
 * new company the ropes (config/guide.ts has her lines, sim/guide.ts her logic).
 * Nothing in the simulation depends on it.
 */
export interface Guide {
  /**
   * `welcome`: Uncle Tabby is talking. `offer`: Penny has asked whether she is
   * wanted. `on`: she guides, and drops a hint when something new comes up.
   * `off`: the player sent her away.
   */
  stage: 'welcome' | 'offer' | 'on' | 'off';
  /** Lines the player has been through and won't hear again: the welcome, steps that are only talk, and hints. */
  seen: string[];
  /** No new hint before this day, so they don't come all at once; a hint about something that can't wait ignores it. */
  quiet: number;
}

// --- Game ---

export interface GameState {
  /** Days since 1 January 1970. */
  day: number;
  /** The seed this game started with (for bug reports and replays). */
  seed: number;
  /** Current state of the seeded RNG; see Rng. */
  rngState: number;
  /** How strong the rivals are; fixed when the game starts. */
  difficulty: Difficulty;
  /** The player, who runs the company as its CEO. */
  playerName: string;
  /** What the player looks like: the CEO in the office (config/looks.ts). */
  look: Look;
  companyName: string;
  /** The region the office is in; fixed when the game starts. See HOME_REGION in balance.ts. */
  headquarters: RegionId;
  /** The office building the company is in: how many floors it has and how large they are (BUILDINGS in config/office.ts). */
  building: BuildingId;
  nextId: number;

  money: number;
  /** Everything paid to the owners so far: the company's score. */
  dividendsPaid: number;
  /** Earned by staging events: a second score. */
  prestige: number;
  /** Sum over the player's radio channels of the average listeners across their slots. */
  listeners: number;
  /** The same for TV channels. */
  viewers: number;
  /** Research points available to spend. */
  researchPoints: number;
  /** Techs the player has researched. */
  techs: TechId[];
  /** Average channel reputation, 0–100. */
  reputation: number;

  rooms: RentedRoom[];
  employees: Employee[];
  candidates: Candidate[];
  licenses: License[];
  channels: Channel[];
  shows: Show[];
  rivals: Rival[];
  offers: SponsorOffer[];
  contracts: SponsorContract[];
  /** The sponsors the company has had a contract with, by name. */
  relations: Record<string, Relation>;
  campaigns: Campaign[];
  /** Promotion level per channel or show id, per audience (0–MARKETING.maxPromotion). */
  promotion: Record<Id, Partial<Record<AudienceId, number>>>;
  loan: Loan | null;
  /** Highest office floor the player can rent on. */
  floorsUnlocked: number;
  /** Licenses issued so far per medium and region; newer ones go to auction. */
  licensesIssued: Record<Medium, Partial<Record<RegionId, number>>>;
  auctions: Auction[];
  /** Regions where the authority won't sell the player a license of a medium until a day. */
  licenseBars: { medium: Medium; regionId: RegionId; until: number }[];
  /** Titles owned by the player. */
  library: Title[];
  /** This month's content market. */
  market: { titles: TitleOffer[]; rights: RightsOffer[] };
  sportsRights: SportsRights[];
  rightsAuctions: RightsAuction[];
  eventRights: EventRights[];
  poachOffers: PoachOffer[];
  /** The last day the player signed a rival's host, or null. */
  lastPoachDay: number | null;
  /** News ticker, oldest first. */
  headlines: Headline[];
  /** Milestones reached, with the day, in the order they were reached. */
  milestones: { id: MilestoneId; day: number }[];
  /** What the company can do beyond the basics; see config/unlocks.ts. */
  unlocked: Feature[];

  /** Yesterday's broadcast, for the schedule screen. */
  lastDay: DayResult | null;
  /** Each slot of the player's channels as it stood at the start of the week, to say why its audience moved (0.13.0). */
  weekAgo: Record<string, SlotSnapshot>;
  /** Days since the last weekly report, for the next one. */
  week: DayResult[];
  /** What came in and went out this month; filed as a report on the 1st. */
  ledger: Ledger;
  weeklyReports: WeeklyReport[];
  monthlyReports: MonthlyReport[];
  messages: Message[];
  nextMessageId: number;

  /** Month-ends in a row with negative money. */
  negativeMonths: number;
  /** Uncle Tabby has saved the company from bankruptcy. He does that once. */
  bailedOut: boolean;
  bankrupt: boolean;

  /** The tutorial: see Guide. */
  guide: Guide;

  /** Team meetings (0.15.0), by team. */
  meetings: Partial<Record<TeamId, Meeting>>;
  /** The meetings a channel manager calls for the production staff of their channel (0.17.0), by the channel's id. */
  channelMeetings: Partial<Record<Id, Meeting>>;
  /** Teams that threaten to strike or are on strike (0.15.0), by team. */
  unrest: Partial<Record<TeamId, Unrest>>;

  /** Channels and shows of the player that are off the air (0.16.0), by id: since when, and whether the player was warned. */
  offAir: Record<Id, OffAir>;
  /** The player's shows on the air that were short of producers yesterday (0.17.0): see `watchCrews` in sim/staffing.ts. */
  shortOfProducers: Id[];
  /** Rules of 0.16.0 and later that a game from before waits for, until this day (see `inGrace` in sim/office.ts). */
  grace: Partial<Record<GraceRule, number>>;
}

/** A channel or a show that has not gone out (0.16.0). */
export interface OffAir {
  /** The first day it did not go out. */
  since: number;
  /** Whether the player has been told, after a week. */
  warned: boolean;
}

/**
 * The rules a game from before 0.16.0 got time for: a master control room for a second channel, a CEO's office and a
 * reception desk, and a control room for every TV studio; and from before 0.17.0, a post room before buying titles.
 */
export type GraceRule = 'masterControl' | 'headquarters' | 'controlRooms' | 'postRoom';

export const emptyLedger = (): Ledger => ({
  revenue: 0,
  sponsorRevenue: 0,
  fees: 0,
  salaries: 0,
  rent: 0,
  licenseFees: 0,
  purchases: 0,
  severance: 0,
  revamps: 0,
  marketing: 0,
  content: 0,
  titles: 0,
  production: 0,
  sponsorPenalties: 0,
  loanPayments: 0,
  loanProceeds: 0,
  events: 0,
  renewals: 0,
  training: 0,
  dividends: 0,
  gifts: 0,
});

/** Returns a fresh id and advances the counter. Only call on a draft state. */
export function newId(draft: GameState, prefix: string): Id {
  return `${prefix}${draft.nextId++}`;
}

export function addHeadline(draft: GameState, text: string): void {
  draft.headlines.push({ day: draft.day, text });
}

/** How much a message matters against the others of the same day. */
function weight(message: Message): number {
  if (message.topic === 'milestone') return 2.5;
  if (message.kind === 'good') return message.topic === 'routine' ? 0.5 : 1;
  return { danger: 3, warning: 2, info: 0 }[message.kind];
}

/**
 * The message the player should hear about first, of those added between two
 * states of the same game: trouble before a milestone, a milestone before a
 * warning, then good news, then the rest.
 */
export function topMessage(before: GameState, after: GameState): Message | undefined {
  return after.messages.filter((m) => m.id >= before.nextMessageId).sort((a, b) => weight(b) - weight(a))[0];
}

/** The messages added between two states of the same game that are about a window: each gets a pop-up of its own. */
export function newAlerts(before: GameState, after: GameState): Message[] {
  return after.messages.filter((m) => m.id >= before.nextMessageId && m.about !== undefined);
}

/**
 * The windows where something is waiting for an answer: sponsor offers, a rival's offer to one of your hosts,
 * a renewal round for one of your licenses. A loaded game shows its dots from this, since dots are not saved.
 */
export function waitingFor(state: GameState): MessageAbout[] {
  return [
    ...(state.offers.length > 0 ? (['sales'] as const) : []),
    ...(state.poachOffers.length > 0 ? (['staff'] as const) : []),
    ...(state.auctions.some((auction) => auction.holder?.ownerId === PLAYER) ? (['licenses'] as const) : []),
  ];
}

/**
 * Adds a message, which is also an e-mail to the player. `from` names the desk it comes from when its topic
 * and window don't say (see `deskOf` in sim/inbox.ts); the person at that desk today sends it.
 */
export function addMessage(draft: GameState, kind: MessageKind, text: string, topic?: MessageTopic, about?: MessageAbout, from?: From): void {
  const sender = senderFor(draft, { topic, about }, from);
  draft.messages.push({ id: draft.nextMessageId++, day: draft.day, kind, text, ...(topic && { topic }), ...(about && { about }), from: sender, read: false });
}
