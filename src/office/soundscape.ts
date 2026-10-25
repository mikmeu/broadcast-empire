// What is heard in the office right now. Pure: it reads the game and where the
// camera looks, and says which sounds play, how loud and from which side. The
// player (audio/player.ts) plays them; it knows nothing of the game.
//
// Loops (typing, the canteen, the town) are heard for as long as their cause
// lasts. A sound that plays once (a phone, laughter, a train) is given a key
// that is the same all through its moment, so the player starts it only once.

import { OFFICE_SOUNDS, type OfficeSoundId, type Playing } from '../audio/officeSounds';
import { type GenreId } from '../config/genres';
import { isBroken, needsDesk } from '../sim/office';
import type { GameState, RentedRoom } from '../sim/state';
import { CITY } from './assets';
import { chance } from './day';
import { RAILWAY, trainAt, trainLength } from './city';
import { SITES } from './sites';
import { SERVICE, hourOfBeat, peopleOnFloor, showsOnAir, slotAt, type Person } from './layout';

export const SOUNDSCAPE = {
  /** At most this many loops and sounds that play once are heard together; the nearest win. */
  loops: 6,
  onces: 3,
  /** The distance, in tiles at normal zoom, at which a sound is half as loud as close by. */
  near: 5,
  /** How far, in tiles, a sound has to be to the side to be heard fully on one ear. */
  spread: 12,
  /** Below this a sound is not played at all. */
  floor: 0.04,
  /** How long, in seconds, a moment for a sound that plays once is open: the player gets to see it in time. */
  window: 2.5,
  /** A workspace room's phone: a period of seconds, of which this share has a ring. Only one phone is heard at a time. */
  phones: { period: 45, share: 0.3 },
  /** A call centre's phones: rung far more often than an office's. */
  callCentre: { period: 9, share: 0.8 },
};

/** What is heard: where from is already worked into the loudness and the side. */
export type Heard = Playing;

/** The view that is looked through: where it looks (in tiles, from the middle of the floor), how far it is zoomed and from which side. */
export interface Listener {
  /** Where the camera looks, in floor tiles. */
  x: number;
  z: number;
  zoom: number;
  /** The angle of the camera, as in `View`. */
  angle: number;
}

interface Source {
  id: OfficeSoundId;
  key: string;
  /** Where it is, in floor tiles. Without a place it is heard everywhere, as the town is. */
  at?: { x: number; z: number };
  level: number;
  /** How many times further it carries than an ordinary sound: a train is heard from far off. */
  reach?: number;
}

/** Genres whose studio audience laughs. */
const LAUGHS: readonly GenreId[] = ['sitcom', 'gameShow', 'talkShow', 'kids'];

const TYPING = ['workstation', 'writingDesk'] as const;

/** The key of a sound that plays once, if this is its moment: a period of seconds, of which some share has one. */
function moment(name: string, time: number, period: number, share: number): string | null {
  const n = Math.floor(time / period);
  if (time - n * period > SOUNDSCAPE.window) return null;
  return chance(name, n, 1) < share ? `${name}:${n}` : null;
}

/** The typing sound of a room by its newest workstation: typewriters first, then electric ones, then keyboards. */
export function typingSound(tier: number): 'typewriter' | 'typewriter-electric' | 'keyboard' {
  return tier <= 1 ? 'typewriter' : tier === 2 ? 'typewriter-electric' : 'keyboard';
}

function roomSources(room: RentedRoom, people: Person[], beat: number, time: number, laughs: boolean, live: boolean, edge: 'start' | 'end' | null): Source[] {
  const here = people.filter((p) => p.roomId === room.roomId && !p.away && (p.status === 'post' || p.status === 'lunch' || p.status === 'onAir' || p.status === 'visiting'));
  if (here.length === 0) return [];
  const at = { x: room.x + room.w / 2, z: room.y + room.h / 2 };
  const out: Source[] = [];
  const has = (type: string) => room.furniture.some((f) => f.type === type);
  const add = (id: OfficeSoundId, level: number, key: string = id) => out.push({ id, key: `${key}@${room.roomId}`, at, level });

  // The workspace: typing while someone sits at a desk, a phone now and then.
  const typists = here.filter((p) => p.status === 'post' && p.role !== 'visitor' && p.role !== 'ceo' && p.role !== 'cook' && needsDesk(p.role));
  const desks = room.furniture.filter((f) => (TYPING as readonly string[]).includes(f.type));
  // A call centre rings far more often than an office does (0.20.0), with an electric phone once the desks have push buttons.
  const callDesks = room.furniture.filter((f) => f.type === 'callDesk');
  if (callDesks.length > 0 && typists.length > 0) {
    const ring = moment(`phone${room.roomId}`, time, SOUNDSCAPE.callCentre.period, SOUNDSCAPE.callCentre.share);
    if (ring) add(Math.max(...callDesks.map((f) => f.tier)) >= 2 ? 'phone-electric' : 'phone-bell', 0.8, ring);
  }
  if (typists.length > 0 && desks.length > 0) {
    const tier = Math.max(...desks.map((f) => f.tier));
    add(typingSound(tier), Math.min(1, 0.35 + 0.2 * typists.length));
    const modern = tier >= 3;
    const ring = moment(`phone${room.roomId}`, time, SOUNDSCAPE.phones.period, SOUNDSCAPE.phones.share);
    if (ring) add(modern ? 'phone-electric' : 'phone-bell', 0.8, ring);
    if (tier <= 1) {
      const bell = moment(`bell${room.roomId}`, time, 25, 0.4);
      if (bell) add('typewriter-bell', 0.7, bell);
    }
    if (has('printer')) {
      const page = moment(`printer${room.roomId}`, time, 40, 0.4);
      if (page) add('printer', 0.6, page);
    }
  }

  // The studio audience: applause as the show begins and ends, laughter every now and then.
  const audience = here.filter((p) => p.id.startsWith('visitor-audience'));
  if (audience.length > 0 && live) {
    if (edge) add('applause', 0.9, `applause-${edge}:${beat}`);
    const laugh = laughs ? moment(`laugh${room.roomId}`, time, 20, 0.5) : null;
    if (laugh) add('laughter', 0.8, laugh);
  }

  // The canteen: the stove while a cook is at it, plates and chatter while people eat.
  if (room.type === 'canteen') {
    if (here.some((p) => p.role === 'cook' && p.status === 'post')) add('stove', 0.8);
    const diners = here.filter((p) => p.status === 'lunch').length;
    if (diners > 0) {
      const crowd = Math.min(1, 0.3 + 0.1 * diners);
      add('cutlery', crowd);
      add('chatter', crowd);
      if (has('dishwasher')) add('dishwasher', 0.6);
      if (has('coffeeMachine')) {
        const cup = moment(`coffee${room.roomId}`, time, 30, 0.5);
        if (cup) add('coffee-machine', 0.7, cup);
      }
    }
  }

  // Repairs: a technician or maintenance worker in a room with a broken piece or a fault in the building.
  const fixing = here.some((p) => (p.role === 'technician' || p.role === 'maintenance') && p.status === 'post' && p.activity === 'work');
  if (fixing && (room.issue || room.furniture.some(isBroken))) {
    const bang = moment(`repair${room.roomId}`, time, 6, 0.7);
    if (bang) add('repair', 0.8, bang);
  }

  if (has('serverRack') || room.type === 'masterControl') add('server-hum', 0.5);
  return out;
}

/** The sounds of the town outside, heard on every floor and on the roof, a little quieter the higher you are. */
function townSources(game: GameState, floor: number, beat: number, time: number, still: boolean): Source[] {
  const site = SITES[game.headquarters];
  const up = Math.max(0.35, 0.9 - 0.05 * (floor - 1));
  const out: Source[] = [];
  const loop: Record<typeof site.kind, OfficeSoundId> = { city: 'city', industry: 'industry', hills: 'countryside', fields: 'countryside', beach: 'sea' };
  out.push({ id: loop[site.kind], key: loop[site.kind], level: up });

  if (site.kind === 'fields' || site.kind === 'hills') {
    // The animals are heard in the morning.
    const key = hourOfBeat(beat) < 10 ? moment('farm', time, 30, site.kind === 'fields' ? 0.5 : 0.25) : null;
    if (key) out.push({ id: 'farm', key, level: up });
  }
  if (site.kind === 'beach') {
    const key = moment('gulls', time, 25, 0.5);
    if (key) out.push({ id: 'gulls', key, level: up });
  }

  // The train, for as long as it is on the line near enough to hear, with motion reduced none runs.
  const cars = site.train.length;
  const train = still ? null : trainAt(time, cars);
  if (train) {
    const length = trainLength(cars);
    const middle = train.x - (train.direction * length) / 2;
    const pass = Math.floor(time / CITY.railway.every);
    out.push({ id: site.kind === 'industry' ? 'goods-train' : 'train', key: `train:${pass}`, at: { x: middle, z: RAILWAY.z }, level: 1, reach: 4 });
  }
  return out;
}

/** Someone arriving by the lift. */
function liftSources(people: Person[], beat: number): Source[] {
  return people.some((p) => p.from?.roomId === 'lifts') ? [{ id: 'lift', key: `lift:${beat}`, level: 0.5 }] : [];
}

/**
 * Footsteps (0.20.0): once in a beat, at the entrance and at the lifts, when people come in or set out from there. More people are louder.
 * Those who turn up on the floor have `from`; those who set out are `fresh`.
 */
function footSources(people: Person[], beat: number): Source[] {
  const where = new Map<'entrance' | 'lifts', number>();
  for (const p of people) {
    const place = p.from?.roomId ?? (p.fresh ? p.roomId : null);
    if (place !== 'entrance' && place !== 'lifts') continue;
    if (!p.from && !p.fresh) continue;
    where.set(place, (where.get(place) ?? 0) + 1);
  }
  return [...where].map(([place, n]) => ({ id: 'footsteps', key: `footsteps:${place}:${beat}`, at: SERVICE[place].at, level: Math.min(1, 0.4 + 0.15 * n) }));
}

/**
 * What is heard on a floor (or on the roof, above the last floor) at a beat of
 * the office's day and a time in seconds, from where the camera looks. Only the
 * floor on screen is heard, plus the town and the train. `still` is motion
 * reduced: no train runs then.
 */
export function soundsAt(game: GameState, floor: number, beat: number, view: Listener, time: number, still = false): Heard[] {
  const people = peopleOnFloor(game, floor, beat);
  const slot = slotAt(beat);
  const live = showsOnAir(game, slot);
  const sources: Source[] = [];
  for (const room of game.rooms.filter((r) => r.floor === floor)) {
    const show = live.find((s) => s.studioId === room.roomId);
    const edge = slot < 0 ? null : slotAt(beat - 1) !== slot ? 'start' : slotAt(beat + 1) !== slot ? 'end' : null;
    sources.push(...roomSources(room, people, beat, time, show ? LAUGHS.includes(show.genre) : false, show !== undefined, show ? edge : null));
  }
  if (floor === 1) sources.push(...liftSources(people, beat));
  sources.push(...footSources(people, beat));
  sources.push(...townSources(game, floor, beat, time, still));

  const right = [Math.cos(view.angle), -Math.sin(view.angle)];
  const heard = sources.flatMap((source): Heard[] => {
    const { x, z } = source.at ?? view;
    const dx = x - view.x;
    const dz = z - view.z;
    // Zooming in brings the sound closer.
    const reach = SOUNDSCAPE.near * view.zoom * (source.reach ?? 1);
    const level = source.at ? (source.level * reach) / (reach + Math.hypot(dx, dz)) : source.level;
    if (level < SOUNDSCAPE.floor) return [];
    const pan = Math.max(-0.8, Math.min(0.8, (dx * right[0]! + dz * right[1]!) / SOUNDSCAPE.spread));
    return [{ id: source.id, key: source.key, level, pan: source.at ? pan : 0, loop: OFFICE_SOUNDS[source.id].loop }];
  });

  // A loop is heard once, from its nearest room; the nearest few win.
  const loops = new Map<OfficeSoundId, Heard>();
  for (const h of heard.filter((x) => x.loop)) if ((loops.get(h.id)?.level ?? 0) < h.level) loops.set(h.id, { ...h, key: h.id });
  const byLevel = (a: Heard, b: Heard) => b.level - a.level;
  // Only the nearest phone rings: the list is sorted by loudness, so it is the first one.
  const isPhone = (x: Heard) => x.id === 'phone-bell' || x.id === 'phone-electric';
  let phoneHeard = false;
  const onces = heard.filter((x) => !x.loop).sort(byLevel).filter((x) => {
    if (!isPhone(x)) return true;
    if (phoneHeard) return false;
    phoneHeard = true;
    return true;
  });
  return [
    ...[...loops.values()].sort(byLevel).slice(0, SOUNDSCAPE.loops),
    ...onces.slice(0, SOUNDSCAPE.onces),
  ];
}
