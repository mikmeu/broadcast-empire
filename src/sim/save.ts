import { FEATURES } from '../config/unlocks';
import { refreshMarket } from './content';
import { getGenre, hasHost, type GenreId } from '../config/genres';
import { generateRivalChannel, generateRivals, personName } from './generate';
import { initialIssued, staggeredExpiry } from './licenses';
import { ACTIVE_REGIONS, MORALE } from '../config/balance';
import type { RegionId } from '../config/world';
import { PERSONALITIES } from '../config/rivals';
import { DEFAULT_SETUP, createInitialState } from './newGame';
import { defaultLook, isLook } from '../config/looks';
import { BUILDINGS, CONTROL_ROOM_KIT, FURNITURE, ONE_DESK_ROOMS, RECEPTION, ROOM_TYPE_NAMES, inText, plotsOf, type FurnitureType, type RoomType } from '../config/office';
import { findFreeSpot, fitError, isManager, isTvStudio, newRoom, tvControlRooms } from './office';
import { headquartersMissing, licensedChannels, masterControlRoom } from './control';
import { resaleValue } from './tech';
import { GRACE } from '../config/balance';
import { formatDate } from './calendar';
import { Rng } from './rng';
import { addMessage, emptyLedger, newId, PLAYER, type GameState, type Guide, type RentedRoom } from './state';

/**
 * Bump this whenever GameState changes shape, and add a migration from the
 * previous version to MIGRATIONS so older saves keep loading.
 */
export const SAVE_VERSION = 33;

export interface SaveFile {
  version: number;
  /** Real-world timestamp (ms) of when the save was made. */
  savedAt: number;
  state: GameState;
}

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/**
 * A room of a save from before version 21 where it stood then: such a room had
 * only its id, and its place was that of the room with that id in the building.
 * A room that has a place of its own keeps it.
 */
function onOldPlan<T extends { roomId: string }>(room: T): T & RentedRoom {
  if (typeof (room as Partial<RentedRoom>).x === 'number') return room as T & RentedRoom;
  // The building had three floors then.
  const plot = [...plotsOf(BUILDINGS.standard).filter((r) => r.floor <= 3), RECEPTION].find((r) => r.id === room.roomId);
  if (!plot) throw new SaveError(`This save has a room the building never had (${room.roomId}).`);
  const { name, floor, x, y, w, h, door, fixed } = newRoom(plot);
  return { name, floor, x, y, w, h, door, ...(fixed && { fixed }), ...room } as T & RentedRoom;
}

/** MIGRATIONS[n] upgrades a version-n state to version n + 1. */
const MIGRATIONS: Record<number, Migration> = {
  // Phase 0 saves only had a date and money: start a fresh company on the same day and seed.
  1: (old) => ({ ...createInitialState(Number(old.seed)), day: old.day }) as unknown as Record<string, unknown>,
  // Phase 1 → 2: staff levels, sponsors, marketing, loans, floors and four rivals.
  // Written to skip anything already present, because migration 1 produces a current-shape state.
  2: (old) => migrateToPhase2(old),
  // Phase 2 → 3: TV. The public broadcaster gets its TV channel; licenses issued so far count as issued.
  3: (old) => migrateToPhase3(old),
  // Phase 3 → 4a: R&D. Existing furniture is tier 1; no techs researched yet.
  4: (old) => {
    const s = structuredClone(old) as any;
    s.techs ??= [];
    for (const room of s.rooms) room.furniture = room.furniture.map((f: object) => ({ tier: 1, ...f }));
    return s;
  },
  // Phase 4a → 4b: the living office. Everything starts clean, in good repair and in a normal mood.
  5: (old) => {
    const s = structuredClone(old) as any;
    s.employees = s.employees.map((e: object) => ({ morale: MORALE.neutral, location: null, ...e }));
    s.rooms = s.rooms.map((room: { furniture: object[] }) => ({
      cleanliness: 100,
      issue: null,
      ...room,
      furniture: room.furniture.map((f) => ({ condition: 100, ...f })),
    }));
    return s;
  },
  // Phase 4b → 4c: events and poaching. Rival hosts get names; no auctions, offers or headlines yet.
  6: (old) => {
    const s = structuredClone(old) as any;
    const rng = new Rng(s.rngState);
    for (const show of s.rivals.flatMap((r: any) => r.channels).flatMap((c: any) => c.schedule)) {
      show.hostName ??= getGenre(show.genre).kind === 'produced' ? personName(rng) : '';
    }
    s.rngState = rng.state;
    s.rightsAuctions ??= [];
    s.eventRights ??= [];
    s.poachOffers ??= [];
    s.lastPoachDay ??= null;
    s.headlines ??= [];
    return s;
  },
  // Phase 4c → 5a: difficulty. Older games were all played at what is now normal.
  7: (old) => {
    const s = structuredClone(old) as any;
    s.difficulty ??= 'normal';
    s.dividendsPaid ??= 0;
    s.ledger = { ...emptyLedger(), ...s.ledger };
    s.monthlyReports = s.monthlyReports.map((r: object) => ({ dividends: 0, ...r }));
    return s;
  },
  // Phase 5a → 5b: milestones start empty and are picked up on the next day; daily results gain listeners per region.
  8: (old) => {
    const s = structuredClone(old) as any;
    s.milestones ??= [];
    const withRegions = (day: { channels: object[] }) => ({ ...day, channels: day.channels.map((c) => ({ regionListeners: {}, ...c })) });
    s.lastDay = s.lastDay && withRegions(s.lastDay);
    s.week = s.week.map(withRegions);
    return s;
  },
  // Lore: the public broadcaster is EPB, with EPB Radio 1, EPB Radio 2 and EPB-TV.
  9: (old) => {
    const s = structuredClone(old) as any;
    const spec = PERSONALITIES.highbrow;
    for (const rival of s.rivals.filter((r: { personality: string }) => r.personality === 'highbrow')) {
      rival.name = spec.company;
      const radio = rival.channels.filter((c: { medium: string }) => c.medium === 'radio');
      const rename = (channel: any, to: { name?: string; initials?: string } | undefined) => {
        if (!channel || !to?.name) return;
        channel.name = to.name;
        channel.logo = { ...channel.logo, initials: to.initials ?? channel.logo.initials };
      };
      radio.forEach((channel: object, i: number) => rename(channel, spec.channels[i]));
      rename(rival.channels.find((c: { medium: string }) => c.medium === 'tv'), spec.tv);
    }
    return s;
  },
  // Phase 5c: ratings by audience, and weekly reports by region and audience. Older reports show none.
  10: (old) => {
    const s = structuredClone(old) as any;
    const withAudiences = (day: { channels: object[] }) => ({ ...day, channels: day.channels.map((c) => ({ audienceListeners: {}, ...c })) });
    s.lastDay = s.lastDay && withAudiences(s.lastDay);
    s.week = s.week.map(withAudiences);
    s.weeklyReports = s.weeklyReports.map((r: { channels: object[] }) => ({
      ...r,
      channels: r.channels.map((c) => ({ regionListeners: {}, audienceListeners: {}, ...c })),
    }));
    return s;
  },
  // Phase 5d: events and renewal rounds. Existing licenses get a staggered first expiry, five to eight years from now.
  11: (old) => {
    const s = structuredClone(old) as any;
    s.prestige ??= 0;
    s.licenseBars ??= [];
    s.ledger = { ...emptyLedger(), ...s.ledger };
    s.monthlyReports = s.monthlyReports.map((r: object) => ({ events: 0, renewals: 0, ...r }));
    s.channels = s.channels.map((c: object) => ({ lastEventDay: null, ...c }));
    s.auctions = s.auctions.map((a: object) => ({ holder: null, ...a }));
    let index = 0;
    s.licenses = s.licenses.map((l: object) => ({ expiresOn: staggeredExpiry(s.day, index++), ...l }));
    for (const channel of s.rivals.flatMap((r: any) => r.channels)) {
      channel.licenseExpiry ??= Object.fromEntries(channel.regionIds.map((r: string) => [r, staggeredExpiry(s.day, index++)]));
    }
    return s;
  },
  // Phase 5g: furniture can be turned. Everything placed before stands the way it did.
  12: (old) => {
    const s = structuredClone(old) as any;
    for (const room of s.rooms) room.furniture = room.furniture.map((f: object) => ({ turn: 0, ...f }));
    return s;
  },
  // Phase 8b: the player and the company have a name, and the headquarters a region. Older games get
  // stand-in names, which can be changed in the settings, and were all played from Coaxia.
  13: (old) => ({ ...DEFAULT_SETUP, ...structuredClone(old) }),
  // More furniture: a canteen now needs a fridge and two counters. Canteens that worked get them for
  // nothing, where there is room, so nobody loses their lunch over an update.
  14: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    for (const room of s.rooms.filter((r) => r.type === 'canteen' && r.furniture.some((f) => f.type === 'canteenTable') && r.furniture.some((f) => f.type === 'coffeeMachine'))) {
      for (const type of ['fridge', 'counter', 'counter'] as const) {
        const spot = firstFit(onOldPlan(room), type);
        if (spot) room.furniture.push({ id: `f${s.nextId++}`, type, ...spot, turn: 0, tier: 1, condition: 100, boughtOn: s.day });
      }
    }
    return s as unknown as Record<string, unknown>;
  },
  // The tutorial: a company that is on the air doesn't get Penny Cash at the door (Settings calls her in);
  // one that has yet to start is asked whether it wants her.
  15: (old) => ({ ...structuredClone(old), guide: { stage: Array.isArray(old.licenses) && old.licenses.length > 0 ? 'off' : 'offer', seen: [], quiet: 0 } }),
  // Managers now work at a manager's desk in a management office. A company that already has managers gets
  // such an office with a desk for each of them for nothing, in the first rooms that stand empty, so its
  // channels stay on the air; it pays the rent from then on. Without an empty room it is told what to do.
  16: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    let waiting = s.employees.filter((e) => isManager(e.role)).length;
    if (waiting === 0) return s as unknown as Record<string, unknown>;
    const rooms: string[] = [];
    for (const layout of plotsOf(BUILDINGS.standard)) {
      if (waiting === 0) break;
      if (layout.floor > s.floorsUnlocked || s.rooms.some((r) => r.roomId === layout.id)) continue;
      const room: RentedRoom = { ...newRoom(layout), type: 'managementOffice' };
      for (let spot = firstFit(room, 'managerDesk'); spot && waiting > 0; spot = firstFit(room, 'managerDesk'), waiting--) {
        room.furniture.push({ id: `f${s.nextId++}`, type: 'managerDesk', ...spot, turn: 0, tier: 1, condition: 100, boughtOn: s.day });
      }
      s.rooms.push(room);
      rooms.push(layout.name);
    }
    const where = rooms.length > 0 ? `${rooms.join(' and ')} ${rooms.length === 1 ? 'is' : 'are'} now a management office, with a desk for each of them and no charge but the rent.` : '';
    const short = waiting > 0 ? ` ${rooms.length > 0 ? `${waiting} of them still have` : 'They have'} no desk: build a room, make it a management office and put manager’s desks in it. A channel whose manager has no desk is off the air.` : '';
    s.messages.push({ id: s.nextMessageId++, day: s.day, kind: waiting > 0 ? 'danger' : 'info', text: `Managers now work in a management office of their own. ${where}${short}`.trim() });
    return s as unknown as Record<string, unknown>;
  },
  // The player has a character of their own: in older saves, one picked by their name.
  17: (old) => ({ ...structuredClone(old), look: defaultLook(String(old.playerName ?? '')) }),
  // A host presents one show a day from here on. Hosts who present more keep their shows, at the salary
  // they were hired at; the rule holds for every show that is made or given another host.
  18: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    const busy = s.employees.filter((e) => e.role === 'host' && s.shows.filter((show) => show.hostId === e.id).length > 1);
    if (busy.length > 0) {
      const names = busy.length <= 3 ? busy.map((e) => e.name).join(busy.length === 2 ? ' and ' : ', ') : `${busy.length} of your hosts`;
      const text = `A host now presents one show a day. ${names} ${busy.length === 1 ? 'keeps' : 'keep'} the shows they have, but a show you make or give another host needs someone who has none. Hosts you hire from now on cost less.`;
      s.messages.push({ id: s.nextMessageId++, day: s.day, kind: 'info', text });
    }
    return s as unknown as Record<string, unknown>;
  },
  // A new company opens sales, marketing, research and the rest one at a time. A game from before that keeps everything open.
  19: (old) => ({ ...structuredClone(old), unlocked: [...FEATURES] }),
  // A room carries its own place from here on: its name, its floor, its rectangle and its door. The rooms of an
  // older game get the place they had in the building, so they stay where they are.
  20: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.rooms = s.rooms.map(onOldPlan);
    return s as unknown as Record<string, unknown>;
  },
  // A company is in a building of its own kind from here on: the long one of two floors in the countryside for
  // a new company there. A game from before stays in the building it has, with three floors, wherever it is.
  21: (old) => ({ ...structuredClone(old), building: 'standard' }),
  // Furniture is worth less as it gets older, so every piece knows the day it was bought. Nobody knows that of
  // the pieces of an older game: they are taken to be as old as what they sold for until now says, half their
  // price, and go on from there.
  22: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    for (const room of s.rooms) for (const item of room.furniture) item.boughtOn = s.day - AGE_AT_HALF_PRICE;
    return s as unknown as Record<string, unknown>;
  },
  // Staff can be given a workplace of their own. Nobody in an older game has one: they go on taking what is free.
  23: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    for (const employee of s.employees) employee.desk = null;
    return s as unknown as Record<string, unknown>;
  },
  // Uncle Tabby saves a company from bankruptcy once. A game from before still has that coming, unless it is over already.
  24: (old) => ({ ...old, bailedOut: false }),
  // A game show and a soap opera have a studio of their own kind, and each of the three sets stands only in
  // the studio of its show. A studio that made nothing but game shows or soaps becomes that kind of studio,
  // furniture and all. Where one studio made both kinds of show, the game shows or soaps lose it and say so.
  25: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    for (const { genre, was, now, decor } of OWN_STUDIOS) {
      for (const room of s.rooms.filter((r) => r.type === was.type && r.furniture.some((f) => f.type === decor))) {
        const made = s.shows.filter((show) => show.studioId === room.roomId);
        // The talk show set says that a talk show studio is one, whatever is on the air.
        const stays = made.some((show) => show.genre !== genre) || (was.type === 'tvTalkStudio' && room.furniture.some((f) => f.type === 'set'));
        if (stays) {
          for (const show of made.filter((sh) => sh.genre === genre)) {
            show.studioId = null;
            addMessage(s, 'warning', `“${show.name}” needs a ${now.name} now: ${room.name} is for other shows. Build one, or it stays off the air.`);
          }
          continue;
        }
        // A room that was called after its kind is called after its new one, with the first number that is free.
        const named = new RegExp(`^${was.name}( \\d+)?$`).test(room.name);
        room.type = now.type;
        if (named) for (let n = 1; ; n++) if (!s.rooms.some((r) => r.name === `${now.name} ${n}`)) { room.name = `${now.name} ${n}`; break; }
      }
    }
    return s as unknown as Record<string, unknown>;
  },
  // Staff can be sent on a course, which is booked on a line of its own; the company gets to know its
  // sponsors; and Penny has a chapter about television. In an older game nobody is on a course, and every
  // sponsor under contract is known at level 1.
  26: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    for (const employee of s.employees) employee.trainingUntil = null;
    s.ledger.training = 0;
    for (const report of s.monthlyReports) report.training = 0;
    s.relations = Object.fromEntries(s.contracts.map((c) => [c.sponsor, { level: 1, points: 0 }]));
    // Penny's word about television is an offer to walk the player through it now. Whoever heard the old one is not taken by the hand unasked.
    if (s.guide.seen.includes('television')) s.guide.seen.push('television-later');
    return s as unknown as Record<string, unknown>;
  },
  // 0.12.0: salaries, rent and license fees are paid every day instead of on the 1st, so what had built up this
  // month is paid now. A title is paid by the airing: the titles in the library were paid for when they were bought.
  // Milestones bring money, and the ledger keeps the airings and the gifts apart.
  27: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.money -= s.ledger.salaries + s.ledger.rent + s.ledger.licenseFees;
    for (const title of s.library) title.perAiring = 0;
    s.ledger.titles ??= 0;
    s.ledger.gifts ??= 0;
    for (const report of s.monthlyReports) {
      report.titles ??= 0;
      report.gifts ??= 0;
    }
    return s as unknown as Record<string, unknown>;
  },
  // 0.13.0: the books keep what sponsors added and teleshopping fees apart (as part of the revenue, from now on);
  // the week's figures per slot start with the next week; a campaign knows how long it runs and whether it repeats.
  28: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.ledger.sponsorRevenue ??= 0;
    s.ledger.fees ??= 0;
    for (const report of s.monthlyReports) {
      report.sponsorRevenue ??= 0;
      report.fees ??= 0;
    }
    s.weekAgo ??= {};
    for (const campaign of s.campaigns) {
      campaign.weeks ??= Math.max(1, Math.ceil((campaign.endDay - s.day) / 7));
      campaign.repeat ??= false;
    }
    return s as unknown as Record<string, unknown>;
  },
  // 0.14.0: writers write shows, and a sitcom, a soap and reality TV have no host: a cast plays them. The production
  // studio makes way for a studio of each kind (see `fromProductionStudio`). Video editors edit TV shows; a host who
  // goes works out a notice first, and a weak one can go into the talent programme.
  29: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    for (const employee of s.employees) {
      employee.leaving ??= null;
      employee.talentUntil ??= null;
    }
    for (const show of s.shows) {
      show.writerIds ??= [];
      show.editorIds ??= [];
    }
    for (const show of s.rivals.flatMap((r) => r.channels).flatMap((c) => c.schedule)) if (!hasHost(getGenre(show.genre))) show.hostName = '';
    for (const show of s.shows) {
      const genre = getGenre(show.genre);
      if (genre.kind !== 'produced' || hasHost(genre)) continue;
      const host = s.employees.find((e) => e.id === show.hostId);
      show.hostId = null;
      addMessage(s, 'warning', `A ${genre.name.toLowerCase()} has no host any more: its writers make it and a cast plays it. “${show.name}” needs writers now: build a writers’ room and hire them.${host ? ` ${host.name} is free for another show.` : ''}`, undefined, 'staff');
    }
    for (const room of s.rooms.filter((r) => (r.type as string) === 'tvProductionStudio')) fromProductionStudio(s, room);
    return s as unknown as Record<string, unknown>;
  },
  // 0.15.0: teams meet in a meeting room, and a team whose morale stays low threatens to strike. The canteen gives
  // less morale than before (the cook, the meetings and the post make up the rest): morale drifts there by itself.
  30: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.meetings ??= {};
    s.unrest ??= {};
    return s as unknown as Record<string, unknown>;
  },
  // 0.16.0: one manager, editor or audio engineer to a room (the extra desks are sold back); a CEO's office and a
  // reception desk before anything goes on the air; a master control room for every channel; a control room of
  // its own for every TV studio. A game that lacks one of the last three gets a month to put it right.
  31: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.offAir ??= {};
    s.grace ??= {};
    sellExtraDesks(s);
    const until = (days: number) => s.day + days;
    // A company that is not on the air yet will hear of it when it gets there.
    if (licensedChannels(s).length > 0 && headquartersMissing(s).length > 0) {
      s.grace.headquarters = until(GRACE.days);
      const what = headquartersMissing(s).map((m) => (m === 'ceoOffice' ? 'a CEO’s office with your desk in it' : 'a desk at the reception')).join(' and ');
      addMessage(s, 'warning', `A company needs ${what} before anything goes on the air. Your channels go on until ${formatDate(s.grace.headquarters)}: put ${headquartersMissing(s).length === 1 ? 'it' : 'them'} in before then.`);
    }
    if (licensedChannels(s).length > 0 && !masterControlRoom(s)) {
      s.grace.masterControl = until(GRACE.days);
      addMessage(s, 'warning', `Every channel goes out through a master control room now, with a technician at its desk. Build one before ${formatDate(s.grace.masterControl)}, or your channels go off the air.`, undefined, 'broadcast:channels');
    }
    const paired = tvControlRooms(s);
    const waiting = s.rooms.filter((r) => isTvStudio(r.type) && !CONTROL_ROOM_KIT.every((type) => paired.get(r.roomId)?.furniture.some((f) => f.type === type)));
    if (waiting.length > 0) {
      s.grace.controlRooms = until(GRACE.days);
      const names = waiting.map((r) => r.name);
      addMessage(s, 'warning', `Every TV studio has a control room of its own now, next door, with a control desk and an audio mixer that a technician works. ${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} none yet: build ${names.length === 1 ? 'it' : 'them'} before ${formatDate(s.grace.controlRooms)}. A control desk that stands in a studio can be moved there.`);
    }
    return s as unknown as Record<string, unknown>;
  },
  // 0.18.0: music shows pay royalties, kept on a ledger line of their own.
  32: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.ledger.royalties ??= 0;
    for (const report of s.monthlyReports) report.royalties ??= 0;
    return s as unknown as Record<string, unknown>;
  },
};

/**
 * The desks beyond the first in a room that holds one (0.16.0) are sold back
 * for what they are worth. The desk a channel manager has as their own is
 * kept before anyone else's, then any desk that is someone's own, then the
 * first; whoever had a desk that went looks for a free one.
 */
function sellExtraDesks(s: GameState): void {
  let refund = 0;
  const kinds = new Set<RoomType>();
  for (const room of s.rooms) {
    const type = room.type ? ONE_DESK_ROOMS[room.type] : undefined;
    if (!type) continue;
    const desks = room.furniture.filter((f) => f.type === type);
    if (desks.length <= 1) continue;
    const ownerOf = (id: string) => s.employees.find((e) => e.desk === id);
    const keep = desks.find((d) => ownerOf(d.id)?.role === 'channelManager') ?? desks.find((d) => ownerOf(d.id)) ?? desks[0]!;
    for (const desk of desks.filter((d) => d !== keep)) {
      refund += resaleValue(desk, s.day);
      for (const e of s.employees) if (e.desk === desk.id) e.desk = null;
    }
    room.furniture = room.furniture.filter((f) => f.type !== type || f === keep);
    kinds.add(room.type!);
  }
  if (kinds.size === 0) return;
  s.money += refund;
  s.ledger.purchases -= refund;
  const rooms = [...kinds].map((k) => inText(ROOM_TYPE_NAMES[k])).join(', ');
  addMessage(s, 'danger', `One desk to a room now: every manager, video editor and audio engineer works in a room of their own. The extra desks in your ${rooms} were sold back for €${Math.round(refund).toLocaleString('en-IE')}. Whoever lost their desk needs a room of their own: a channel whose manager has no desk is off the air.`, undefined, 'staff');
}

/** What became of the production studio in 0.14.0: a studio for each of the shows that were made in it, with the decor it now needs. */
const NEW_STUDIOS: readonly { genre: GenreId; type: RoomType; name: string; decor: readonly FurnitureType[] }[] = [
  { genre: 'sitcom', type: 'tvSitcomStudio', name: 'TV sitcom studio', decor: ['sitcomSet'] },
  { genre: 'kids', type: 'tvKidsStudio', name: 'TV kids’ studio', decor: ['kidsSet'] },
  { genre: 'reality', type: 'tvRealityStudio', name: 'TV reality studio', decor: ['realitySet', 'confessionBooth'] },
];

/**
 * A production studio from before 0.14.0 becomes the studio of the kind most of
 * its shows are (a sitcom studio if it made none), and gets the decor of that
 * kind for free, where it fits: it was bought as a studio that needed none.
 * The shows of the other kinds made there need a studio of their own.
 */
function fromProductionStudio(s: GameState, room: RentedRoom): void {
  const made = s.shows.filter((show) => show.studioId === room.roomId);
  const kind = [...NEW_STUDIOS].sort((a, b) => made.filter((m) => m.genre === b.genre).length - made.filter((m) => m.genre === a.genre).length)[0]!;
  const named = /^TV production studio( \d+)?$/.test(room.name);
  room.type = kind.type;
  if (named) for (let n = 1; ; n++) if (!s.rooms.some((r) => r.name === `${kind.name} ${n}`)) { room.name = `${kind.name} ${n}`; break; }
  for (const show of made.filter((m) => m.genre !== kind.genre)) {
    show.studioId = null;
    const other = NEW_STUDIOS.find((k) => k.genre === show.genre);
    addMessage(s, 'warning', `“${show.name}” needs a ${other?.name ?? 'studio of its own'} now: ${room.name} is for ${getGenre(kind.genre).name.toLowerCase()}s. Build one, or it stays off the air.`);
  }
  const placed: string[] = [];
  for (const type of kind.decor) {
    const spot = findFreeSpot(s, room, type);
    if (!spot) {
      addMessage(s, 'warning', `${room.name} needs a ${FURNITURE[type].name.toLowerCase()}, and there was no room for one: make room and buy it in the furniture catalog.`);
      continue;
    }
    room.furniture.push({ id: newId(s, 'f'), type, ...spot, turn: 0, tier: 1, condition: 100, boughtOn: s.day });
    placed.push(FURNITURE[type].name.toLowerCase());
  }
  if (placed.length > 0) addMessage(s, 'good', `${room.name} was a production studio. It got a ${placed.join(' and a ')} for free: the studio of each kind of show has a decor of its own now.`);
}

/** The shows that got a studio of their own kind in step 25, with the names of the kinds as they were then: frozen with the step. */
const OWN_STUDIOS = [
  { genre: 'gameShow', decor: 'gameShowSet', was: { type: 'tvTalkStudio', name: 'TV talk show studio' }, now: { type: 'tvGameStudio', name: 'TV game show studio' } },
  { genre: 'soap', decor: 'soapSet', was: { type: 'tvProductionStudio', name: 'TV production studio' }, now: { type: 'tvSoapStudio', name: 'TV soap opera studio' } },
] as const;

/** The age in days at which a piece is worth half its price, as the game counted when pieces first got an age. */
const AGE_AT_HALF_PRICE = 920;

/** The first place in a room where a piece fits, row by row: how the older migrations put furniture down. */
function firstFit(room: RentedRoom, type: FurnitureType): { x: number; y: number } | null {
  for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) if (fitError(room, type, x, y, 0, undefined, false) === null) return { x, y };
  return null;
}

/** Phase 2 saves → Phase 3. Skips saves that already have TV fields (from migration 1). */
function migrateToPhase3(old: Record<string, unknown>): Record<string, unknown> {
  const s = structuredClone(old) as any;
  if (s.licensesIssued) return s;
  const rng = new Rng(s.rngState);
  s.viewers = 0;
  s.auctions = [];
  s.library = [];
  s.sportsRights = [];
  s.ledger = { ...emptyLedger(), ...s.ledger };
  s.offers = s.offers.map((o: object) => ({ medium: 'radio', ...o }));
  s.contracts = s.contracts.map((c: object) => ({ medium: 'radio', ...c }));
  s.weeklyReports = s.weeklyReports.map((r: { channels: object[] }) => ({
    ...r,
    channels: r.channels.map((c) => ({ medium: 'radio', ...c })),
  }));
  s.lastDay = null;
  s.week = [];

  const publicBroadcaster = s.rivals.find((r: { personality: string }) => r.personality === 'highbrow');
  if (publicBroadcaster && !publicBroadcaster.channels.some((c: { medium: string }) => c.medium === 'tv')) {
    const spec = PERSONALITIES.highbrow;
    const owner = { ...publicBroadcaster, logo: publicBroadcaster.channels[0].logo };
    publicBroadcaster.channels.push(generateRivalChannel(s, rng, owner, spec.tv, 'tv', spec.regions));
  }
  // Licenses that exist today were issued before TV arrived; only later ones are auctioned.
  s.licensesIssued = initialIssued(s.day);
  s.market = { titles: [], rights: [] };
  refreshMarket(s, rng);
  s.rngState = rng.state;
  return s;
}

/** Phase 1 saves → Phase 2. Old saves are untyped, hence the loose types here. */
function migrateToPhase2(old: Record<string, unknown>): Record<string, unknown> {
  const s = structuredClone(old) as any;
  if (s.offers) return s;
  const rng = new Rng(s.rngState);

  s.employees = s.employees.map((e: object) => ({ department: null, xp: 0, level: 1, ...e }));
  s.candidates = s.candidates.map((c: object) => ({ department: null, ...c }));
  // Phase 1 licenses cost €20,000; one bought but never given to a channel is refunded.
  for (const license of s.licenses.filter((l: { channelId: string | null }) => l.channelId === null)) {
    s.money += 20_000;
    s.licenses = s.licenses.filter((l: object) => l !== license);
  }
  s.licenses = s.licenses.map((l: object) => ({ price: 20_000, ...l }));
  s.ledger = { ...emptyLedger(), ...s.ledger };
  s.offers = [];
  s.contracts = [];
  s.campaigns = [];
  s.promotion = {};
  s.loan = null;
  s.floorsUnlocked = 1;

  // The Phase 1 rival becomes the youth station; the other three personalities join.
  for (const rival of s.rivals) rival.personality ??= 'youth';
  s.rivals = [...s.rivals, ...generateRivals(s, rng, ['news', 'cheap', 'highbrow'])];
  const rivalId: string | undefined = s.rivals[0]?.id;
  s.weeklyReports = s.weeklyReports.map((r: { channels: { isPlayer: boolean }[] }) => ({
    ...r,
    channels: r.channels.map((c) => ({ ownerId: c.isPlayer ? PLAYER : rivalId, ...c })),
  }));
  // Daily results are rebuilt by the next broadcast.
  s.lastDay = null;
  s.week = [];
  s.rngState = rng.state;
  return s;
}

export function toSaveFile(state: GameState, savedAt: number): SaveFile {
  return { version: SAVE_VERSION, savedAt, state };
}

export class SaveError extends Error {}

/** Validates and migrates an untrusted save (e.g. read from IndexedDB). */
export function fromSaveFile(data: unknown): SaveFile {
  if (!isRecord(data) || typeof data.version !== 'number' || typeof data.savedAt !== 'number' || !isRecord(data.state)) {
    throw new SaveError('Not a Broadcast Empire save file.');
  }
  if (data.version > SAVE_VERSION) {
    throw new SaveError(`This save is from a newer version of the game (v${data.version}).`);
  }

  let state = data.state;
  for (let v = data.version; v < SAVE_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) throw new SaveError(`No migration from save version ${v}.`);
    state = migrate(state);
  }

  if (!isGameState(state)) throw new SaveError('Save file is corrupted.');
  return { version: SAVE_VERSION, savedAt: data.savedAt, state };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const NUMBER_FIELDS = [
  'day', 'seed', 'rngState', 'nextId', 'money', 'dividendsPaid', 'prestige', 'listeners', 'viewers', 'researchPoints', 'reputation', 'nextMessageId', 'negativeMonths',
  'floorsUnlocked',
] as const;
const ARRAY_FIELDS = [
  'rooms', 'employees', 'candidates', 'licenses', 'channels', 'shows', 'rivals', 'week', 'weeklyReports', 'monthlyReports', 'messages',
  'offers', 'contracts', 'campaigns', 'auctions', 'library', 'sportsRights', 'techs', 'rightsAuctions', 'eventRights', 'poachOffers', 'headlines', 'milestones', 'licenseBars',
] as const;

const GUIDE_STAGES: readonly Guide['stage'][] = ['welcome', 'offer', 'on', 'off'];

/** A shallow shape check; enough to catch saves that are corrupted or from another app. */
function isGameState(value: Record<string, unknown>): value is Record<string, unknown> & GameState {
  return (
    NUMBER_FIELDS.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key])) &&
    ARRAY_FIELDS.every((key) => Array.isArray(value[key])) &&
    isRecord(value.ledger) &&
    isRecord(value.promotion) &&
    isRecord(value.relations) &&
    isRecord(value.licensesIssued) &&
    isRecord(value.market) &&
    typeof value.difficulty === 'string' &&
    typeof value.playerName === 'string' &&
    isLook(value.look) &&
    typeof value.companyName === 'string' &&
    ACTIVE_REGIONS.includes(value.headquarters as RegionId) &&
    typeof value.building === 'string' &&
    value.building in BUILDINGS &&
    typeof value.bailedOut === 'boolean' &&
    typeof value.bankrupt === 'boolean' &&
    isRecord(value.guide) &&
    GUIDE_STAGES.includes(value.guide.stage as Guide['stage']) &&
    Array.isArray(value.guide.seen) &&
    typeof value.guide.quiet === 'number'
  );
}
