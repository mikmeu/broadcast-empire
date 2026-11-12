import { describe, expect, it } from 'vitest';
import { BOOSTS } from '../config/balance';
import { registerFurniture, type FurnitureBoost, type FurnitureSpec, type FurnitureType, type RoomType } from '../config/office';
import { registerFurnitureAsset, type FurnitureAsset } from '../office/assets';
import { minimumPrice } from '../mods/furnitureFile';
import { autoPlaceFurniture } from './fixtures';
import { sensibleBot, type Bot } from './bots';
import { runningResult } from './economy';
import { createInitialState } from './newGame';
import type { RentedRoom } from './state';
import { tick } from './tick';

// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

const ASSET: FurnitureAsset = { parts: [{ box: [0.5, 0.5, 0.5], tone: 'wood', at: [0, 0, 0] }] };

/** Registers a piece of a mod. Each id is used once: a test file has its own copy of the game's list. */
function piece(id: string, rooms: RoomType[], boosts: FurnitureBoost[], cost = minimumPrice(boosts)): `mod:${string}` {
  const type = `mod:${id}` as const;
  const spec: FurnitureSpec = { name: id, about: 'A piece from a mod, for the tests.', cost, w: 1, h: 1, rooms, durable: true, boosts };
  registerFurniture(type, spec);
  registerFurnitureAsset(type, ASSET);
  return type;
}

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
});
