import { describe, expect, it } from 'vitest';
import { METEOROLOGIST_CANDIDATES, SALARY, WEATHER } from '../config/balance';
import { HINTS } from '../config/guide';
import { xpForLevel } from '../config/levels';
import { FURNITURE, isStudioType, STUDIO_REQUIREMENTS, type RoomType } from '../config/office';
import { TO_RECORD } from '../config/voiceOver';
import { buildRoom, hire, type ActionResult } from './actions';
import { addMissingEquipment, autoPlaceFurniture } from './fixtures';
import { generateCandidates } from './generate';
import { DUE } from './guide';
import { checkMilestones } from './milestones';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { advance } from './tick';
import { employeesWithDesk, isTvStudio, sharesWall } from './office';
import { Rng } from './rng';
import { proposeRoom } from './rooms';
import type { GameState, Role } from './state';
import { canHire, hireBlocker, unlockAll } from './unlocks';
import { studioServed, weatherAppeal, weatherPairs, weatherRate } from './weather';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

const start = (): GameState => ({ ...unlockAll(createInitialState(1)), money: 5_000_000, floorsUnlocked: 2 });

/** Builds a room of a kind in the north row of floor 1, with its door on the corridor. */
function build(state: GameState, type: RoomType, x: number, w: number): GameState & { lastId?: string } {
  return ok(buildRoom(state, { floor: 1, x, y: 0, w, h: 5, door: { x: x + 0.5, z: 5 }, type }));
}

/** A weather studio with everything on its checklist, built in the north row. */
function weatherStudio(state: GameState, x: number): GameState & { lastId?: string } {
  const built = build(state, 'weatherStudio', x, 3);
  return Object.assign(ok(addMissingEquipment(built, built.lastId!)), { lastId: built.lastId });
}

/** A meteorologist of a skill, hired and seated if a weather desk is free. */
function withMeteorologist(state: GameState, skill = 50): GameState {
  const s = structuredClone(state);
  s.candidates.push({ id: `met${skill}`, name: 'Wendy Cloud', role: 'meteorologist', skill, salary: 1_200, specialties: [], fame: 0, department: null, foundFor: null });
  return ok(hire(s, `met${skill}`));
}

/** A TV news studio (x 4–10), a weather studio next to it (10–13) and a radio talk studio (13–17) on the other side of it. */
function street(): { s: GameState; tv: string; weather: string; talk: string } {
  let s = build(start(), 'tvNewsStudio', 4, 6);
  const tv = s.lastId!;
  s = weatherStudio(s, 10);
  const weather = s.lastId!;
  s = build(s, 'radioTalkStudio', 13, 4);
  return { s, tv, weather, talk: s.lastId! };
}

const news = (studioId: string) => ({ genre: 'tvNews' as const, studioId });

describe('The weather studio (0.22.0, #394)', () => {
  describe('the room', () => {
    it('is a room with a green screen and a weather desk, and no TV or radio studio', () => {
      expect(STUDIO_REQUIREMENTS.weatherStudio).toEqual({ greenScreen: 1, weatherDesk: 1, camera: 1, studioLights: 1 });
      expect(isStudioType('weatherStudio')).toBe(false);
      expect(isTvStudio('weatherStudio')).toBe(false);
      expect(FURNITURE.camera.rooms).toContain('weatherStudio');
      expect(FURNITURE.studioLights.rooms).toContain('weatherStudio');
    });

    it('has a desk for one meteorologist, as the pieces of the checklist say', () => {
      const { s, weather } = street();
      const room = s.rooms.find((r) => r.roomId === weather)!;
      expect(room.furniture.map((f) => f.type).sort()).toEqual(['camera', 'greenScreen', 'studioLights', 'weatherDesk']);
      // One desk to a room: a second one goes into a weather studio of its own.
      const second = ok(autoPlaceFurniture(s, weather, 'weatherDesk'));
      expect(second.lastId).not.toBe(weather);
      expect(second.rooms.find((r) => r.roomId === weather)!.furniture.filter((f) => f.type === 'weatherDesk')).toHaveLength(1);
      expect(second.rooms.filter((r) => r.type === 'weatherStudio')).toHaveLength(2);
    });

    it('opens at level 9, and so does the meteorologist', () => {
      const fresh = { ...createInitialState(1), money: 5_000_000 };
      expect(hireBlocker(fresh, 'meteorologist')).not.toBeNull();
      expect(canHire(fresh, 'meteorologist')).toBe(false);
      expect(buildRoom(fresh, { floor: 1, x: 4, y: 0, w: 3, h: 5, door: { x: 4.5, z: 5 }, type: 'weatherStudio' }).ok).toBe(false);
      expect(canHire(unlockAll(fresh), 'meteorologist')).toBe(true);
    });

    it('opens by level in a game that has already passed level 9', () => {
      const old = structuredClone(createInitialState(1));
      old.xp = xpForLevel(9);
      old.unlocked = old.unlocked.filter((f) => f !== 'weather');
      checkMilestones(old);
      expect(old.unlocked).toContain('weather');
      expect(canHire(old, 'meteorologist')).toBe(true);
    });

    it('has a job of its own, in the hiring pool every month', () => {
      expect(SALARY.meteorologist.min).toBeLessThan(SALARY.meteorologist.max);
      const pool = generateCandidates(start(), new Rng(5), 1980);
      const people = pool.filter((p) => p.role === ('meteorologist' as Role));
      expect(people).toHaveLength(METEOROLOGIST_CANDIDATES);
      for (const p of people) expect(p.salary).toBeGreaterThanOrEqual(SALARY.meteorologist.min);
    });
  });

  describe('pairing', () => {
    it('goes by a shared wall, one weather studio to a news studio', () => {
      const { s, tv, weather, talk } = street();
      const pairs = weatherPairs(s);
      expect(pairs.get(tv)?.roomId).toBe(weather);
      // The radio talk studio shares a wall with the same weather studio, but the TV news studio has it first.
      expect(pairs.has(talk)).toBe(false);
      expect(studioServed(s, weather)?.roomId).toBe(tv);
    });

    it('gives a second weather studio to the radio talk studio next to it', () => {
      const { s, tv, weather, talk } = street();
      const more = weatherStudio(s, 17);
      const pairs = weatherPairs(more);
      expect(pairs.get(tv)?.roomId).toBe(weather);
      expect(pairs.get(talk)?.roomId).toBe(more.lastId);
    });

    it('serves a radio talk studio when no TV news studio is next door', () => {
      let s = build(start(), 'radioTalkStudio', 4, 4);
      const talk = s.lastId!;
      s = weatherStudio(s, 8);
      expect(weatherPairs(s).get(talk)?.roomId).toBe(s.lastId);
    });

    it('pairs nothing that is not next door, or not furnished', () => {
      let s = build(start(), 'tvNewsStudio', 4, 6);
      const tv = s.lastId!;
      // A weather studio two tiles away shares no wall.
      const apart = weatherStudio(s, 12);
      expect(weatherPairs(apart).size).toBe(0);
      // One next door but without a green screen serves nothing.
      s = build(s, 'weatherStudio', 10, 3);
      expect(sharesWall(s.rooms.find((r) => r.roomId === s.lastId)!, s.rooms.find((r) => r.roomId === tv)!)).toBe(true);
      expect(weatherPairs(s).size).toBe(0);
    });

    it('is no TV studio, so a TV news studio needs no weather studio and the weather studio needs no control room', () => {
      const { s, weather } = street();
      expect(isTvStudio(s.rooms.find((r) => r.roomId === weather)!.type)).toBe(false);
    });
  });

  describe('the lift', () => {
    it('is only there with a meteorologist at the weather desk', () => {
      const { s, tv } = street();
      expect(weatherAppeal(s, employeesWithDesk(s), news(tv))).toBe(1);
      const staffed = withMeteorologist(s);
      const desked = employeesWithDesk(staffed);
      expect(desked.get('met50')).toBeDefined();
      const lift = weatherAppeal(staffed, desked, news(tv));
      expect(lift).toBeGreaterThan(1);
      expect(lift).toBeLessThanOrEqual(1 + (WEATHER.lift - 1) * WEATHER.maxCrew);
      const rate = weatherRate(staffed, desked, desked.get('met50')!.roomId);
      expect(rate).toBeGreaterThan(0);
      expect(lift).toBeCloseTo(1 + (WEATHER.lift - 1) * rate);
    });

    it('is bigger for a better meteorologist, and capped', () => {
      const rates = [20, 50, 100].map((skill) => {
        const staffed = withMeteorologist(street().s, skill);
        const desked = employeesWithDesk(staffed);
        return weatherRate(staffed, desked, desked.get(`met${skill}`)!.roomId);
      });
      expect(rates[0]!).toBeLessThan(rates[1]!);
      expect(rates[1]!).toBeLessThan(rates[2]!);
      for (const rate of rates) expect(rate).toBeLessThanOrEqual(WEATHER.maxCrew);
    });

    it('lifts the TV news and the radio news, and nothing else', () => {
      const { s, tv, weather, talk } = street();
      const more = weatherStudio(s, 17);
      const staffed = withMeteorologist(withMeteorologist(more, 50), 60);
      const desked = employeesWithDesk(staffed);
      expect(desked.size).toBeGreaterThanOrEqual(2);
      expect(weatherAppeal(staffed, desked, { genre: 'tvNews', studioId: tv })).toBeGreaterThan(1);
      expect(weatherAppeal(staffed, desked, { genre: 'news', studioId: talk })).toBeGreaterThan(1);
      // Sports, on TV and on the radio, and a talk show in the same studio gain nothing.
      expect(weatherAppeal(staffed, desked, { genre: 'tvSports', studioId: tv })).toBe(1);
      expect(weatherAppeal(staffed, desked, { genre: 'sportsCommentary', studioId: talk })).toBe(1);
      expect(weatherAppeal(staffed, desked, { genre: 'talkShow', studioId: talk })).toBe(1);
      // A news show without a studio, or in an unpaired one, gains nothing either.
      expect(weatherAppeal(staffed, desked, { genre: 'tvNews', studioId: null })).toBe(1);
      expect(weatherAppeal(staffed, desked, { genre: 'tvNews', studioId: weather })).toBe(1);
    });
  });

  describe('placing', () => {
    it('is proposed wall to wall with a news studio that has none', () => {
      const s = build(start(), 'tvNewsStudio', 4, 6);
      const studio = s.rooms.find((r) => r.roomId === s.lastId)!;
      const plan = proposeRoom(s, 1, 'weatherStudio');
      expect(plan).not.toBeNull();
      expect(sharesWall(plan!, studio)).toBe(true);
    });

    it('is proposed beside a radio talk studio too', () => {
      const s = build(start(), 'radioTalkStudio', 4, 4);
      const studio = s.rooms.find((r) => r.roomId === s.lastId)!;
      const plan = proposeRoom(s, 1, 'weatherStudio');
      expect(plan).not.toBeNull();
      expect(sharesWall(plan!, studio)).toBe(true);
    });
  });

  describe('Penny', () => {
    it('has a line for it, which waits to be recorded, and speaks of it once news is on the air and there is no weather studio', () => {
      const line = HINTS.find((h) => h.id === 'weather-studio')!;
      expect(line.say).toContain('weather studio');
      expect(line.wiki).toBe('weather-studio');
      expect(TO_RECORD['weather-studio']).toBeUndefined();
      const due = DUE['weather-studio']!;
      // A station a month on the air, with level 9 open and money to build with.
      const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 34)));
      s.money = 5_000_000;
      s.rooms = s.rooms.filter((r) => r.type !== 'weatherStudio');
      const channel = s.channels[0]!;
      channel.schedule = channel.schedule.map(() => null);
      expect(due(s)).toBe(false);
      const withNews = structuredClone(s);
      withNews.shows.push({ ...withNews.shows[0]!, id: 'newsy', genre: 'tvNews' });
      withNews.channels[0]!.schedule[0] = 'newsy';
      expect(due(withNews)).toBe(true);
      const plan = proposeRoom(withNews, 1, 'weatherStudio')!;
      expect(due(ok(buildRoom(withNews, { ...plan, type: 'weatherStudio' })))).toBe(false);
      expect(due({ ...withNews, unlocked: [] })).toBe(false);
    });
  });
});
