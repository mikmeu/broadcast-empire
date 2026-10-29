import { FEATURES } from '../config/unlocks';
import { levelOf } from '../config/levels';
import { MILESTONE_LIST } from '../config/milestones';
import { hasPostRoom, hasServerRack, playsRecords, refreshMarket } from './content';
import { getGenre, hasHost, type GenreId } from '../config/genres';
import { generateRivalChannel, generateRivals, personName } from './generate';
import { initialIssued, staggeredExpiry } from './licenses';
import { ACTIVE_REGIONS, LIFE, MORALE } from '../config/balance';
import { birthAt } from './life';
import type { RegionId } from '../config/world';
import { PERSONALITIES } from '../config/rivals';
import { DEFAULT_SETUP, createInitialState } from './newGame';
import { defaultLook, isLook } from '../config/looks';
import { BUILDINGS, CONTROL_ROOM_KIT, FURNITURE, ONE_DESK_ROOMS, RECEPTION, ROOM_TYPE_NAMES, inText, plotsOf, receptionOf, type FurnitureType, type RoomType } from '../config/office';
import { buildingOf, findFreeSpot, fitError, isManager, isTvStudio, newRoom, placementError, tvControlRooms } from './office';
import { headquartersMissing, licensedChannels, masterControlRoom } from './control';
import { itemValue, ownedTier } from './tech';
import { BUILD_COST_PER_TILE, GRACE } from '../config/balance';
import { TECHS, getTech, techFor, unlockingTech, type TechId } from '../config/tech';
import { formatDate, toCalendarDate } from './calendar';
import { catchUpElections, startingPolitics } from './politics';
import { Rng } from './rng';
import { senderFor } from './inbox';
import { addMessage, emptyLedger, newId, PLAYER, type Furniture, type GameState, type Guide, type RentedRoom } from './state';

/**
 * Bump this whenever GameState changes shape, and add a migration from the
 * previous version to MIGRATIONS so older saves keep loading.
 */
export const SAVE_VERSION = 65;

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
    addMessage(s, waiting > 0 ? 'danger' : 'info', `Managers now work in a management office of their own. ${where}${short}`.trim());
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
      addMessage(s, 'info', text);
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
  // 0.17.0: a channel manager calls the meetings of their channel's production staff, and the hosts have none any
  // more. Their "Every month" goes, and a lift they still had ends.
  32: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.channelMeetings ??= {};
    delete s.meetings.hosts;
    return s as unknown as Record<string, unknown>;
  },
  // 0.17.0: recruiters. Nobody in the hiring pool was found by one yet.
  33: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    for (const candidate of s.candidates) candidate.foundFor ??= null;
    return s as unknown as Record<string, unknown>;
  },
  // 0.17.0: titles come by post, so a library and the titles bought for it need a post room with a sorting case,
  // until a library has a server rack. A game that has a library without either gets a month to build one.
  34: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.grace ??= {};
    if (s.rooms.some((r) => r.type === 'library') && !hasPostRoom(s) && !hasServerRack(s)) {
      s.grace.postRoom = s.day + GRACE.days;
      addMessage(s, 'warning', `Titles come by post now. Build a post room with a sorting case before ${formatDate(s.grace.postRoom)} to keep buying titles. Your library goes on airing what it has.`);
    }
    return s as unknown as Record<string, unknown>;
  },
  // 0.17.0: the inbox. Every message is an e-mail now, from whoever works at the desk it is about today, or from
  // Penny; the old ones count as read.
  35: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    for (const message of s.messages) {
      message.from ??= senderFor(s, message);
      message.read ??= true;
    }
    return s as unknown as Record<string, unknown>;
  },
  // 0.17.0: the player hears when a show on the air falls short of producers. A show that is short already is told
  // about on the first day.
  36: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.shortOfProducers ??= [];
    return s as unknown as Record<string, unknown>;
  },
  // 0.18.0: elections elect a president and a vice-president, and the government can fall. A game gets the
  // history a new game with its seed would have had, from the president it started with up to today.
  37: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.politics = startingPolitics(s);
    catchUpElections(s);
    return s as unknown as Record<string, unknown>;
  },
  // 0.18.0: a workshop, where a talent manager gives courses in the house. A course that is running is one outside;
  // a host in the talent programme finishes it, though a talent manager arranges it from now on.
  38: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    for (const employee of s.employees) employee.courseIn ??= null;
    return s as unknown as Record<string, unknown>;
  },
  // 0.18.0: radio and TV awards every five years. A game loaded between the nominations and the night waits for the
  // next awards night.
  39: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.awards ??= { nominations: null, past: [], raises: [] };
    return s as unknown as Record<string, unknown>;
  },
  // 0.18.0: a streaming service. No game from before has one; the books get a line for what subscribers pay
  // (part of the revenue) and one for what the service costs.
  40: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.streaming = null;
    s.ledger.subscriptions = 0;
    s.ledger.streaming = 0;
    for (const report of s.monthlyReports) {
      report.subscriptions = 0;
      report.streaming = 0;
    }
    return s as unknown as Record<string, unknown>;
  },
  // 0.18.0: music shows pay royalties, kept on a ledger line of their own.
  41: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.ledger.royalties ??= 0;
    for (const report of s.monthlyReports) report.royalties ??= 0;
    return s as unknown as Record<string, unknown>;
  },
  // 0.18.0: music shows need their records in the library. A station that already plays music keeps its
  // records for free, so none goes silent on load; they take no room from the library it may not have.
  42: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.records ??= [...new Set(s.shows.map((show) => show.genre).filter(playsRecords))];
    return s as unknown as Record<string, unknown>;
  },
  // 0.18.0: furniture can be put in storage. No game from before has any there.
  43: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.storage ??= [];
    return s as unknown as Record<string, unknown>;
  },
  // 0.18.0: a channel can have a social media account. None has one yet.
  44: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    for (const channel of s.channels) channel.social ??= null;
    return s as unknown as Record<string, unknown>;
  },
  // 0.18.0: the rooms of 0.16.0 cost an old game too much (#110). A game that was given time for them is paid what
  // the rooms built for them cost to build, once (a migration runs once), and gets time again for what is still missing.
  45: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.grace ??= {};
    const until = s.day + GRACE.days;
    // A rule that was given its time today (a save that comes through step 31 or 34 on the way) has built nothing
    // for it yet, and is not told again.
    const due = (rule: keyof typeof s.grace) => (s.grace[rule] ?? until) < until;
    const built = (rooms: RentedRoom[]) => rooms.reduce((sum, r) => sum + r.w * r.h * BUILD_COST_PER_TILE, 0);
    const paired = tvControlRooms(s);
    const controlRooms = due('controlRooms') ? [...paired.values()] : [];
    const master = due('masterControl') ? masterControlRoom(s) : undefined;
    const ceo = due('headquarters') ? s.rooms.filter((r) => r.type === 'ceoOffice').slice(0, 1) : [];
    const refund = built(controlRooms) + built(master ? [master] : []) + built(ceo);
    if (refund > 0) {
      s.money += refund;
      s.ledger.purchases -= refund;
      addMessage(s, 'good', `The new rules cost you rooms. I give back what the control rooms, the master control room and the CEO’s office cost to build: €${Math.round(refund).toLocaleString('en-IE')}.`, undefined, 'finance', 'tabby');
    }
    const renew = (rule: keyof typeof s.grace) => {
      s.grace[rule] = until;
      return formatDate(until);
    };
    if (due('headquarters') && licensedChannels(s).length > 0 && headquartersMissing(s).length > 0) {
      addMessage(s, 'warning', `Your company still lacks ${headquartersMissing(s).map((m) => (m === 'ceoOffice' ? 'a CEO’s office with your desk in it' : 'a desk at the reception')).join(' and ')}. Your channels go on until ${renew('headquarters')}.`);
    }
    if (due('masterControl') && licensedChannels(s).length > 0 && !masterControlRoom(s)) {
      addMessage(s, 'warning', `You still need a master control room. Your channels go on until ${renew('masterControl')}.`, undefined, 'broadcast:channels');
    }
    const waiting = s.rooms.filter((r) => isTvStudio(r.type) && !CONTROL_ROOM_KIT.every((type) => paired.get(r.roomId)?.furniture.some((f) => f.type === type)));
    if (due('controlRooms') && waiting.length > 0) {
      addMessage(s, 'warning', `${waiting.map((r) => r.name).join(', ')} still ${waiting.length === 1 ? 'has' : 'have'} no control room with a control desk and an audio mixer. You have until ${renew('controlRooms')}.`);
    }
    if (due('postRoom') && s.rooms.some((r) => r.type === 'library') && !hasPostRoom(s) && !hasServerRack(s)) {
      addMessage(s, 'warning', `Your library still needs a post room with a sorting case. You have until ${renew('postRoom')}.`);
    }
    return s as unknown as Record<string, unknown>;
  },
  // 0.19.0: two rooms can be joined into one (RentedRoom.parts). No saved room has parts: a room without them is its box.
  46: (old) => structuredClone(old),
  // 0.19.0: lawsuits. Every show is of normal tone, nobody has been sued, and the books get a line for the legal costs.
  47: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    for (const show of s.shows) show.tone ??= 'normal';
    s.lawsuits ??= [];
    s.ledger.legal ??= 0;
    for (const report of s.monthlyReports) report.legal ??= 0;
    return s as unknown as Record<string, unknown>;
  },
  // 0.19.0: level-ups are told in the monthly report, so the month's count is kept. Nobody has levelled up yet.
  48: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.levelUps ??= { count: 0, raise: 0, name: null };
    return s as unknown as Record<string, unknown>;
  },
  // 0.19.0: a control room beside a radio studio holds an audio mixer, not a mixing desk (#137). A mixing desk in a
  // control room becomes an audio mixer in the same place (both are 2×1), at no cost, with its condition kept.
  49: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    const owned = ownedTier(s, 'tv');
    let swapped = 0;
    for (const room of s.rooms) {
      if (room.type !== 'controlRoom') continue;
      for (const f of room.furniture) {
        if (f.type !== 'mixingDesk') continue;
        f.type = 'audioMixer';
        f.tier = Math.max(1, Math.min(f.tier, owned));
        swapped++;
      }
    }
    if (swapped > 0) {
      addMessage(s, 'info', `A radio control room holds an audio mixer now, not a mixing desk: the mixing desk is for presenters who run their own. I swapped ${swapped === 1 ? 'the one' : `the ${swapped}`} in your control ${swapped === 1 ? 'room' : 'rooms'} for ${swapped === 1 ? 'an audio mixer' : 'audio mixers'}, at no cost.`, undefined, undefined, 'tabby');
    }
    return s as unknown as Record<string, unknown>;
  },
  // 0.19.0: the broadcasting authority. Nobody has complained; every license starts with a clean record, counted from the day
  // the game is loaded; the books get a line for fines. A title already bought is not for adults.
  50: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.complaints ??= [];
    for (const license of s.licenses) license.record ??= { upheld: 0, newsSlots: 0, slots: 0 };
    s.ledger.fines ??= 0;
    for (const report of s.monthlyReports) report.fines ??= 0;
    return s as unknown as Record<string, unknown>;
  },
  // 0.20.0: age, leave, sickness, retirement and death (#174). Everyone, on the staff and in the pool, is 18 to 26 on the day
  // the game is loaded (drawn from a hash of their id), so an old game has no wave of retirements; nobody is away.
  51: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    for (const person of [...s.employees, ...s.candidates]) person.bornOn ??= birthAt(s, person.id, LIFE.startAges.min, LIFE.startAges.max);
    for (const employee of s.employees) employee.away ??= null;
    return s as unknown as Record<string, unknown>;
  },
  // 0.20.0: the leader of a team e-mails the minutes of a meeting (#151). Every team and channel that meets starts with them on.
  52: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    for (const meeting of [...Object.values(s.meetings), ...Object.values(s.channelMeetings)]) if (meeting) meeting.minutes ??= true;
    return s as unknown as Record<string, unknown>;
  },
  // 0.20.0: merchandise (#32). A show on the air starts with half its last quality as fans, so an established show does not
  // start from nothing; the rest start with none. The books get a line for what merchandise sold for.
  53: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    const quality = new Map<string, number>();
    for (const slot of (s.lastDay?.channels ?? []).filter((c) => c.isPlayer).flatMap((c) => c.slots)) if (slot.showId && !slot.titleId) quality.set(slot.showId, Math.min(1, slot.quality));
    for (const show of s.shows) show.fans ??= (quality.get(show.id) ?? 0) / 2;
    s.ledger.merchandise ??= 0;
    for (const report of s.monthlyReports) report.merchandise ??= 0;
    return s as unknown as Record<string, unknown>;
  },
  // 0.20.0: theme weeks (#180). No radio channel has booked one.
  54: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.themeWeeks ??= [];
    return s as unknown as Record<string, unknown>;
  },
  // 0.20.0: phone lines (#31). The books get a line for what viewers paid to vote. The call agent, the call centre and the
  // rule "votes" are only new values.
  55: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.ledger.votes ??= 0;
    for (const report of s.monthlyReports) report.votes ??= 0;
    return s as unknown as Record<string, unknown>;
  },
  // 0.20.0: shows sold to rival channels and studios let out (#148). None runs; the books get a line for each.
  56: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.showSales ??= [];
    s.studioLets ??= [];
    s.ledger.showSales ??= 0;
    s.ledger.studioLets ??= 0;
    for (const report of s.monthlyReports) {
      report.showSales ??= 0;
      report.studioLets ??= 0;
    }
    return s as unknown as Record<string, unknown>;
  },
  // 0.20.0: news vans (#20). The company owns none, and the books get a line for their trips. The journalist is only a new value.
  57: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.vans ??= [];
    s.ledger.newsVans ??= 0;
    for (const report of s.monthlyReports) report.newsVans ??= 0;
    return s as unknown as Record<string, unknown>;
  },
  // 0.20.0: breaking news (#21). No story has been told and the player has broken in nowhere.
  58: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.breakingNews ??= { stories: [], told: [], breakIns: [] };
    return s as unknown as Record<string, unknown>;
  },
  // 0.20.0: a U-shaped office for Coax City (#193). A company in the capital moves from the standard building to the courtyard
  // one. Its rooms stay where they are (the north wing is where the standard building stood); the reception, if it has an
  // entry of its own for the desk, moves with the core to the middle of the west wing, and its furniture with it.
  59: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    if (s.building !== 'standard' || s.headquarters !== 'capital') return s as unknown as Record<string, unknown>;
    s.building = 'courtyard';
    const { x: dx, y: dy } = BUILDINGS.courtyard.core;
    for (const room of s.rooms) {
      if (room.roomId !== RECEPTION.id) continue;
      room.x += dx;
      room.y += dy;
      room.door = { x: room.door.x + dx, z: room.door.z + dy };
    }
    addMessage(s, 'info', 'Your building in Coax City has grown: each floor is now a U around a courtyard, with the stairs and the reception in the west wing. Your rooms are where they were.');
    return s as unknown as Record<string, unknown>;
  },
  // 0.20.0: company levels (#205). The XP is that of the milestones reached; the level is what it comes to, and Uncle Tabby
  // pays nothing back. Everything stays open: every feature, and every floor of the building.
  60: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    s.xp ??= s.milestones.reduce((sum, m) => sum + (MILESTONE_LIST.find((l) => l.id === m.id)?.xp ?? 0), 0);
    s.level ??= levelOf(s.xp);
    s.unlocked = [...FEATURES];
    s.floorsUnlocked = buildingOf(s).floors;
    return s as unknown as Record<string, unknown>;
  },
  // 0.20.0: research by decade (#206). The decades up to the current year are open, and that of the newest technology
  // already researched: a game in 1977 that has Music video format keeps the 1980s.
  61: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    const decadeOf = (year: number) => Math.floor(year / 10) * 10;
    const newest = Math.max(1970, ...TECHS.filter((t) => s.techs.includes(t.id)).map((t) => decadeOf(t.year)));
    s.decadeReached ??= Math.max(newest, decadeOf(toCalendarDate(s.day).year));
    return s as unknown as Record<string, unknown>;
  },
  // 0.20.0: jobs and genres are researched (#207). A game that already hires audio engineers, video editors, music schedulers or
  // call agents, makes talk shows, sitcoms or kids' shows, has one of their desks or sets or has a van, gets the technology.
  62: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    const needed = new Set<TechId>();
    for (const e of s.employees) {
      const tech = techFor(e.role);
      if (tech) needed.add(tech.id);
    }
    for (const show of s.shows) {
      const tech = unlockingTech(show.genre);
      if (tech) needed.add(tech.id);
    }
    for (const room of s.rooms) {
      for (const f of room.furniture) {
        const unlock = FURNITURE[f.type]?.unlock;
        if (unlock) needed.add(unlock);
      }
    }
    if (s.vans.length > 0) needed.add('newsGathering');
    for (const id of needed) if (!s.techs.includes(id)) s.techs.push(id);
    // A technology of a later decade keeps that decade open, as in version 61.
    s.decadeReached = Math.max(s.decadeReached, ...[...needed].map((id) => Math.floor(getTech(id).year / 10) * 10));
    return s as unknown as Record<string, unknown>;
  },
  // 0.20.0: Transponder Valley's building from its drawing (#223). A company in Transponder Valley moves from the standard building
  // to the valley one, 37 by 21 tiles a floor. The standard building stands in its north-west corner, so its rooms stay where they
  // are; the core moves to the south-east corner, facing south: the reception, if it has an entry of its own for the desk, is the
  // new hall, and its furniture is put down again in it (the hall is 5 wide and 4 deep now, not 4 by 5).
  63: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    if (s.building !== 'standard' || s.headquarters !== 'north') return s as unknown as Record<string, unknown>;
    s.building = 'valley';
    const hall = s.rooms.find((r) => r.roomId === RECEPTION.id);
    const left: string[] = [];
    if (hall) {
      const want = receptionOf(BUILDINGS.valley);
      const pieces = hall.furniture;
      Object.assign(hall, { x: want.x, y: want.y, w: want.w, h: want.h, door: { ...want.door } });
      hall.furniture = [];
      for (const piece of pieces) {
        const spot = placeAgain(s, hall, piece);
        if (spot) hall.furniture.push({ ...piece, ...spot });
        else {
          // No room for it: put away, as it was, where it can be placed again or sold.
          s.storage.push(piece);
          left.push(FURNITURE[piece.type].name.toLowerCase());
        }
      }
    }
    addMessage(s, 'info', 'Your building in Transponder Valley has grown: it is now the whole block of your drawing, with the stairs and the reception in its south-east corner and the entrance on the street to the south. Your rooms are where they were.');
    if (left.length > 0) addMessage(s, 'warning', `The new reception is a little smaller than the old one, and there was no room for the ${left.join(', the ')}. ${left.length > 1 ? 'They are' : 'It is'} in storage: place ${left.length > 1 ? 'them' : 'it'} again, or sell ${left.length > 1 ? 'them' : 'it'}.`);
    return s as unknown as Record<string, unknown>;
  },
  // 0.20.0: Skywave Beach's building from its drawing (#224). A company in Skywave Beach moves from the standard building to the beach
  // one, 63 by 21 tiles a floor. The standard building stands in its east wing, so its rooms stay where they are; the core moves to the
  // north of the hall between the wings, facing north: the reception is the new hall, and its furniture is put down again in it.
  64: (old) => {
    const s = structuredClone(old) as unknown as GameState;
    if (s.building !== 'standard' || s.headquarters !== 'coast') return s as unknown as Record<string, unknown>;
    s.building = 'beach';
    const hall = s.rooms.find((r) => r.roomId === RECEPTION.id);
    const left: string[] = [];
    if (hall) {
      const want = receptionOf(BUILDINGS.beach);
      const pieces = hall.furniture;
      Object.assign(hall, { x: want.x, y: want.y, w: want.w, h: want.h, door: { ...want.door } });
      hall.furniture = [];
      for (const piece of pieces) {
        const spot = placeAgain(s, hall, piece);
        if (spot) hall.furniture.push({ ...piece, ...spot });
        else {
          s.storage.push(piece);
          left.push(FURNITURE[piece.type].name.toLowerCase());
        }
      }
    }
    addMessage(s, 'info', 'Your building in Skywave Beach has grown: it is now the whole block of your drawing, two wings with the stairs and the reception between them and the entrance on the street to the north, by the bus stop. Your rooms are where they were.');
    if (left.length > 0) addMessage(s, 'warning', `The new reception is a little smaller than the old one, and there was no room for the ${left.join(', the ')}. ${left.length > 1 ? 'They are' : 'It is'} in storage: place ${left.length > 1 ? 'them' : 'it'} again, or sell ${left.length > 1 ? 'them' : 'it'}.`);
    return s as unknown as Record<string, unknown>;
  },
};

/** Where a piece of furniture goes in a room it is put down in again, in the turn it had if it fits that way, from the wall across from the door; null if it fits nowhere. */
function placeAgain(s: GameState, room: RentedRoom, piece: Furniture): { x: number; y: number; turn: number } | null {
  const rows = [...Array(room.h).keys()];
  const columns = [...Array(room.w).keys()];
  if (room.door.z === room.y) rows.reverse();
  if (room.door.x === room.x) columns.reverse();
  for (const turn of new Set([piece.turn, 0, 1, 2, 3])) {
    for (const y of rows) for (const x of columns) if (placementError(s, room, piece.type, x, y, turn) === null) return { x, y, turn };
  }
  return null;
}

/**
 * The desks beyond the first in a room that holds one (0.16.0) are sold back
 * at their full price (#110; first it was what they were worth). The desk a channel manager has as their own is
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
      refund += itemValue(desk);
      for (const e of s.employees) if (e.desk === desk.id) e.desk = null;
    }
    room.furniture = room.furniture.filter((f) => f.type !== type || f === keep);
    kinds.add(room.type!);
  }
  if (kinds.size === 0) return;
  s.money += refund;
  s.ledger.purchases -= refund;
  const rooms = [...kinds].map((k) => inText(ROOM_TYPE_NAMES[k])).join(', ');
  addMessage(s, 'danger', `One desk to a room now: every manager, video editor and audio engineer works in a room of their own. The extra desks in your ${rooms} were bought back at their full price, €${Math.round(refund).toLocaleString('en-IE')}. Whoever lost their desk needs a room of their own: a channel whose manager has no desk is off the air.`, undefined, 'staff');
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
  'floorsUnlocked', 'xp', 'level', 'decadeReached',
] as const;
const ARRAY_FIELDS = [
  'rooms', 'employees', 'candidates', 'licenses', 'channels', 'shows', 'rivals', 'week', 'weeklyReports', 'monthlyReports', 'messages',
  'offers', 'contracts', 'campaigns', 'auctions', 'library', 'sportsRights', 'techs', 'rightsAuctions', 'eventRights', 'poachOffers', 'headlines', 'milestones', 'licenseBars', 'lawsuits', 'complaints',
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
    isRecord(value.politics) &&
    typeof value.politics.nextElection === 'number' &&
    Array.isArray(value.politics.history) &&
    isRecord(value.awards) &&
    Array.isArray(value.awards.past) &&
    Array.isArray(value.awards.raises) &&
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
