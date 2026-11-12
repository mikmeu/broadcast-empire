import { describe, expect, it } from 'vitest';
import { BOOSTS, ROYALTIES, STUDIO_AUDIENCE, WEAR } from '../config/balance';
import { registerFurniture, type FurnitureBoost, type FurnitureSpec, type FurnitureType, type RoomType } from '../config/office';
import { registerFurnitureAsset, type FurnitureAsset } from '../office/assets';
import { minimumPrice } from '../mods/furnitureFile';
import { autoPlaceFurniture } from './fixtures';
import { sensibleBot, type Bot } from './bots';
import { studioAudience } from './broadcast';
import { floorBoostAmount } from './boosts';
import { runningResult } from './economy';
import { createInitialState } from './newGame';
import { employeesWithDesk } from './office';
import { Rng } from './rng';
import type { Employee, GameState, RentedRoom, Show } from './state';
import { tick } from './tick';
import { comfort, runUpkeep, upkeepLoad, wearPerDay } from './upkeep';

const ASSET: FurnitureAsset = { parts: [{ box: [0.5, 0.5, 0.5], tone: 'wood', at: [0, 0, 0] }] };

/** Registers a piece of a mod. Each id is used once: a test file has its own copy of the game's list. */
function piece(id: string, rooms: RoomType[], boosts: FurnitureBoost[], cost = minimumPrice(boosts)): `mod:${string}` {
  const type = `mod:${id}` as const;
  const spec: FurnitureSpec = { name: id, about: 'A piece from a mod, for the tests.', cost, w: 1, h: 1, rooms, durable: true, boosts };
  registerFurniture(type, spec);
  registerFurnitureAsset(type, ASSET);
  return type;
}

/** A room as the rules read it. */
const room = (roomId: string, type: RoomType, floor: number, ...pieces: string[]) =>
  ({ roomId, type, floor, cleanliness: 100, issue: null, furniture: pieces.map((p, i) => ({ id: `${roomId}-${i}`, type: p, condition: 100 })) }) as unknown as RentedRoom;

const worker = { id: 'e1', role: 'production', morale: 50 } as unknown as Employee;
const world = (...rooms: RentedRoom[]) => ({ rooms, shows: [] as Show[], employees: [worker] }) as unknown as GameState;
const deskIn = (roomId: string) => new Map([['e1', { roomId }]]) as unknown as ReturnType<typeof employeesWithDesk>;

describe('new kinds of boost (0.21.0)', () => {
  describe('morale', () => {
    const roomMorale = piece('sofa', ['office'], [{ kind: 'morale', amount: BOOSTS.moraleRoom.max, reach: 'room' }]);
    const floorMorale = piece('fountain', ['office', 'canteen'], [{ kind: 'morale', amount: BOOSTS.moraleFloor.max, reach: 'floor' }]);

    it('a room boost lifts the people who work in the room, and only them', () => {
      const here = world(room('a', 'office', 1, roomMorale), room('b', 'office', 1));
      expect(comfort(here, worker, deskIn('a'))).toBe(BOOSTS.moraleRoom.max);
      expect(comfort(here, worker, deskIn('b'))).toBe(0);
    });

    it('a floor boost lifts everyone who works on the floor, but not on another floor', () => {
      const s = world(room('a', 'office', 1, floorMorale), room('b', 'office', 1), room('c', 'office', 2));
      expect(floorBoostAmount(s, 1, 'morale', (b) => b.reach === 'floor')).toBe(BOOSTS.moraleFloor.max);
      expect(comfort(s, worker, deskIn('b'))).toBe(BOOSTS.moraleFloor.max);
      expect(comfort(s, worker, deskIn('c'))).toBe(0);
    });

    it('a piece with a room boost does not lift the floor, and a floor boost does not count as a room one', () => {
      const s = world(room('a', 'office', 1, roomMorale), room('b', 'office', 1, floorMorale));
      expect(comfort(s, worker, deskIn('a'))).toBe(BOOSTS.moraleRoom.max + BOOSTS.moraleFloor.max);
      expect(comfort(s, worker, deskIn('b'))).toBe(BOOSTS.moraleFloor.max);
    });

    it('two copies count once', () => {
      const s = world(room('a', 'office', 1, roomMorale, roomMorale, floorMorale, floorMorale));
      expect(comfort(s, worker, deskIn('a'))).toBe(BOOSTS.moraleRoom.max + BOOSTS.moraleFloor.max);
    });
  });

  describe('wear', () => {
    const oiler = piece('oiler', ['office'], [{ kind: 'wear', amount: BOOSTS.wear.max }]);

    it('takes its share off the wear of every piece in the room, and counts once', () => {
      expect(wearPerDay(room('a', 'office', 1))).toBe(WEAR.perDay);
      expect(wearPerDay(room('a', 'office', 1, oiler))).toBeCloseTo(WEAR.perDay * (1 - BOOSTS.wear.max));
      expect(wearPerDay(room('a', 'office', 1, oiler, oiler))).toBeCloseTo(WEAR.perDay * (1 - BOOSTS.wear.max));
    });

    it('wears the pieces more slowly, and the repairs load follows', () => {
      const plain = sensibleBot(createInitialState(1));
      const office = plain.rooms.find((r) => r.type === 'office')!;
      const worn = (s: GameState) => {
        const draft = structuredClone(s);
        // Without the technician the bot hires, who would put it right the same day.
        draft.employees = draft.employees.filter((e) => e.role !== 'technician');
        runUpkeep(draft, new Rng(1), employeesWithDesk(draft));
        const target = draft.rooms.find((r) => r.roomId === office.roomId)!;
        return 100 - Math.min(...target.furniture.filter((f) => f.condition < 100).map((f) => f.condition));
      };
      const fitted = piece('oil-pump', ['office'], [{ kind: 'wear', amount: BOOSTS.wear.max }]);
      const oiled = structuredClone(plain);
      const placed = autoPlaceFurniture(oiled, office.roomId, fitted);
      if (!placed.ok) throw new Error(placed.error);

      expect(worn(plain)).toBeCloseTo(WEAR.perDay);
      expect(worn(placed.state)).toBeCloseTo(WEAR.perDay * (1 - BOOSTS.wear.max));
      const before = upkeepLoad(plain, employeesWithDesk(plain)).repairs.needed;
      const after = upkeepLoad(placed.state, employeesWithDesk(placed.state)).repairs.needed;
      const items = placed.state.rooms.find((r) => r.roomId === office.roomId)!.furniture.filter((f) => f.type !== fitted).length;
      expect(before - after).toBeCloseTo(items * WEAR.perDay * BOOSTS.wear.max);
    });
  });

  describe('audience', () => {
    const show = { genre: 'sitcom', studioId: 'a' } as Show;
    const seats = (n: number) => Array.from({ length: n }, () => 'audienceSeating');
    const hall = piece('hall', ['tvSitcomStudio'], [{ kind: 'audience', amount: BOOSTS.audience.max }]);
    const lift = (...pieces: string[]) => studioAudience(world(room('a', 'tvSitcomStudio', 1, ...pieces)), show);

    it('counts as one more block of seating', () => {
      expect(lift()).toBe(1);
      expect(lift(hall)).toBeCloseTo(1 + STUDIO_AUDIENCE.perBlock);
      expect(lift(...seats(1), hall)).toBeCloseTo(1 + 2 * STUDIO_AUDIENCE.perBlock);
    });

    it('never goes past what seating gives, and counts once', () => {
      const most = 1 + STUDIO_AUDIENCE.perBlock * STUDIO_AUDIENCE.maxBlocks;
      expect(lift(...seats(2), hall)).toBeCloseTo(most);
      expect(lift(...seats(5), hall)).toBeCloseTo(most);
      expect(lift(hall, hall)).toBeCloseTo(1 + STUDIO_AUDIENCE.perBlock);
    });

    it('gives nothing to a genre with no audience', () => {
      expect(studioAudience(world(room('a', 'tvSitcomStudio', 1, hall)), { genre: 'news', studioId: 'a' } as Show)).toBe(1);
    });
  });
});

describe('the strongest pieces a mod may make (0.21.0)', () => {
  type Where = 'office' | 'studio' | 'canteen';
  const wanted = (where: Where) => (r: RentedRoom) => (where === 'studio' ? r.type === 'radioStudio' || r.type === 'radioTalkStudio' : r.type === where);
  const STUDIOS: RoomType[] = ['radioStudio', 'radioTalkStudio'];
  const at = (where: Where, boosts: FurnitureBoost[], id: string) => [where, piece(id, where === 'studio' ? STUDIOS : [where], boosts)] as const;

  /** The sensible bot, which also places these pieces in every room of their kind once it has the rooms. */
  function stocked(kit: readonly (readonly [Where, string])[]): Bot {
    let done = false;
    return (state) => {
      let s = sensibleBot(state);
      if (done || state.day < 2) return s;
      done = true;
      for (const [where, type] of kit) {
        for (const target of s.rooms.filter(wanted(where))) {
          const placed = autoPlaceFurniture(s, target.roomId, type as FurnitureType);
          if (placed.ok) s = placed.state;
        }
      }
      return s;
    };
  }

  function play(bot: Bot, days = 3 * 365) {
    let s = createInitialState(1);
    let black: number | null = null;
    for (let i = 0; i < days && !s.bankrupt; i++) {
      s = tick(bot(s));
      const first = s.monthlyReports.findIndex((r) => runningResult(r) > 0);
      if (black === null && first >= 0) black = first;
    }
    return { money: s.money, bankrupt: s.bankrupt, black };
  }
  const gap = (a: { money: number }, base: { money: number }) => (a.money - base.money) / Math.abs(base.money);

  // Seed 1: the sensible bot makes top 40, rock, news and a morning show on the radio. The plain bot ends with €82k, but
  // only because it buys nothing on day 2: every bot that does, even with a piece that does nothing for it, ends near
  // €200k (the shopping moves its whole game). So the pieces are measured against a control piece that does nothing.
  const control = () => [at('office', [{ kind: 'recorded', amount: BOOSTS.recorded.max }], 'control')];

  it('the new kinds, with skill and dirt for any role and room, at their most together lift a bot by at most 15% of its money after three years', () => {
    const base = play(stocked(control()));
    const most = play(
      stocked([
        at('office', [{ kind: 'skill', role: 'writer', amount: BOOSTS.skill.max }, { kind: 'morale', amount: BOOSTS.moraleRoom.max, reach: 'room' }, { kind: 'morale', amount: BOOSTS.moraleFloor.max, reach: 'floor' }, { kind: 'wear', amount: BOOSTS.wear.max }], 'desk-set'),
        at('office', [{ kind: 'skill', role: 'sales', amount: BOOSTS.skill.max }, { kind: 'campaignCost', amount: BOOSTS.campaignCost.max }, { kind: 'meetingMorale', amount: BOOSTS.meetingMorale.max }, { kind: 'recorded', amount: BOOSTS.recorded.max }], 'copy-set'),
        at('studio', [{ kind: 'wear', amount: BOOSTS.wear.max }, { kind: 'audience', amount: BOOSTS.audience.max }], 'stage-set'),
        at('canteen', [{ kind: 'dirt', amount: BOOSTS.dirt.max }, { kind: 'dirt', amount: BOOSTS.dirtRoom.max, roomType: 'canteen' }], 'kitchen-set'),
      ]),
    );
    console.log(`control €${Math.round(base.money)}, strongest new pieces €${Math.round(most.money)}, gap ${(gap(most, base) * 100).toFixed(1)}%; in the black in month ${base.black} and ${most.black}`);
    expect(base.bankrupt).toBe(false);
    expect(most.bankrupt).toBe(false);
    expect(gap(most, base)).toBeLessThanOrEqual(0.15);
    expect(most.black).toBeGreaterThanOrEqual(base.black! - 1);
  }, 600_000);

  it('a mod piece for three genres lifts a bot by at most 15% over the record shelves of the game', () => {
    const shelves = play(stocked([['studio', 'recordShelves']]));
    const mod = play(stocked([at('studio', [{ kind: 'genreQuality', genres: ['top40', 'rock', 'news'], amount: BOOSTS.genreQuality.max }], 'any-genres')]));
    console.log(`record shelves €${Math.round(shelves.money)}, a mod piece for top 40, rock and news €${Math.round(mod.money)}, gap ${(gap(mod, shelves) * 100).toFixed(1)}%`);
    expect(mod.bankrupt).toBe(false);
    expect(gap(mod, shelves)).toBeLessThanOrEqual(0.15);
    expect(mod.black).toBeGreaterThanOrEqual(shelves.black! - 1);
  }, 600_000);

  it('allows as many genres on a piece as the record shelves name', () => {
    expect(BOOSTS.genreQuality.genres).toBe(ROYALTIES.genres.length);
  });
});
