import { describe, expect, it } from 'vitest';
import { GENRES, getGenre } from '../config/genres';
import { furnitureSpec, RENTABLE_ROOM_TYPES, ROOM_SIZES, ROOM_TYPE_NAMES, STUDIO_REQUIREMENTS, isStudioType, type FurnitureType, type RoomType, FURNITURE } from '../config/office';
import { setRoomType, type ActionResult } from './actions';
import { rentRoom, withoutRecordRooms } from './fixtures';
import { createInitialState } from './newGame';
import { findRoom } from './office';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import type { GameState, Show } from './state';
import { sensibleBot } from './bots';
import { kindError } from './rooms';
import { advance } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe('version 0.10.0', () => {
  describe('a studio for every kind of staged show (R60)', () => {
    it('every produced genre is made in a studio that can be built, and every studio has a size and a checklist', () => {
      for (const genre of GENRES.filter((g) => g.kind === 'produced')) {
        expect(isStudioType(genre.studio), genre.id).toBe(true);
        expect(RENTABLE_ROOM_TYPES, genre.id).toContain(genre.studio);
        expect(STUDIO_REQUIREMENTS[genre.studio], genre.id).toBeDefined();
        // The set a show is made on is on the checklist of its studio, and goes in that studio.
        if (genre.set) {
          expect(STUDIO_REQUIREMENTS[genre.studio]![genre.set], genre.id).toBe(1);
          expect(furnitureSpec(genre.set).rooms, genre.id).toEqual([genre.studio]);
        }
      }
      for (const type of RENTABLE_ROOM_TYPES) {
        // What a room needs fits in the size the game proposes for it.
        const area = Object.entries(STUDIO_REQUIREMENTS[type] ?? {}).reduce((sum, [piece, n]) => sum + furnitureSpec(piece as FurnitureType).w * furnitureSpec(piece as FurnitureType).h * n!, 0);
        expect(area, type).toBeLessThan(ROOM_SIZES[type].w * ROOM_SIZES[type].h);
      }
    });

    it('a game from before keeps its game shows and soaps where the studio made nothing else', () => {
      const techs: GameState['techs'] = ['gameShowFormat', 'soapOperaFormat', 'talkShowFormat', 'sitcomFormat'];
      let s: GameState = { ...createInitialState(1), techs, money: 5_000_000 };
      const studio = (state: GameState, id: string, type: RoomType, ...pieces: FurnitureType[]) => {
        // The production studio is gone since 0.14.0: such a room is made by hand, as a save of then had it.
        const next = type === ('tvProductionStudio' as RoomType) ? ok(rentRoom(state, id)) : ok(setRoomType(ok(rentRoom(state, id)), id, type));
        findRoom(next, id)!.type = type;
        findRoom(next, id)!.furniture.push(...pieces.map((piece, n) => ({ id: `${id}-${n}`, type: piece, x: 0, y: n * 2, turn: 0, tier: 1, condition: 100, boughtOn: 0 })));
        return next;
      };
      // As 0.9.0 had them: a talk show studio that only makes a game show, one that makes both, and a
      // production studio with a soap, and one with a soap and a sitcom.
      s = studio(s, 'A', 'tvTalkStudio', 'gameShowSet');
      s = studio(s, 'B', 'tvTalkStudio', 'set', 'gameShowSet');
      s = studio(s, 'C', 'tvProductionStudio' as RoomType, 'soapSet');
      s = studio(s, 'D', 'tvProductionStudio' as RoomType, 'soapSet');
      const show = (id: string, genre: Show['genre'], studioId: string): Show => ({ id, name: id, genre, hostId: null, staffIds: [], writerIds: [], editorIds: [], studioId, freshness: 1, tone: 'normal' });
      s = { ...s, shows: [...s.shows, show('quiz', 'gameShow', 'A'), show('quiz2', 'gameShow', 'B'), show('talk', 'talkShow', 'B'), show('soap', 'soap', 'C'), show('soap2', 'soap', 'D'), show('sitcom', 'sitcom', 'D')] };
      // The names the game gave them, by kind and number.
      for (const [id, n] of [['A', 1], ['B', 2], ['C', 1], ['D', 2]] as const) findRoom(s, id)!.name = `${ROOM_TYPE_NAMES[findRoom(s, id)!.type!]} ${n}`;
      findRoom(s, 'C')!.name = 'Coffee house';

      const { version, state } = fromSaveFile({ ...toSaveFile(s, 0), version: 25 });
      expect(version).toBe(SAVE_VERSION);
      const kind = (id: string) => findRoom(state, id)!.type;
      const studioOf = (id: string) => state.shows.find((sh) => sh.id === id)!.studioId;

      expect(kind('A')).toBe('tvGameStudio');
      expect(findRoom(state, 'A')!.name).toBe('TV game show studio 1');
      expect(studioOf('quiz')).toBe('A');
      // A studio with the talk show set stays a talk show studio; its game show has to move.
      expect(kind('B')).toBe('tvTalkStudio');
      expect([studioOf('talk'), studioOf('quiz2')]).toEqual(['B', null]);
      // A name the player would have given stays.
      expect(kind('C')).toBe('tvSoapStudio');
      expect(findRoom(state, 'C')!.name).toBe('Coffee house');
      expect(studioOf('soap')).toBe('C');
      // The production studio that kept its sitcom is a sitcom studio since 0.14.0, with its decor.
      expect(kind('D')).toBe('tvSitcomStudio');
      expect(findRoom(state, 'D')!.furniture.some((f) => f.type === 'sitcomSet')).toBe(true);
      expect([studioOf('sitcom'), studioOf('soap2')]).toEqual(['D', null]);
      // The shows that lost their studio say so, once each.
      const told = state.messages.filter((m) => /needs a TV (game show|soap opera) studio now/.test(m.text)).map((m) => m.text);
      expect(told).toHaveLength(2);
      expect(told.join(' ')).toMatch(/“quiz2”.*“soap2”/);
      // Every show that still has a studio has one of the right kind.
      for (const sh of state.shows.filter((x) => x.studioId)) expect(findRoom(state, sh.studioId!)!.type, sh.id).toBe(getGenre(sh.genre).studio);
    });
  });
});

// From version014.
/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (days = 30): GameState => {
  // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
  const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), days))));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

describe('version 0.14.0', () => {
  describe('a studio for every kind of staged show (R68)', () => {
    it('the sitcom, kids’ shows and reality TV each have a studio of their own, and the production studio is gone', () => {
      expect(Object.keys(STUDIO_REQUIREMENTS)).not.toContain('tvProductionStudio');
      for (const [genre, type, set] of [['sitcom', 'tvSitcomStudio', 'sitcomSet'], ['kids', 'tvKidsStudio', 'kidsSet'], ['reality', 'tvRealityStudio', 'realitySet']] as const) {
        expect(getGenre(genre)).toMatchObject({ studio: type, set });
        expect(STUDIO_REQUIREMENTS[type]![set]).toBe(1);
        expect(furnitureSpec(set).rooms).toEqual([type]);
      }
      // Reality TV is made around a decor that has to be researched, with a confession booth beside it.
      expect(STUDIO_REQUIREMENTS.tvRealityStudio!.confessionBooth).toBe(1);
      expect(FURNITURE.realitySet.unlock).toBe('realityFormat');
      expect(FURNITURE.confessionBooth.unlock).toBe('realityFormat');
      expect(kindError(station(), 'tvRealityStudio')).toMatch(/Research Reality format/);
      const researched = structuredClone(station());
      researched.techs.push('realityFormat');
      expect(kindError(researched, 'tvRealityStudio')).toBeNull();
      // The sitcom and kids' decor are there from the start.
      expect(kindError(station(), 'tvSitcomStudio')).toBeNull();
      expect(kindError(station(), 'tvKidsStudio')).toBeNull();
    });

    it('the sitcom has the coffee house the soap had, and the soap a pub', () => {
      expect(FURNITURE.sitcomSet.about).toMatch(/coffee house/);
      expect(FURNITURE.soapSet.about).toMatch(/pub/);
    });
  });
});
