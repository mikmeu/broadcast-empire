// The office building, room types and furniture (prompt.md section 5.1).

import type { Role } from '../sim/state';
import { DECOR, ROYALTIES } from './balance';
import type { TechId, TechLine } from './tech';
import type { RegionId } from './world';

export type RoomType =
  | 'office'
  | 'managementOffice'
  | 'ceoOffice'
  | 'radioStudio'
  | 'radioTalkStudio'
  | 'tvTalkStudio'
  | 'tvGameStudio'
  | 'tvSoapStudio'
  | 'tvNewsStudio'
  | 'tvSitcomStudio'
  | 'tvKidsStudio'
  | 'tvRealityStudio'
  | 'writersRoom'
  | 'editingRoom'
  | 'dressingRoom'
  | 'audioRoom'
  | 'musicSchedulingOffice'
  | 'meetingRoom'
  | 'postRoom'
  | 'callCentre'
  | 'workshop'
  | 'securityRoom'
  | 'controlRoom'
  | 'masterControl'
  | 'library'
  | 'canteen'
  | 'toilets'
  | 'reception';

export const ROOM_TYPE_NAMES: Record<RoomType, string> = {
  office: 'Office',
  managementOffice: 'Management office',
  ceoOffice: 'CEO’s office',
  radioStudio: 'Radio studio',
  radioTalkStudio: 'Radio talk studio',
  tvTalkStudio: 'TV talk show studio',
  tvGameStudio: 'TV game show studio',
  tvSoapStudio: 'TV soap opera studio',
  tvNewsStudio: 'TV news studio',
  tvSitcomStudio: 'TV sitcom studio',
  tvKidsStudio: 'TV kids’ studio',
  tvRealityStudio: 'TV reality studio',
  writersRoom: 'Writers’ room',
  editingRoom: 'Editing room',
  dressingRoom: 'Dressing room',
  audioRoom: 'Audio room',
  musicSchedulingOffice: 'Music scheduling office',
  meetingRoom: 'Meeting room',
  postRoom: 'Post room',
  callCentre: 'Call centre',
  workshop: 'Workshop',
  securityRoom: 'Security room',
  controlRoom: 'Control room',
  masterControl: 'Master control room',
  library: 'Library',
  canteen: 'Canteen',
  toilets: 'Toilets',
  reception: 'Reception',
};

/** The groups the Rooms window sorts the kinds of room into (0.18.0). */
export type RoomGroup = 'offices' | 'studios' | 'production' | 'morale';

/** The groups in the order of the window's top row. */
export const ROOM_GROUP_NAMES: Record<RoomGroup, string> = {
  offices: 'Offices',
  studios: 'Studios',
  production: 'Production',
  morale: 'Morale',
};

/** The group each kind of room is in. A new kind of room needs one: the type check fails without it. */
export const ROOM_GROUP: Record<RoomType, RoomGroup> = {
  office: 'offices',
  managementOffice: 'offices',
  ceoOffice: 'offices',
  meetingRoom: 'offices',
  reception: 'offices',
  musicSchedulingOffice: 'offices',
  callCentre: 'offices',
  radioStudio: 'studios',
  radioTalkStudio: 'studios',
  tvTalkStudio: 'studios',
  tvGameStudio: 'studios',
  tvSoapStudio: 'studios',
  tvNewsStudio: 'studios',
  tvSitcomStudio: 'studios',
  tvKidsStudio: 'studios',
  tvRealityStudio: 'studios',
  writersRoom: 'production',
  editingRoom: 'production',
  dressingRoom: 'production',
  audioRoom: 'production',
  workshop: 'production',
  securityRoom: 'morale',
  controlRoom: 'production',
  masterControl: 'production',
  library: 'production',
  canteen: 'morale',
  toilets: 'morale',
  postRoom: 'morale',
};

/** A name as it stands in the middle of a sentence: without its capital, unless it starts with an abbreviation ("a TV news studio"). */
export const inText = (name: string) => (/^(TV|CEO)/.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1));

/** What each kind of room is for, in a line: shown in the furniture catalog. The genres made there are listed with it. */
export const ROOM_TYPE_NOTES: Record<RoomType, string> = {
  office: 'Where production, sales, marketing and research work. Each of them needs a workstation.',
  managementOffice: 'Where a manager works: a channel manager or the manager of a department, at a manager’s desk. Every manager has a room of their own.',
  ceoOffice: 'Your own office, with your own desk. A company has one.',
  radioStudio: 'A radio studio for one presenter.',
  radioTalkStudio: 'A radio studio with a table for guests.',
  tvTalkStudio: 'A TV studio around the talk show set: a desk for the host and a sofa for the guests.',
  tvGameStudio: 'A TV studio around the game show decor: two teams and a board with the question.',
  tvSoapStudio: 'A TV studio around the soap opera decor: the pub where the same people meet every day. A soap has no host: its cast plays it and its writers make it.',
  tvNewsStudio: 'A TV studio around a news desk, for the news and for sports.',
  tvSitcomStudio: 'A TV studio around the sitcom decor, the coffee house where the friends meet. A sitcom has no host: its cast plays it and its writers make it.',
  tvKidsStudio: 'A TV studio around the kids’ show decor: a playroom in every color, for a presenter and the children.',
  tvRealityStudio: 'A TV studio around the reality decor, a house to live in, with a confession booth beside it. Reality TV has no host: its writers make it.',
  writersRoom: 'Where the writers work, each at a place at the writers’ table, around a story board. They write the sitcoms, soaps and reality TV, and make kids’ shows and radio drama better.',
  editingRoom: 'Where a video editor works, at an editing desk: one to a room. An editor makes the TV shows they edit better.',
  dressingRoom: 'Make-up and wardrobe for the hosts of TV shows, who look better on screen for it. Each make-up table gets two of them ready.',
  musicSchedulingOffice: 'Where a music scheduler works, at a scheduling desk: one to a room. They look after one radio station that specialises in music, and its music shows are a little more appealing.',
  audioRoom: 'Where an audio engineer works, at an audio desk: one to a room. They keep the sound of the radio shows fresh, so listeners tire of them more slowly. With a recording booth beside the desk they record jingles and promos too, and their shows are a little better.',
  meetingRoom: 'A table to sit around. A manager calls their team here for a meeting, and the team is happier for a month.',
  postRoom: 'Where the letters come in and are sorted, by a clerk at a sorting case. Post lifts everyone’s morale, and fan mail makes the hosts famous faster.',
  callCentre: 'Where call agents take the phone calls, each at a call desk: listeners phoning in to the radio talk shows, and viewers paying to vote on game shows and reality TV. Every call answered is a better show or money in the bank.',
  securityRoom: 'Where a guard watches the building on a bank of small monitors, at a security desk. A famous host with a guard is safe from fans; one without is on edge, and now and then a fan gets in. A guard looks after four hosts, the most famous first.',
  workshop: 'Where your staff go on a course in the house, taught by a talent manager at a trainer’s desk. It costs less than a course outside, and as many go at once as there are training seats. The talent manager runs the talent programme as well.',
  controlRoom: 'A room beside a studio. Every TV studio needs one of its own, with a control desk and an audio mixer, where a technician runs the show. A radio studio can have an audio mixer here instead of a mixing desk inside, and works a little better for it.',
  masterControl: 'Where all your channels go out from, at a wall of monitors, on their way to the antenna and the dish. Nothing goes on the air without one, and a technician works it.',
  library: 'Keeps the films, series and other titles you have bought, and plays them out.',
  canteen: 'Lunch and coffee for the staff, which lifts morale. With a stove and a cook there are hot meals as well, and morale goes up further.',
  toilets: 'Toilets and sinks. People on the same floor go here instead of down the stairs, and are a little happier for it.',
  reception: 'The entrance hall on the ground floor. It comes with the building; it only needs a desk.',
};

/** A piece of furniture that ships with the game. */
export type BuiltInFurniture =
  | 'workstation'
  | 'managerDesk'
  | 'ceoDesk'
  | 'mixingDesk'
  | 'microphone'
  | 'onAirLight'
  | 'talkTable'
  | 'camera'
  | 'studioLights'
  | 'set'
  | 'newsDesk'
  | 'controlDesk'
  | 'shelving'
  | 'canteenTable'
  | 'coffeeMachine'
  | 'planter'
  | 'tvScreen'
  | 'radio'
  | 'couch'
  | 'fridge'
  | 'counter'
  | 'soapSet'
  | 'gameShowSet'
  | 'sitcomSet'
  | 'kidsSet'
  | 'realitySet'
  | 'confessionBooth'
  | 'writingDesk'
  | 'storyBoard'
  | 'editingDesk'
  | 'audioDesk'
  | 'schedulingDesk'
  | 'stove'
  | 'meetingTable'
  | 'sortingCase'
  | 'callDesk'
  | 'trainerDesk'
  | 'securityDesk'
  | 'trainingSeat'
  | 'whiteboard'
  | 'makeupTable'
  | 'clothesRail'
  | 'audienceSeating'
  | 'serverRack'
  | 'sink'
  | 'toilet'
  | 'receptionDesk'
  | 'audioMixer'
  | 'mcrDesk'
  | 'monitorWall'
  | 'recordingBooth'
  | 'recordShelves'
  | 'flipChart'
  | 'calendar'
  | 'salesChart'
  | 'printer'
  | 'filingCabinet'
  | 'bin'
  | 'dresser'
  | 'dishwasher'
  | 'aquarium';

/** Any piece of furniture: one of the game's own, or one added to the registry with `registerFurniture` (its id starts with `mod:`). */
export type FurnitureType = BuiltInFurniture | `mod:${string}`;

const TV_STUDIOS: readonly RoomType[] = ['tvTalkStudio', 'tvGameStudio', 'tvSoapStudio', 'tvNewsStudio', 'tvSitcomStudio', 'tvKidsStudio', 'tvRealityStudio'];
/** The studios a show is staged in, where an audience can come and watch. */
const STAGES: readonly RoomType[] = ['tvTalkStudio', 'tvGameStudio', 'tvSoapStudio', 'tvSitcomStudio', 'tvKidsStudio'];
const EVERY_ROOM: readonly RoomType[] = ['office', 'managementOffice', 'ceoOffice', 'radioStudio', 'radioTalkStudio', ...TV_STUDIOS, 'writersRoom', 'editingRoom', 'dressingRoom', 'audioRoom', 'musicSchedulingOffice', 'meetingRoom', 'postRoom', 'callCentre', 'workshop', 'securityRoom', 'controlRoom', 'masterControl', 'library', 'canteen', 'toilets', 'reception'];
/** The rooms people sit and work in at a desk, where the pieces for an office stand (0.16.0). */
const DESK_ROOMS: readonly RoomType[] = ['office', 'managementOffice', 'ceoOffice', 'writersRoom', 'editingRoom', 'audioRoom', 'musicSchedulingOffice', 'postRoom', 'callCentre', 'workshop', 'securityRoom', 'masterControl'];

/** Licensed titles one shelving unit holds. */
export const TITLES_PER_SHELF = 20;
/** Licensed titles a server rack holds, by its tier. */
export const TITLES_PER_RACK: readonly number[] = [100, 400];
/** People who come to watch a show from one block of audience seating. */
export const AUDIENCE_PER_SEATING = 10;
/** Staff one canteen table serves. */
export const STAFF_PER_TABLE = 8;
/** People who sit at one meeting table (see MEETINGS in balance.ts). */
export const SEATS_PER_MEETING_TABLE = 8;

/**
 * What a piece does besides standing there. The amounts come from DECOR in balance.ts.
 * Of the boosts of one kind in a room only the strongest counts (per `roomType` for dirt), so one piece of a kind counts per room.
 */
export type FurnitureBoost =
  /** The staff of this role who work in the room get `amount` more done. */
  | { kind: 'skill'; role: Role; amount: number }
  /** Every marketing campaign costs `amount` less; one in any office counts for the company. */
  | { kind: 'campaignCost'; amount: number }
  /** The room gets dirty `amount` more slowly, when it is a `roomType` room (any room without one). */
  | { kind: 'dirt'; amount: number; roomType?: RoomType }
  /** A meeting in the room lifts morale `amount` more. */
  | { kind: 'meetingMorale'; amount: number }
  /** The radio shows of the engineer at the desk beside it are `amount` better. */
  | { kind: 'recorded'; amount: number }
  /** The shows of these genres made in the studio are `amount` better. */
  | { kind: 'genreQuality'; genres: readonly string[]; amount: number };

export interface FurnitureSpec {
  name: string;
  /** Equipment that comes in tiers researched through R&D (see config/tech.ts). */
  line?: TechLine;
  /** Never wears out, so it needs no technician (see WEAR in balance.ts). */
  durable?: boolean;
  /** Shown under the name in the furniture shop. */
  note?: string;
  /** Not for sale until this technology is researched. */
  unlock?: TechId;
  /** For a piece that is not on a line: the technologies that bring its tier 2, 3 and so on, in that order. */
  versions?: readonly TechId[];
  /** No longer sold. Pieces placed in older games stay where they are and can be sold. */
  retired?: boolean;
  /** Makes a room nicer to be in: lifts morale a little (see COMFORT in balance.ts); a number for a piece that counts for more than one. */
  comfort?: boolean | number;
  /** What it does for the room or the company besides (see `FurnitureBoost`); read through `roomBoost` in sim/boosts.ts. */
  boosts?: readonly FurnitureBoost[];
  /** What it is for, in a sentence: shown in the furniture catalog. */
  about: string;
  cost: number;
  /** Footprint in tiles. */
  w: number;
  h: number;
  rooms: readonly RoomType[];
}

export const FURNITURE: Record<BuiltInFurniture, FurnitureSpec> = {
  workstation: { name: 'Workstation', about: 'One member of the office staff works here. Newer tiers get more work done.', note: 'A desk and a chair for one', line: 'office', cost: 1_500, w: 2, h: 2, rooms: ['office'] },
  managerDesk: { name: 'Manager’s desk', about: 'A large desk with a chair behind it. One manager works here; managers do not work at a workstation.', note: 'A desk and a chair for one manager', cost: 2_500, w: 2, h: 2, rooms: ['managementOffice'], durable: true },
  ceoDesk: { name: 'CEO’s desk', about: 'A wide desk of dark wood on a rug, with a tall chair behind it and two chairs for visitors in front. It is yours: you work here.', note: 'Your own desk', cost: 6_000, w: 3, h: 2, rooms: ['ceoOffice'], durable: true },
  mixingDesk: { name: 'Mixing desk', about: 'The heart of a radio studio, with the presenter’s microphone. From tier 2 it has places and microphones for two guests as well. For presenters who run their own desk: a studio with a control room next door has an audio mixer there instead.', line: 'radio', cost: 8_000, w: 2, h: 1, rooms: ['radioStudio', 'radioTalkStudio'] },
  microphone: { name: 'Microphone', about: 'A loose microphone on a small table. Mixing desks and talk tables have their own now.', retired: true, line: 'radio', cost: 1_500, w: 1, h: 1, rooms: ['radioStudio', 'radioTalkStudio'] },
  onAirLight: { name: 'On-air light', about: 'Lights up red while a show goes out, so nobody walks in.', cost: 500, w: 1, h: 1, rooms: ['radioStudio', 'radioTalkStudio'] },
  talkTable: { name: 'Talk table', about: 'A round table with a microphone for the presenter and one for a guest. A mixing desk of tier 2 or newer in the studio makes it unnecessary.', cost: 1_000, w: 2, h: 2, rooms: ['radioTalkStudio'] },
  camera: { name: 'TV camera', about: 'Films the show. Bigger studios need more of them.', line: 'tv', cost: 12_000, w: 1, h: 1, rooms: TV_STUDIOS },
  studioLights: { name: 'Studio lights', about: 'A spotlight on a stand. Without light the cameras see nothing.', cost: 4_000, w: 1, h: 1, rooms: TV_STUDIOS },
  set: { name: 'Talk show set', about: 'A desk for the host and a sofa for the guests, in front of a city at dusk. Talk shows are made on it.', note: 'The set of a talk show studio', unlock: 'talkShowFormat', cost: 10_000, w: 3, h: 2, rooms: ['tvTalkStudio'] },
  newsDesk: { name: 'News desk', about: 'The desk the newsreaders sit behind.', cost: 6_000, w: 3, h: 1, rooms: ['tvNewsStudio'] },
  controlDesk: { name: 'Control desk', about: 'Where the director picks the camera that goes out. It stands in the control room beside a TV studio, with an audio mixer.', note: 'Vision mixer and monitors', line: 'tv', cost: 15_000, w: 2, h: 1, rooms: ['controlRoom'] },
  shelving: { name: 'Shelving', about: 'Shelves for the films and series you own.', note: `Holds ${TITLES_PER_SHELF} titles`, cost: 2_000, w: 2, h: 1, rooms: ['library'], durable: true },
  canteenTable: { name: 'Canteen table', about: 'A table with four chairs. People take turns over the day.', note: `Serves ${STAFF_PER_TABLE} staff over the day`, cost: 800, w: 2, h: 2, rooms: ['canteen'], durable: true },
  coffeeMachine: { name: 'Coffee machine', about: 'A canteen needs one before anyone comes to eat there.', cost: 1_200, w: 1, h: 1, rooms: ['canteen'], durable: true },
  planter: { name: 'Planter', about: 'A plant in a pot. It does nothing but make a room nicer.', cost: 150, w: 1, h: 1, rooms: EVERY_ROOM, durable: true, comfort: true },
  tvScreen: { name: 'TV screen', about: 'A television for the canteen, tuned to your own channel, one hopes.', cost: 900, w: 1, h: 1, rooms: ['canteen'], durable: true, comfort: true },
  radio: { name: 'Radio', about: 'A radio for the canteen.', cost: 200, w: 1, h: 1, rooms: ['canteen'], durable: true, comfort: true },
  couch: { name: 'Couch', about: 'Somewhere soft to sit: in the canteen, for visitors at reception, in a manager’s room or in the dressing room.', cost: 600, w: 2, h: 1, rooms: ['canteen', 'reception', 'managementOffice', 'ceoOffice', 'dressingRoom'], durable: true, comfort: true },
  fridge: { name: 'Fridge', about: 'Keeps lunch cold. A canteen needs one.', cost: 700, w: 1, h: 1, rooms: ['canteen'], durable: true },
  counter: { name: 'Counter', about: 'A kitchen counter. A canteen needs one.', cost: 300, w: 1, h: 1, rooms: ['canteen'], durable: true },
  soapSet: { name: 'Soap opera decor', about: 'A pub of dark wood: the bar with its stools, a table by the window and a red curtain, where everybody meets every day. Soap operas are made on it.', note: 'The set of a soap opera studio', unlock: 'soapOperaFormat', cost: 12_000, w: 3, h: 2, rooms: ['tvSoapStudio'] },
  gameShowSet: { name: 'Game show decor', about: 'Two desks for the teams and a big board with the question. Game shows are made on it.', note: 'The set of a game show studio', unlock: 'gameShowFormat', cost: 14_000, w: 3, h: 2, rooms: ['tvGameStudio'] },
  sitcomSet: { name: 'Sitcom decor', about: 'A coffee house with a big couch, where the friends meet every day. Sitcoms are made on it.', note: 'The set of a sitcom studio', unlock: 'sitcomFormat', cost: 12_000, w: 3, h: 2, rooms: ['tvSitcomStudio'] },
  kidsSet: { name: 'Kids’ show decor', about: 'A playroom in red, yellow and blue: a little table and chairs, a big window, toys on the floor and two chairs on a rug for the presenter and a guest. Kids’ shows are made on it.', note: 'The set of a kids’ studio', unlock: 'kidsFormat', cost: 10_000, w: 3, h: 2, rooms: ['tvKidsStudio'] },
  realitySet: { name: 'Reality decor', about: 'The house the candidates live in: a corner sofa in pink and yellow, a hot tub and a big teddy bear, in turquoise. Reality TV is made on it.', note: 'The set of a reality studio', unlock: 'realityFormat', cost: 16_000, w: 3, h: 2, rooms: ['tvRealityStudio'] },
  confessionBooth: { name: 'Confession booth', about: 'A small room of its own with an orange armchair and a camera, where the candidates say what they think of each other. A reality studio needs one.', unlock: 'realityFormat', cost: 3_000, w: 2, h: 2, rooms: ['tvRealityStudio'] },
  writingDesk: { name: 'Writer’s place', about: 'A place at the writers’ table with a chair, for one writer. Put several side by side and they make one long table. Newer tiers get more written.', note: 'A place for one writer', line: 'office', cost: 1_500, w: 2, h: 2, rooms: ['writersRoom'] },
  editingDesk: { name: 'Editing desk', about: 'Where a video editor cuts the shows: monitors, tape machines and a desk of buttons and faders, and from the third version flat screens. One editor works here; newer versions of TV equipment get more done.', note: 'A place for one editor', unlock: 'videotapeEditing', line: 'tv', cost: 6_000, w: 2, h: 2, rooms: ['editingRoom'] },
  audioDesk: { name: 'Audio desk', about: 'Where an audio engineer works on the sound of the radio shows: a mixing console between two monitor speakers, and a screen from the third version. One engineer works here; newer versions of radio equipment get more done.', note: 'A place for one audio engineer', unlock: 'multitrack', line: 'radio', cost: 5_000, w: 2, h: 2, rooms: ['audioRoom'] },
  schedulingDesk: { name: 'Scheduling desk', about: 'Where a music scheduler plans the playlists of a radio station: a computer with the schedule’s grid on its screen, a crate of records beside it and a shelf of CDs. One scheduler works here; newer versions of radio equipment get more done.', note: 'A place for one music scheduler', unlock: 'computerPlaylists', line: 'radio', cost: 5_000, w: 2, h: 2, rooms: ['musicSchedulingOffice'] },
  stove: { name: 'Stove', about: 'A cooker with an extractor hood above it, where a cook makes hot meals for the canteen. One cook works here.', note: 'A place for one cook', cost: 2_500, w: 2, h: 2, rooms: ['canteen'], durable: true },
  meetingTable: { name: 'Meeting table', about: `A long table with ${SEATS_PER_MEETING_TABLE} chairs around it. A meeting room needs one; a team that has more people than there are seats gets less out of its meeting.`, note: `Seats ${SEATS_PER_MEETING_TABLE}`, cost: 2_000, w: 3, h: 2, rooms: ['meetingRoom'], durable: true },
  sortingCase: { name: 'Sorting case', about: 'A table with pigeonholes above it, where a clerk sorts the letters for everyone in the building. One clerk works here.', note: 'A place for one clerk', cost: 900, w: 2, h: 2, rooms: ['postRoom'], durable: true },
  callDesk: { name: 'Call desk', about: 'A desk with a phone, a headset and a screen to the side, where a call agent takes the calls of listeners and viewers. One call agent works here.', note: 'A place for one call agent', unlock: 'phoneIns', cost: 1_500, w: 2, h: 2, rooms: ['callCentre'], durable: true },
  trainerDesk: { name: 'Trainer’s desk', about: 'A lectern beside a small desk, where a talent manager teaches the staff on a course and plans the talent programme. One talent manager works here.', note: 'A place for one talent manager', cost: 1_500, w: 2, h: 1, rooms: ['workshop'], durable: true },
  securityDesk: { name: 'Security desk', about: 'A steel desk with a row of small monitors above it, each showing a camera in grey, and a chair for the guard. One guard works here.', note: 'A place for one guard', cost: 2_000, w: 2, h: 2, rooms: ['securityRoom'], durable: true },
  trainingSeat: { name: 'Training seat', about: 'A small school desk with a chair. One person sits a course here at a time; a workshop needs two.', note: 'A seat for one on a course', cost: 400, w: 1, h: 1, rooms: ['workshop'], durable: true },
  whiteboard: { name: 'Whiteboard on wheels', about: 'A whiteboard in a frame on wheels, with markers in the tray, for the lesson. A workshop needs one.', cost: 500, w: 2, h: 1, rooms: ['workshop'], durable: true },
  makeupTable: { name: 'Make-up table', about: 'A table of drawers under a mirror ringed with bulbs, with a chair in front. It gets two TV hosts ready for the cameras each day.', note: 'For two hosts a day', cost: 2_500, w: 2, h: 1, rooms: ['dressingRoom'], durable: true },
  clothesRail: { name: 'Clothes rail', about: 'A rail on wheels full of jackets, shirts and dresses for the hosts. A dressing room needs one.', cost: 800, w: 2, h: 1, rooms: ['dressingRoom'], durable: true },
  storyBoard: { name: 'Story board', about: 'A board on legs, full of cards with what happens in each episode. A writers’ room needs one.', cost: 600, w: 2, h: 1, rooms: ['writersRoom'], durable: true },
  audienceSeating: { name: 'Audience seating', about: `Rows of seats on steps. ${AUDIENCE_PER_SEATING} people come to watch while a show is on. A sitcom, a kids' show or a game show is 5% better for each block, up to two.`, cost: 3_000, w: 3, h: 2, rooms: STAGES, durable: true },
  serverRack: { name: 'Server rack', about: 'Keeps titles on disks instead of on shelves, many more in the same space.', note: `Holds ${TITLES_PER_RACK[0]} titles, ${TITLES_PER_RACK[1]} at tier 2`, unlock: 'personalComputer', versions: ['cloudProduction'], cost: 9_000, w: 2, h: 1, rooms: ['library'] },
  sink: { name: 'Sink', about: 'For washing hands. Toilets need two.', cost: 300, w: 1, h: 1, rooms: ['toilets'] },
  toilet: { name: 'Toilet', about: 'A toilet in its own stall. Toilets need two.', cost: 400, w: 1, h: 1, rooms: ['toilets'] },
  receptionDesk: { name: 'Reception desk', about: 'Where visitors report. The reception needs one, and nothing goes on the air without it.', cost: 2_500, w: 3, h: 1, rooms: ['reception'], durable: true },
  audioMixer: { name: 'Audio mixer', about: 'A wide console of lit buttons and faders, for the sound of a TV show: the microphones on the set, the music and the applause. It stands in the control room beside a TV studio, with the control desk, and a technician works it. A control room beside a radio studio holds one too, in place of the studio’s mixing desk.', note: 'Microphones, music and applause', line: 'tv', cost: 9_000, w: 2, h: 1, rooms: ['controlRoom'] },
  mcrDesk: { name: 'Master control desk', about: 'A long desk of buttons, faders and monitors, where a technician sees every channel out to the antenna and the dish. From the second version it has keyboards and flat screens. A master control room needs one.', note: 'Every channel goes out from here', versions: ['personalComputer'], cost: 5_000, w: 3, h: 2, rooms: ['masterControl'] },
  monitorWall: { name: 'Wall of monitors', about: 'Monitors from floor to ceiling, one for every channel on the air and for the rivals. A master control room needs one.', cost: 3_000, w: 3, h: 1, rooms: ['masterControl'] },
  recordingBooth: { name: 'Recording booth', about: 'A small padded booth with a window, a microphone and headphones. With one beside their desk, the audio engineer records jingles and promos too, and the shows they look after are 5% better.', note: 'Jingles and promos', cost: 4_000, w: 2, h: 2, rooms: ['audioRoom'], durable: true, boosts: [{ kind: 'recorded', amount: DECOR.recordingBooth }] },
  recordShelves: { name: 'Record shelves', about: 'A low cabinet with rows of LPs on it and a record player on top. With the records at hand, the Top 40, rock and classical shows made in the studio are 5% better. One set counts.', note: 'Records to choose from', cost: 2_500, w: 2, h: 1, rooms: ['radioStudio'], durable: true, boosts: [{ kind: 'genreQuality', genres: ROYALTIES.genres, amount: DECOR.recordShelves }] },
  flipChart: { name: 'Flip chart', about: 'A pad of paper on an easel, for drawing plans on. In a meeting room it makes every meeting held there lift morale a quarter more.', note: 'Better meetings', cost: 150, w: 1, h: 1, rooms: ['meetingRoom', 'office', 'managementOffice', 'writersRoom'], durable: true, boosts: [{ kind: 'meetingMorale', amount: DECOR.flipChart }] },
  calendar: { name: 'Production calendar', about: 'A year planner on the wall with every show and its deadlines. Production staff who work in an office with one get 5% more done.', note: 'Production +5%', cost: 100, w: 1, h: 1, rooms: ['office'], durable: true, boosts: [{ kind: 'skill', role: 'production', amount: DECOR.calendar }] },
  salesChart: { name: 'Sales chart', about: 'A flip chart on an easel with the sales figures drawn on it, after the designer’s photo. The sales staff in an office with one work 5% better.', note: 'Sales +5%', cost: 200, w: 1, h: 1, rooms: ['office'], durable: true, boosts: [{ kind: 'skill', role: 'sales', amount: DECOR.salesChart }] },
  printer: { name: 'Printer', about: 'A big copier and printer, after the designer’s photo, for the posters and leaflets of your campaigns. With one in an office, every marketing campaign costs 10% less.', note: 'Campaigns −10%', cost: 3_500, w: 3, h: 1, rooms: ['office'], boosts: [{ kind: 'campaignCost', amount: DECOR.printer }] },
  filingCabinet: { name: 'Filing cabinet', about: 'A grey steel cabinet of three drawers with hanging files, after the designer’s photo. It keeps the paperwork out of sight and makes the room a little nicer.', cost: 250, w: 1, h: 1, rooms: DESK_ROOMS, durable: true, comfort: true },
  bin: { name: 'Bin', about: 'A waste paper bin of black mesh, after the designer’s photo. A room with one gets dirty a fifth more slowly.', note: 'Dirt −20%', cost: 30, w: 1, h: 1, rooms: EVERY_ROOM, durable: true, boosts: [{ kind: 'dirt', amount: DECOR.bin }] },
  dresser: { name: 'Dresser with certificates', about: 'A low cabinet of dark wood with the company’s framed certificates and a trophy on it. It makes the room a little nicer.', cost: 900, w: 2, h: 1, rooms: ['managementOffice', 'ceoOffice', 'reception', 'meetingRoom'], durable: true, comfort: true },
  dishwasher: { name: 'Dishwasher', about: 'A dishwasher of steel, after the designer’s photo. A canteen with one gets dirty half as fast.', note: 'Canteen dirt −50%', cost: 1_400, w: 1, h: 1, rooms: ['canteen'], boosts: [{ kind: 'dirt', amount: DECOR.dishwasher, roomType: 'canteen' }] },
  aquarium: { name: 'Aquarium', about: 'A tank of tropical fish among green plants, on a low white cabinet, after the designer’s photo. Watching them calms anyone down: it counts as much as three plants.', note: 'Comfort ×3', cost: 2_200, w: 2, h: 1, rooms: ['office', 'managementOffice', 'ceoOffice', 'reception', 'canteen', 'meetingRoom'], durable: true, comfort: 3 },
};

/** The pieces added with `registerFurniture`, by id. */
const ADDED: Map<FurnitureType, FurnitureSpec> = new Map();

/** The numbers of a piece, whether it ships with the game or was added. Throws for an id nobody registered. */
export function furnitureSpec(type: FurnitureType): FurnitureSpec {
  const spec = (FURNITURE as Partial<Record<string, FurnitureSpec>>)[type] ?? ADDED.get(type);
  if (!spec) throw new Error(`Unknown furniture: ${type}`);
  return spec;
}

/** Every piece there is: the game's own, in their order, then the added ones. */
export const furnitureTypes = (): FurnitureType[] => [...(Object.keys(FURNITURE) as BuiltInFurniture[]), ...ADDED.keys()];

/** Adds a piece to the list (its look goes with `registerFurnitureAsset` in office/assets.ts). Its id starts with `mod:`. */
export function registerFurniture(type: `mod:${string}`, spec: FurnitureSpec): void {
  if (ADDED.has(type)) throw new Error(`Furniture already registered: ${type}`);
  ADDED.set(type, spec);
}

/** Takes an added piece off the list again (for tests). */
export const unregisterFurniture = (type: `mod:${string}`) => ADDED.delete(type);

/** The sets: each belongs to the studio of its own show, and stands nowhere else. */
export const SET_TYPES: readonly FurnitureType[] = ['set', 'soapSet', 'gameShowSet', 'sitcomSet', 'kidsSet', 'realitySet'];

/** Minimum furniture a room needs before it can be used. */
export const STUDIO_REQUIREMENTS: Partial<Record<RoomType, Partial<Record<FurnitureType, number>>>> = {
  radioStudio: { mixingDesk: 1, onAirLight: 1 },
  radioTalkStudio: { mixingDesk: 1, talkTable: 1, onAirLight: 1 },
  // The control desk and the audio mixer of a TV studio stand in its control room next door (0.16.0): see `CONTROL_ROOM_KIT`.
  tvTalkStudio: { camera: 2, studioLights: 2, set: 1, controlDesk: 1, audioMixer: 1 },
  tvGameStudio: { camera: 2, studioLights: 2, gameShowSet: 1, controlDesk: 1, audioMixer: 1 },
  tvSoapStudio: { camera: 3, studioLights: 3, soapSet: 1, controlDesk: 1, audioMixer: 1 },
  tvNewsStudio: { camera: 2, studioLights: 2, newsDesk: 1, controlDesk: 1, audioMixer: 1 },
  tvSitcomStudio: { camera: 3, studioLights: 3, sitcomSet: 1, controlDesk: 1, audioMixer: 1 },
  tvKidsStudio: { camera: 2, studioLights: 2, kidsSet: 1, controlDesk: 1, audioMixer: 1 },
  tvRealityStudio: { camera: 3, studioLights: 2, realitySet: 1, confessionBooth: 1, controlDesk: 1, audioMixer: 1 },
  writersRoom: { storyBoard: 1 },
  editingRoom: { editingDesk: 1 },
  dressingRoom: { makeupTable: 1, clothesRail: 1 },
  audioRoom: { audioDesk: 1 },
  musicSchedulingOffice: { schedulingDesk: 1 },
  meetingRoom: { meetingTable: 1 },
  postRoom: { sortingCase: 1 },
  callCentre: { callDesk: 1 },
  workshop: { trainerDesk: 1, trainingSeat: 2, whiteboard: 1 },
  securityRoom: { securityDesk: 1 },
  masterControl: { mcrDesk: 1, monitorWall: 1 },
  managementOffice: { managerDesk: 1 },
  ceoOffice: { ceoDesk: 1 },
  library: { shelving: 1 },
  canteen: { canteenTable: 1, coffeeMachine: 1, fridge: 1, counter: 1 },
  toilets: { toilet: 2, sink: 2 },
  reception: { receptionDesk: 1 },
};

/** From this tier a mixing desk seats two guests, so a radio talk studio that has one of its own needs no talk table. */
export const GUEST_DESK_TIER = 2;

/**
 * What a studio needs, and what may stand in for it in a control room next door
 * (see `borrowedDesks` in sim/office.ts): a radio studio's mixing desk is
 * replaced by an audio mixer, worked by a technician (0.19.0).
 */
export const REMOTE_DESKS: Partial<Record<FurnitureType, FurnitureType>> = { mixingDesk: 'audioMixer' };

/**
 * What a TV studio has in a control room of its own next door, and never in the
 * studio itself (0.16.0): the control desk and the audio mixer. A technician
 * works them while its shows go out (see `controlRoomOf` in sim/office.ts).
 */
export const CONTROL_ROOM_KIT: readonly FurnitureType[] = ['controlDesk', 'audioMixer'];

/**
 * The rooms that hold one desk (0.16.0): every manager, video editor and audio
 * engineer has a room of their own, and so has a talent manager (0.18.0), in a workshop.
 */
export const ONE_DESK_ROOMS: Partial<Record<RoomType, FurnitureType>> = { managementOffice: 'managerDesk', editingRoom: 'editingDesk', audioRoom: 'audioDesk', musicSchedulingOffice: 'schedulingDesk', workshop: 'trainerDesk' };

const STUDIO_TYPES: readonly RoomType[] = ['radioStudio', 'radioTalkStudio', ...TV_STUDIOS];

/** Rooms shows are made in. */
export function isStudioType(type: RoomType): boolean {
  return STUDIO_TYPES.includes(type);
}

/** A rectangle of whole tiles on the floor grid. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where a room is: its floor, its rectangle on the floor grid in tiles, and
 * its door. A room that was joined from two (0.19.0) has `parts`, the
 * rectangles it is made of; then x, y, w and h are the box around them.
 */
export interface RoomShape extends Rect {
  floor: number;
  /** The rectangles of floor the room is made of, if it is not just its box. */
  parts?: Rect[];
  /** The middle of the door, a point on one of the room's walls. */
  door: { x: number; z: number };
}

/** How wide a door is, in tiles: the gap it leaves in its wall. */
export const DOOR_WIDTH = 1;

/** A room as a place on the floor plan: one the player has, or one of the building's first plan (see `plotsOf`). */
export interface RoomLayout extends RoomShape {
  id: string;
  name: string;
  /** A room that comes with the building as this kind of room: it is not rented and can't be given up. */
  fixed?: RoomType;
}

/**
 * The floor of the standard building: two rows of rooms with a corridor (row 5)
 * between them. The wings of a bigger building (0.20.0) are laid out the same
 * way; what a building has of its own is in `Building` (`depth`, `wings`, `core`).
 */
export const FLOOR = { h: 11, corridorY: 5 };

/**
 * The block at the head of every floor, west of the rooms (x below 0). The
 * stairs and the lifts are at the front, in the two corners beside the
 * entrance, on every floor. On the ground floor the hall between them is the
 * reception, with the technicians' room and the cleaners' room behind the
 * stairs and the lifts. The floors above have only a hallway between the
 * stairs and the lifts; the rest of the block is open floor there.
 */
export const CORE = {
  /** How far the block reaches west of the rooms on the ground floor, in tiles. */
  w: 6,
  /** The tile the walkways of the floor start from: in line with the entrance, in the hallway. */
  entry: { x: -4, y: 5 },
  /** How deep it is on the floors above: the stairs, the lifts and the hallway between them. */
  upper: 3,
  /** The hall of the ground floor: the strip inside the entrance, then the part where furniture can stand. */
  hall: { x: -4, y: 3, w: 4, h: 5 },
  /** The corners at the front, three tiles square, on every floor. */
  stairs: { x: -6, y: 0, w: 3, h: 3 },
  lifts: { x: -6, y: 8, w: 3, h: 3 },
  /** The small rooms behind them, on the ground floor only. */
  technician: { x: -3, y: 0, w: 3, h: 3 },
  cleaners: { x: -3, y: 8, w: 3, h: 3 },
};

/** The west face of the standard building on the floor grid (see `westOf`). */
export const WEST = -CORE.w;

type Service = Record<'technician' | 'cleaners', RoomShape>;

/** The way the entrance of a building faces, and so the core: west, north or south (0.20.0). */
export type Face = 'w' | 'n' | 's';

/** How far the block of the core runs along the face, in tiles: from the stairs across to the lifts. */
const CORE_ALONG = 11;

/**
 * The core is written once, for a face on the west: `u` is the depth from the
 * face, `v` the distance along it (from the north). A frame turns that to the
 * floor grid: a quarter turn for 'n' and 's', no turn for 'w' (so the west-facing
 * buildings are exactly as they were). `x` and `y` are the building's `core`.
 */
export interface Frame {
  /** A rectangle given as depth, distance along the face and its size in those, on the floor grid. */
  rect: (u: number, v: number, du: number, dv: number) => Rect;
  /** A point given as depth and distance along the face, on the floor grid. */
  point: (u: number, v: number) => { x: number; z: number };
}

export function frameOf(faces: Face, cx: number, cy: number): Frame {
  const x0 = cx - CORE.w;
  switch (faces) {
    case 'w':
      return { rect: (u, v, du, dv) => ({ x: x0 + u, y: cy + v, w: du, h: dv }), point: (u, v) => ({ x: x0 + u, z: cy + v }) };
    case 's':
      return { rect: (u, v, du, dv) => ({ x: x0 + v, y: cy + CORE.w - u - du, w: dv, h: du }), point: (u, v) => ({ x: x0 + v, z: cy + CORE.w - u }) };
    case 'n':
      return { rect: (u, v, du, dv) => ({ x: x0 + CORE_ALONG - v - dv, y: cy + u, w: dv, h: du }), point: (u, v) => ({ x: x0 + CORE_ALONG - v, z: cy + u }) };
  }
}

/** The frame of a building's core. */
export const coreFrame = (building: Building): Frame => frameOf(building.core.faces, building.core.x, building.core.y);

/** A rectangle of the west-facing core (in `CORE`'s coordinates) as depth and distance along the face. */
const localRect = (r: Rect): [number, number, number, number] => [r.x + CORE.w, r.y, r.w, r.h];

const serviceRoomsIn = (frame: Frame): Service => ({
  technician: { floor: 1, ...frame.rect(...localRect(CORE.technician)), door: frame.point(CORE.technician.x + CORE.w + 1.5, CORE.technician.y + CORE.technician.h) },
  cleaners: { floor: 1, ...frame.rect(...localRect(CORE.cleaners)), door: frame.point(CORE.cleaners.x + CORE.w + 1.5, CORE.cleaners.y) },
});

/** The two small rooms of the ground floor of the standard building, each with its door to the hall. */
export const SERVICE_ROOMS: Service = serviceRoomsIn(frameOf('w', 0, 0));

/** A stretch of wall on a floor, along x or along z: from one point to another. */
export type Wall = [x1: number, z1: number, x2: number, z2: number];

/** The rectangles a room is made of: its parts, or its box if it has none. */
export const partsOf = (room: Rect & { parts?: readonly Rect[] }): readonly Rect[] => room.parts ?? [room];

/** Whether the floor tile at (x, y) is part of a room. */
export const inRoom = (room: Rect & { parts?: readonly Rect[] }, x: number, y: number): boolean =>
  partsOf(room).some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h);

/** How many floor tiles a room has. */
export const tileCount = (room: Pick<Rect, 'w' | 'h'> & { parts?: readonly Rect[] }): number =>
  room.parts ? room.parts.reduce((sum, p) => sum + p.w * p.h, 0) : room.w * room.h;

/** The largest rectangle of a room: the first of the largest parts. */
export const largestPart = (room: Rect & { parts?: readonly Rect[] }): Rect =>
  partsOf(room).reduce((best, p) => (p.w * p.h > best.w * best.h ? p : best));

/**
 * The walls of a room made of parts: every edge of a tile that faces a tile
 * outside the room, in straight runs, less the door.
 */
function wallsOfParts(room: Omit<RoomShape, 'floor'>): Wall[] {
  const { door } = room;
  const half = DOOR_WIDTH / 2;
  const edges = { h: new Map<number, Set<number>>(), v: new Map<number, Set<number>>() };
  const add = (kind: 'h' | 'v', at: number, along: number) => {
    if (!edges[kind].has(at)) edges[kind].set(at, new Set());
    edges[kind].get(at)!.add(along);
  };
  for (const p of room.parts ?? []) {
    for (let x = p.x; x < p.x + p.w; x++) {
      for (let y = p.y; y < p.y + p.h; y++) {
        if (!inRoom(room, x, y - 1)) add('h', y, x);
        if (!inRoom(room, x, y + 1)) add('h', y + 1, x);
        if (!inRoom(room, x - 1, y)) add('v', x, y);
        if (!inRoom(room, x + 1, y)) add('v', x + 1, y);
      }
    }
  }
  const walls: Wall[] = [];
  for (const kind of ['h', 'v'] as const) {
    for (const [at, set] of [...edges[kind]].sort((a, b) => a[0] - b[0])) {
      const [across, along] = kind === 'h' ? [door.z, door.x] : [door.x, door.z];
      const tiles = [...set].sort((a, b) => a - b);
      for (let n = 0; n < tiles.length; ) {
        let end = n;
        while (end + 1 < tiles.length && tiles[end + 1] === tiles[end]! + 1) end++;
        const from = tiles[n]!;
        const to = tiles[end]! + 1;
        const pieces = across === at && along > from && along < to ? [[from, along - half], [along + half, to]] : [[from, to]];
        for (const [a, b] of pieces) if (b! > a!) walls.push(kind === 'h' ? [a!, at, b!, at] : [at, a!, at, b!]);
        n = end + 1;
      }
    }
  }
  return walls;
}

/** The walls of a room, with a gap where its door is: four for a rectangle. */
export function wallsOf(room: Omit<RoomShape, 'floor'>): Wall[] {
  if (room.parts) return wallsOfParts(room);
  const { x, y, w, h, door } = room;
  const half = DOOR_WIDTH / 2;
  /** A wall from `from` to `to` along one axis at `at`, less the door if it is in this wall. */
  const side = (alongX: boolean, at: number, from: number, to: number): Wall[] => {
    const [across, along] = alongX ? [door.z, door.x] : [door.x, door.z];
    const pieces = across === at && along > from && along < to ? [[from, along - half], [along + half, to]] : [[from, to]];
    return pieces.filter(([a, b]) => b! > a!).map(([a, b]): Wall => (alongX ? [a!, at, b!, at] : [at, a!, at, b!]));
  };
  return [...side(true, y, x, x + w), ...side(true, y + h, x, x + w), ...side(false, x, y, y + h), ...side(false, x + w, y, y + h)];
}

/**
 * The walls inside the block at the head of a floor; the outer walls of the
 * building are not among them. The stairs and the lifts are open to the hall
 * and closed towards the rooms. On the ground floor the technicians' and the
 * cleaners' rooms stand behind them, each with a door to the hall.
 */
export function coreWalls(floor: number, building: Building = BUILDINGS.standard): Wall[] {
  const { point } = coreFrame(building);
  /** A wall given by its two ends in depth and distance along the face, on the floor grid, from west to east and north to south. */
  const line = (u1: number, v1: number, u2: number, v2: number): Wall => {
    const [a, b] = [point(u1, v1), point(u2, v2)];
    return [Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z)];
  };
  const back = CORE.stairs.w;
  const behind: Wall[] = [line(back, 0, back, 3), line(back, 8, back, CORE_ALONG)];
  // Where the block is not against the outer wall, the stairs and the lifts are closed towards the floor beside them as well (0.20.0).
  const floorAt = (u: number, v: number) => onFloor(building, Math.floor(point(u, v).x), Math.floor(point(u, v).z));
  if (floorAt(0.5, -0.5)) behind.push(line(0, 0, back, 0));
  if (floorAt(0.5, CORE_ALONG + 0.5)) behind.push(line(0, CORE_ALONG, back, CORE_ALONG));
  if (floor > 1) return behind;
  const known = new Set(behind.map((w) => w.join()));
  const inner = (wall: Wall) => !isOuterWall(building, wall) && !known.has(wall.join());
  return [...behind, ...Object.values(serviceRoomsOf(building)).flatMap(wallsOf).filter(inner)];
}

/** Whether a wall of a floor is in the outside of the building: the floor ends beside it (the edge of a wing or the courtyard). */
export function isOuterWall(building: Building, [x1, z1, x2]: Wall): boolean {
  return x1 === x2 ? !onFloor(building, x1 - 1, z1) || !onFloor(building, x1, z1) : !onFloor(building, x1, z1 - 1) || !onFloor(building, x1, z1);
}

/** The parts of a wall of a room that are not outer walls of the building: those are left to the building (see `outerWalls`). */
export function innerPieces(building: Building, wall: Wall): Wall[] {
  const [x1, z1, x2, z2] = wall;
  const horizontal = z1 === z2;
  const [from, to] = horizontal ? [x1, x2] : [z1, z2];
  const pieces: Wall[] = [];
  for (let a = Math.floor(from); a < to; a++) {
    const [lo, hi] = [Math.max(a, from), Math.min(a + 1, to)];
    if (isOuterWall(building, horizontal ? [a, z1, a + 1, z1] : [x1, a, x1, a + 1])) continue;
    const last = pieces[pieces.length - 1];
    if (last && (horizontal ? last[2] === lo : last[3] === lo)) pieces[pieces.length - 1] = horizontal ? [last[0], z1, hi, z1] : [x1, last[1], x1, hi];
    else pieces.push(horizontal ? [lo, z1, hi, z1] : [x1, lo, x1, hi]);
  }
  return pieces;
}

/** A stretch of the outside of a floor: a wall of the building, or of its courtyard. */
export interface OuterWall {
  wall: Wall;
  /** The way the outside lies from it: north, south, east or west. */
  faces: 'n' | 's' | 'e' | 'w';
}

const outers = new Map<BuildingId, OuterWall[]>();

/** The outside of a floor in straight runs: wherever the floor ends, at the edge of the building or at its courtyard. */
export function outerWalls(building: Building): OuterWall[] {
  const known = outers.get(building.id);
  if (known) return known;
  const [west, east] = [westOf(building), building.w];
  const made: OuterWall[] = [];
  for (let y = 0; y <= building.depth; y++) {
    for (const faces of ['n', 's'] as const) {
      let from: number | null = null;
      for (let x = west; x <= east; x++) {
        const edge = x < east && (faces === 'n' ? !onFloor(building, x, y - 1) && onFloor(building, x, y) : onFloor(building, x, y - 1) && !onFloor(building, x, y));
        if (edge && from === null) from = x;
        if (!edge && from !== null) {
          made.push({ wall: [from, y, x, y], faces });
          from = null;
        }
      }
    }
  }
  for (let x = west; x <= east; x++) {
    for (const faces of ['w', 'e'] as const) {
      let from: number | null = null;
      for (let y = 0; y <= building.depth; y++) {
        const edge = y < building.depth && (faces === 'w' ? !onFloor(building, x - 1, y) && onFloor(building, x, y) : onFloor(building, x - 1, y) && !onFloor(building, x, y));
        if (edge && from === null) from = y;
        if (!edge && from !== null) {
          made.push({ wall: [x, from, x, y], faces });
          from = null;
        }
      }
    }
  }
  outers.set(building.id, made);
  return made;
}

/** The reception: the one room that comes with the building (in the standard building; see `receptionOf`). */
export const RECEPTION: RoomLayout = { id: 'reception', name: 'Reception', floor: 1, ...CORE.hall, fixed: 'reception', door: { x: 0, z: FLOOR.corridorY + 0.5 } };

// --- The buildings ---

export type BuildingId = 'standard' | 'long' | 'courtyard' | 'valley' | 'beach' | 'fields' | 'hills';

/**
 * A stretch of floor where the game proposes rooms (0.20.0): a corridor with a
 * line of rooms on each side of it, the way an office floor is usually laid out.
 */
export interface Lane {
  /** The floor the lane covers: its rooms stay inside it. */
  area: Rect;
  /** Which way the corridor runs: along x (rooms north and south of it) or along y (rooms west and east, turned a quarter). */
  along: 'x' | 'y';
  /** Where the corridor is: its y if it runs along x, its x if along y (a row or a column of tiles). */
  corridor: number;
  /** How deep the rooms are on each side, west or north first, if not as deep as the kind of room is (5). */
  depth?: readonly [low: number, high: number];
}

/** An office building: how many floors it has and how large they are. */
export interface Building {
  id: BuildingId;
  floors: number;
  /** How far east the floor reaches, in tiles (the rooms of the first plan start at x = 0). */
  w: number;
  /** How many blocks of the town its own block is wide (see office/city.ts). */
  blocks: number;
  /** How deep a floor is, in tiles. */
  depth: number;
  /** The rectangles that are floor. Whatever is not in one of them is outside, or a courtyard. */
  wings: readonly Rect[];
  /** The open ground the wings stand round, if there is any: paved, with trees, and nothing can be built there. */
  courtyard?: Rect;
  /**
   * Where the core (the block of the stairs, the lifts and the hall) stands, and which way its entrance faces.
   * A core that faces west is 6 wide and 11 along the face: `x` is its east side (the standard building has 0, so
   * it is how far it is moved from there) and `y` its north side. One that faces north or south is turned a quarter:
   * 11 wide and 6 deep, `x` is 6 east of its west side and `y` its north side (0.20.0).
   */
  core: { x: number; y: number; faces: Face };
  /** Where the game proposes rooms, the nearest the stairs first. */
  lanes: readonly Lane[];
  /** The rooms of its first plan on a floor, by where they are (see `plotsOf`). */
  plan: readonly { x: number; y: number; w: number; h: number }[];
}

const STANDARD_PLAN = [
  { x: 0, y: 0, w: 6, h: 5 },
  { x: 6, y: 0, w: 6, h: 5 },
  { x: 12, y: 0, w: 4, h: 5 },
  { x: 16, y: 0, w: 4, h: 5 },
  { x: 0, y: 6, w: 8, h: 5 },
  { x: 8, y: 6, w: 6, h: 5 },
  { x: 14, y: 6, w: 6, h: 5 },
];

/** The ten rooms of the long building's floor, which the fields and hills buildings begin with too. */
const LONG_PLAN = [...STANDARD_PLAN, { x: 20, y: 0, w: 4, h: 5 }, { x: 24, y: 0, w: 4, h: 5 }, { x: 20, y: 6, w: 8, h: 5 }];

/** The rooms north and south of the corridor of a wing that runs along x. */
const ROWS_OF = (area: Rect, corridor: number): Lane => ({ area, along: 'x', corridor });

export const BUILDINGS: Record<BuildingId, Building> = {
  // Six floors of seven rooms: in the towns, where ground is dear.
  standard: { id: 'standard', floors: 6, w: 20, blocks: 4, depth: FLOOR.h, wings: [{ x: -6, y: 0, w: 26, h: 11 }], core: { x: 0, y: 0, faces: 'w' }, lanes: [ROWS_OF({ x: -6, y: 0, w: 26, h: 11 }, 5)], plan: STANDARD_PLAN },
  // Four floors of ten rooms: in the country, where there is room to build long instead of high. No region has it since 0.20.0 (the fields and hills
  // buildings took its place); it stays for the saves of older games and for the tests.
  // The first seven rooms of a floor are those of the standard building; three more lie beyond them.
  long: {
    id: 'long',
    floors: 4,
    w: 28,
    blocks: 5,
    depth: FLOOR.h,
    wings: [{ x: -6, y: 0, w: 34, h: 11 }],
    core: { x: 0, y: 0, faces: 'w' },
    lanes: [ROWS_OF({ x: -6, y: 0, w: 34, h: 11 }, 5)],
    plan: LONG_PLAN,
  },
  // Six floors, each a U of 37 by 37 tiles around a courtyard (0.20.0): in the capital, where the company can grow into it.
  // The north wing is where the standard building stands, so its first plan is the same. The core is in the middle of the
  // west wing, with the entrance on the west face. The south wing is another set of rows of rooms; the west wing a column
  // of rooms on each side of a corridor along y, 6 deep on its west side and 4 on its east side.
  courtyard: {
    id: 'courtyard',
    floors: 6,
    w: 20,
    // The capital's town is laid out from a drawing with the U in it (townLayout.ts), so the blocks do not matter there.
    blocks: 4,
    depth: 37,
    wings: [
      { x: -6, y: 0, w: 26, h: 11 },
      { x: -17, y: 0, w: 11, h: 37 },
      { x: -6, y: 26, w: 26, h: 11 },
    ],
    courtyard: { x: -6, y: 11, w: 26, h: 15 },
    core: { x: -11, y: 13, faces: 'w' },
    lanes: [
      ROWS_OF({ x: -6, y: 0, w: 26, h: 11 }, 5),
      ROWS_OF({ x: -6, y: 26, w: 26, h: 11 }, 31),
      { area: { x: -17, y: 0, w: 11, h: 37 }, along: 'y', corridor: -11, depth: [6, 4] },
    ],
    plan: STANDARD_PLAN,
  },
  // Six floors of 37 by 21 tiles (0.20.0): Transponder Valley, from the red shapes of its drawing (a wing of 26 by 21 and one of 11 by
  // 11) and the box of the reception under the second. The core is in the south-east corner, with the entrance on the street to the
  // south. The old standard building stood in the north-west of it, so the first plan is the same and nobody's room has moved.
  // The lanes: along the corridor from the hall to the west (rooms 3 deep to the north of it and 6 to the south), along the east
  // wing (a corridor along y), and the old two rows.
  valley: {
    id: 'valley',
    floors: 6,
    // The building ends west of the east street of the drawing, at x 39 there; the drawing starts 6 tiles west of this grid.
    w: 31,
    blocks: 4,
    depth: 21,
    wings: [
      { x: -6, y: 0, w: 26, h: 21 },
      { x: 20, y: 0, w: 11, h: 11 },
      { x: 20, y: 11, w: 11, h: 10 },
    ],
    core: { x: 26, y: 15, faces: 's' },
    lanes: [
      ROWS_OF({ x: -6, y: 0, w: 26, h: 11 }, 5),
      { area: { x: -6, y: 11, w: 37, h: 10 }, along: 'x', corridor: 14, depth: [3, 6] },
      { area: { x: 20, y: 0, w: 11, h: 14 }, along: 'y', corridor: 25 },
    ],
    plan: STANDARD_PLAN,
  },
  // Six floors of 63 by 21 tiles (0.20.0): Skywave Beach, from the red shapes of its drawing (two wings of 26 by 21 and 11 by 11 between
  // them) and the box of the reception on the north side of that. The core fills the north of the box, with the entrance on the street
  // to the north, by the bus stop. The old standard building stood in the east wing, so the first plan is the same and nobody's room
  // has moved. The lanes: from the hall's back door south, across both wings and the middle (as in the valley), and the old two rows
  // in the east wing and the same in the west one.
  beach: {
    id: 'beach',
    floors: 6,
    w: 20,
    blocks: 4,
    depth: 21,
    wings: [
      { x: -43, y: 0, w: 26, h: 21 },
      { x: -17, y: 0, w: 11, h: 10 },
      { x: -17, y: 10, w: 11, h: 11 },
      { x: -6, y: 0, w: 26, h: 21 },
    ],
    core: { x: -11, y: 0, faces: 'n' },
    lanes: [
      { area: { x: -17, y: 6, w: 11, h: 8 }, along: 'y', corridor: -12 },
      { area: { x: -43, y: 11, w: 63, h: 10 }, along: 'x', corridor: 14 },
      ROWS_OF({ x: -6, y: 0, w: 26, h: 11 }, 5),
      ROWS_OF({ x: -43, y: 0, w: 26, h: 11 }, 5),
    ],
    plan: STANDARD_PLAN,
  },
  // Four floors of 101 by 36 tiles (0.20.0): Aerial Fields, from the red shapes of its drawing (a U: two wings of 45 by 21, the 11 by 11
  // between them with the box of the reception under it, and two legs of 18 by 15 reaching south round the parking). The core fills the
  // south of the reception box, with the entrance facing south into the U. The old long building stood in the north half of the east
  // wing, so the first plan is its own and nobody's room has moved. The lanes: the old two rows, a corridor across the whole building
  // south of the wings (rooms 3 deep north of it and 6 south), the middle, the west wing's two rows, and a corridor along y down each
  // leg (the tile column of it stays clear from the corridor across, so a leg can always be reached).
  fields: {
    id: 'fields',
    floors: 4,
    w: 39,
    blocks: 5,
    depth: 36,
    wings: [
      { x: -62, y: 0, w: 45, h: 21 },
      { x: -17, y: 0, w: 11, h: 11 },
      { x: -17, y: 11, w: 11, h: 10 },
      { x: -6, y: 0, w: 45, h: 21 },
      { x: -62, y: 21, w: 18, h: 15 },
      { x: 21, y: 21, w: 18, h: 15 },
    ],
    core: { x: -11, y: 15, faces: 's' },
    lanes: [
      ROWS_OF({ x: -6, y: 0, w: 45, h: 11 }, 5),
      // (In three stretches, so that the tile column of each leg's corridor, -54 and 29, stays clear: the legs can always be reached.)
      { area: { x: -53, y: 11, w: 82, h: 10 }, along: 'x', corridor: 14, depth: [3, 6] },
      { area: { x: -62, y: 11, w: 8, h: 10 }, along: 'x', corridor: 14, depth: [3, 6] },
      { area: { x: 30, y: 11, w: 9, h: 10 }, along: 'x', corridor: 14, depth: [3, 6] },
      { area: { x: -17, y: 0, w: 11, h: 11 }, along: 'y', corridor: -12 },
      ROWS_OF({ x: -62, y: 0, w: 45, h: 11 }, 5),
      { area: { x: 21, y: 21, w: 18, h: 15 }, along: 'y', corridor: 29, depth: [8, 9] },
      { area: { x: -62, y: 21, w: 18, h: 15 }, along: 'y', corridor: -54, depth: [8, 9] },
    ],
    plan: [...STANDARD_PLAN, { x: 20, y: 0, w: 4, h: 5 }, { x: 24, y: 0, w: 4, h: 5 }, { x: 20, y: 6, w: 8, h: 5 }],
  },
  // Four floors of 91 by 47 tiles (0.20.0): Amplify Hills, from the red shapes of its drawing (a spine of 55 by 11, with a leg of 18 by
  // 37 at each end reaching north round the lake, and the box of the reception, 11 by 10, south of the spine). The legs reach
  // north of the spine, so the floor is drawn from y 0 at their north end and the spine is at y 26 to 37. The core fills the south of the
  // box, with the entrance facing south onto the road. The old long building's rows stand in the east end of the spine, x 0 to 28 (the
  // first plan is the long one's, 26 further south, and nobody's room has moved on the floor): its old gap for the core, x -6 to 0, is
  // then the way from the corridor to the hall, over the box. The lanes: the old two rows, the rest of the spine and the feet of the legs
  // along the corridor at y 31 (in stretches, so that the tile columns of the gap and of each leg's corridor stay clear), and a corridor
  // along y up each leg.
  hills: {
    id: 'hills',
    floors: 4,
    w: 46,
    blocks: 5,
    depth: 47,
    wings: [
      { x: -45, y: 0, w: 18, h: 37 },
      { x: -27, y: 26, w: 55, h: 11 },
      { x: 28, y: 0, w: 18, h: 37 },
      { x: -5, y: 37, w: 11, h: 10 },
    ],
    core: { x: 1, y: 41, faces: 's' },
    lanes: [
      ROWS_OF({ x: 0, y: 26, w: 28, h: 11 }, 31),
      ROWS_OF({ x: -36, y: 26, w: 30, h: 11 }, 31),
      ROWS_OF({ x: -45, y: 26, w: 8, h: 11 }, 31),
      ROWS_OF({ x: 28, y: 26, w: 8, h: 11 }, 31),
      ROWS_OF({ x: 37, y: 26, w: 9, h: 11 }, 31),
      { area: { x: 28, y: 0, w: 18, h: 26 }, along: 'y', corridor: 36, depth: [8, 9] },
      { area: { x: -45, y: 0, w: 18, h: 26 }, along: 'y', corridor: -37, depth: [8, 9] },
    ],
    plan: LONG_PLAN.map((p) => ({ ...p, y: p.y + 26 })),
  },
};

/** The building a new company gets, by where its headquarters are: the courtyard in the capital, and in the other four the building of their own drawing (0.20.0). The long one is no region's now. */
export const buildingFor = (headquarters: RegionId): Building =>
  BUILDINGS[
    headquarters === 'highlands' ? 'hills' : headquarters === 'heartland' ? 'fields' : headquarters === 'capital' ? 'courtyard' : headquarters === 'north' ? 'valley' : headquarters === 'coast' ? 'beach' : 'standard'
  ];

/** The floors of a building, from the ground floor up. */
export const floorsOf = (building: Building): number[] => Array.from({ length: building.floors }, (_, n) => n + 1);

/** The west face of a building on the floor grid. */
export const westOf = (building: Building): number => Math.min(...building.wings.map((r) => r.x));

/** How wide a building is in all, from its west face. */
export const widthOf = (building: Building): number => building.w - westOf(building);

/** Whether the tile at (x, y) is floor: in one of the wings (not in the courtyard, and not outside). */
export const onFloor = (building: Building, x: number, y: number): boolean => building.wings.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

const cores = new Map<BuildingId, typeof CORE>();

/** The core of a building: the stairs, the lifts, the hall and the two small rooms, where they stand in that building, turned to the way it faces. */
export function coreOf(building: Building): typeof CORE {
  const known = cores.get(building.id);
  if (known) return known;
  const made = coreIn(coreFrame(building));
  cores.set(building.id, made);
  return made;
}

/** The core as a frame puts it on the floor grid. */
export function coreIn({ rect }: Frame): typeof CORE {
  const at = (r: Rect): Rect => rect(...localRect(r));
  const entry = at({ ...CORE.entry, w: 1, h: 1 });
  return {
    ...CORE,
    entry: { x: entry.x, y: entry.y },
    hall: at(CORE.hall),
    stairs: at(CORE.stairs),
    lifts: at(CORE.lifts),
    technician: at(CORE.technician),
    cleaners: at(CORE.cleaners),
  };
}

/**
 * How to draw the core of a building from its west-facing form (`coreIn` of
 * `frameOf('w', x, y)`): turn it by `angle` about the y axis, round `origin`,
 * the point on the floor where the turned block starts (its north-west corner
 * as written for the west face), and set it down at `at`.
 */
export function coreTurn(building: Building): { angle: number; at: { x: number; z: number }; origin: { x: number; z: number } } {
  const { faces, x, y } = building.core;
  return { angle: faces === 's' ? Math.PI / 2 : faces === 'n' ? -Math.PI / 2 : 0, at: coreFrame(building).point(0, 0), origin: { x: x - CORE.w, z: y } };
}

const services = new Map<BuildingId, Service>();
/** The technicians' and the cleaners' rooms of a building, each with its door to the hall. */
export function serviceRoomsOf(building: Building): Service {
  const known = services.get(building.id);
  if (known) return known;
  const made = serviceRoomsIn(coreFrame(building));
  services.set(building.id, made);
  return made;
}

const receptions = new Map<BuildingId, RoomLayout>();
/** The reception of a building: its hall, with the door to the corridor. */
export function receptionOf(building: Building): RoomLayout {
  const known = receptions.get(building.id);
  if (known) return known;
  const core = coreOf(building);
  // The door is in the back of the hall, on the corridor: the middle of the hall's far side from the entrance.
  const made: RoomLayout = { ...RECEPTION, ...core.hall, door: coreFrame(building).point(CORE.w, RECEPTION.door.z) };
  receptions.set(building.id, made);
  return made;
}

/** The middle of the hall between the stairs and the lifts: where everyone who comes onto a floor sets out from. */
export const hallOf = (building: Building): { x: number; z: number } => {
  const { entry } = coreOf(building);
  return { x: entry.x + 0.5, z: entry.y + 0.5 };
};

/**
 * The first plan of a building: the rooms it was let with before rooms could
 * be drawn, named by letter from the ground floor up. In the standard
 * building those are rooms A–G on floor 1, H–N on floor 2, O–U on floor 3 and so on, after Z with two letters (AA, AB…),
 * in two rows along a corridor, each with its door in the middle of its
 * corridor wall. Older games have their rooms from it, and many tests
 * are still written against it (`rentRoom` in sim/fixtures.ts).
 */
export function plotsOf(building: Building): readonly RoomLayout[] {
  const known = plots.get(building.id);
  if (known) return known;
  const made = floorsOf(building).flatMap((floor, f) =>
    building.plan.map((rect, i): RoomLayout => {
      const id = letters(f * building.plan.length + i);
      const door = { x: rect.x + rect.w / 2, z: rect.y > FLOOR.corridorY ? rect.y : rect.y + rect.h };
      return { id, name: `Room ${id}`, floor, ...rect, door };
    }),
  );
  plots.set(building.id, made);
  return made;
}
const plots = new Map<BuildingId, readonly RoomLayout[]>();

/** The letters of the nth room of a plan, from 0: A to Z, then AA, AB and so on. */
const letters = (n: number): string => (n < 26 ? '' : letters(Math.floor(n / 26) - 1)) + String.fromCharCode(65 + (n % 26));

/** A room of a building's first plan, by its letter. */
export function getPlot(id: string, building: Building = BUILDINGS.standard): RoomLayout {
  const plot = plotsOf(building).find((r) => r.id === id);
  if (!plot) throw new Error(`Unknown room ${id}`);
  return plot;
}

/** The kinds of room the player can build. */
export const RENTABLE_ROOM_TYPES: readonly RoomType[] = (Object.keys(ROOM_TYPE_NAMES) as RoomType[]).filter((t) => t !== 'reception');

/** A room is at least this many tiles on its short side and this many on its long side, either way round. */
export const ROOM_MIN_SHORT = 2;
export const ROOM_MIN_LONG = 3;

/** Two rooms need this many tiles of wall in common to be joined. */
export const JOIN_MIN_WALL = 3;

/**
 * The box around the floor of a building that rooms can be built on: in a
 * building of one wing everything east of the block at its head. That block
 * is half as deep on the floors above the ground floor, so there is more room
 * to build on up there.
 */
export function buildable(building: Building, floor: number): { x: number; y: number; w: number; h: number } {
  // With a courtyard the core is inside the floor: the box is all of it, and `buildableAt` says which tiles.
  const x = building.wings.length > 1 ? westOf(building) : floor === 1 ? 0 : westOf(building) + CORE.upper;
  return { x, y: 0, w: building.w - x, h: building.depth };
}

/** The part of the core a room can't be built on: the whole block on the ground floor, the stairs, the lifts and the hallway on the floors above. */
export function coreSpace(building: Building, floor: number): Rect {
  return coreFrame(building).rect(0, 0, floor === 1 ? CORE.w : CORE.upper, CORE_ALONG);
}

/** Whether a room can be built on the floor tile at (x, y): it is floor, and not the core. */
export function buildableAt(building: Building, floor: number, x: number, y: number): boolean {
  if (!onFloor(building, x, y)) return false;
  const core = coreSpace(building, floor);
  return !(x >= core.x && x < core.x + core.w && y >= core.y && y < core.y + core.h);
}

/** The size the game proposes for a new room of each kind, in tiles: wide enough for what the kind needs and five deep, so that two rows leave a corridor between them. */
export const ROOM_SIZES: Record<RoomType, { w: number; h: number }> = {
  office: { w: 8, h: 5 },
  managementOffice: { w: 3, h: 5 },
  ceoOffice: { w: 4, h: 5 },
  radioStudio: { w: 4, h: 5 },
  radioTalkStudio: { w: 4, h: 5 },
  tvTalkStudio: { w: 6, h: 5 },
  tvGameStudio: { w: 6, h: 5 },
  tvSoapStudio: { w: 8, h: 5 },
  tvNewsStudio: { w: 6, h: 5 },
  tvSitcomStudio: { w: 8, h: 5 },
  tvKidsStudio: { w: 6, h: 5 },
  tvRealityStudio: { w: 8, h: 5 },
  writersRoom: { w: 6, h: 5 },
  editingRoom: { w: 3, h: 5 },
  dressingRoom: { w: 4, h: 5 },
  audioRoom: { w: 4, h: 5 },
  musicSchedulingOffice: { w: 3, h: 5 },
  meetingRoom: { w: 5, h: 5 },
  postRoom: { w: 3, h: 5 },
  callCentre: { w: 3, h: 5 },
  workshop: { w: 4, h: 5 },
  securityRoom: { w: 3, h: 5 },
  controlRoom: { w: 3, h: 5 },
  masterControl: { w: 3, h: 5 },
  library: { w: 4, h: 5 },
  canteen: { w: 6, h: 5 },
  toilets: { w: 3, h: 5 },
  reception: { w: CORE.hall.w, h: CORE.hall.h },
};
