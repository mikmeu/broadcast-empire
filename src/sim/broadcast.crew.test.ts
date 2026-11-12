import { describe, expect, it } from 'vitest';
import { EXTRA_PRODUCER, ENGINEERS, FRESHNESS_DECAY, DECOR, DRESSING, EDITOR_CANDIDATES, EDITORS, WRITER_CANDIDATES, WRITERS } from '../config/balance';
import { productionSkill, engineeredShows, isEngineered, showQuality, madeUpHosts, writingSkill } from './broadcast';
import { sensibleBot, type Bot } from './bots';
import { createInitialState } from './newGame';
import { employeesWithDesk } from './office';
import type { Employee, GameState, Show, Person } from './state';
import { tick, advance } from './tick';
import { getGenre, hasHost, GENRES } from '../config/genres';
import { STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { buildRoom, hire, type ActionResult, createShow } from './actions';
import { addMissingEquipment, autoPlaceFurniture, withoutRecordRooms } from './fixtures';
import { proposeRoom } from './rooms';
import { unlockAll } from './unlocks';
import { peopleAt } from '../office/layout';
import { generateCandidates } from './generate';
import { Rng } from './rng';
import { ARTICLES } from '../wiki/articles';

/** The sensible bot's company after a number of days. */
function company(days: number, seed = 1, bot: Bot = sensibleBot): GameState {
  let s = createInitialState(seed);
  for (let day = 0; day < days; day++) s = tick(bot(s));
  return s;
}

describe('version 0.10.0', () => {
  describe('an extra producer always helps (R54)', () => {
    it('the best ones count, as many as the genre needs; everyone beyond adds a little', () => {
      const s = company(40);
      const desked = employeesWithDesk(s);
      const [good, weak, third, fourth] = s.employees.filter((e) => e.role === 'production' && desked.has(e.id)).sort((a, b) => b.skill - a.skill);
      expect(good!.skill).toBeGreaterThan(weak!.skill);
      const top40 = (...staff: (Employee | undefined)[]): Show => ({ id: 'x', name: 'x', genre: 'top40', hostId: null, staffIds: staff.map((e) => e!.id), writerIds: [], editorIds: [], studioId: null, freshness: 1, tone: 'normal' });
      const alone = productionSkill(s, top40(good), desked);
      // A show that needs one producer: a second, weaker one used to pull the average down.
      expect(productionSkill(s, top40(good, weak), desked)).toBeCloseTo(alone * (1 + EXTRA_PRODUCER.bonus), 6);
      expect(productionSkill(s, top40(weak, good), desked)).toBeCloseTo(alone * (1 + EXTRA_PRODUCER.bonus), 6);
      // And there is an end to it.
      if (third && fourth) expect(productionSkill(s, top40(good, weak, third, fourth), desked)).toBeCloseTo(alone * (1 + EXTRA_PRODUCER.bonus * EXTRA_PRODUCER.max), 6);
      // A show that is short of staff is still held back by that.
      const morning = { ...top40(good), genre: 'morningShow' as const };
      expect(productionSkill(s, morning, desked)).toBeCloseTo(alone / 2, 6);
    });
  });
});

// From version015.
function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors; without the cooks it may have hired. */
const station = (): GameState => {
  // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
  const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), 30))));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  s.employees = s.employees.filter((e) => e.role !== 'cook');
  for (const room of s.rooms) room.furniture = room.furniture.filter((f) => f.type !== 'stove');
  return s;
};

/** Hires a made-up person straight from the pool. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 50, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** Builds a room of a kind where the game proposes it, with everything on its checklist and more pieces. Its id is `lastId`. */
function room(state: GameState, type: RoomType, ...extra: FurnitureType[]): GameState & { lastId?: string } {
  const floor = [1, 2].find((f) => proposeRoom(state, f, type))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  if (STUDIO_REQUIREMENTS[type]) s = ok(addMissingEquipment(s, id));
  for (const piece of extra) s = ok(autoPlaceFurniture(s, id, piece));
  return Object.assign(s, { lastId: id });
}

describe('version 0.15.0', () => {
  describe('audio engineers (R47)', () => {
    it('make the radio shows they look after wear more slowly', () => {
      const base = station();
      let s = room(base, 'audioRoom');
      s = hirePerson(s, { role: 'engineer', skill: 60 });
      const engineer = s.lastId!;
      const desked = employeesWithDesk(s);
      expect(desked.has(engineer)).toBe(true);
      const looked = engineeredShows(s, desked);
      const radio = s.shows.filter((x) => isEngineered(getGenre(x.genre)) && s.channels.some((c) => c.schedule.includes(x.id)));
      expect(looked.size).toBe(Math.min(ENGINEERS.showsEach, radio.length));
      const [showId, { slower }] = [...looked][0]!;
      expect(slower).toBeGreaterThan(0);
      expect(slower).toBeLessThanOrEqual(ENGINEERS.slower);
      // The show loses that much less freshness the next day it airs.
      const fresh = (x: GameState) => x.shows.find((y) => y.id === showId)!.freshness;
      const lost = fresh(s) - fresh(tick(s));
      expect(lost).toBeCloseTo(FRESHNESS_DECAY * (1 - slower), 6);
      // The shows with the most listeners first.
      const heard = new Map<string, number>();
      for (const slot of s.lastDay!.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots)) if (slot.showId) heard.set(slot.showId, Math.max(heard.get(slot.showId) ?? 0, slot.listeners));
      const least = Math.min(...[...looked.keys()].map((id) => heard.get(id) ?? 0));
      expect(radio.filter((x) => !looked.has(x.id)).every((x) => (heard.get(x.id) ?? 0) <= least)).toBe(true);
    });

    it('do nothing without an audio desk', () => {
      const s = hirePerson(station(), { role: 'engineer' });
      expect(engineeredShows(s, employeesWithDesk(s)).size).toBe(0);
    });
  });
});

// From version016.
{
function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

/** Hires a made-up person straight from the pool. Their id is `lastId`. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 50, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** Builds a room of a kind where the game proposes it, with everything on its checklist and more pieces. Its id is `lastId`. */
function room(state: GameState, type: RoomType, ...extra: FurnitureType[]): GameState & { lastId?: string } {
  const floor = [1, 2].find((f) => proposeRoom(state, f, type))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  if (STUDIO_REQUIREMENTS[type]) s = ok(addMissingEquipment(s, id));
  for (const piece of extra) s = ok(autoPlaceFurniture(s, id, piece));
  return Object.assign(s, { lastId: id });
}

describe('version 0.16.0', () => {
  it('a recording booth makes the shows of its audio engineer better (R130)', () => {
    let s = room(station(), 'audioRoom');
    const audio = s.lastId!;
    s = hirePerson(s, { role: 'engineer', skill: 60 });
    s = tick(s);
    const show = s.shows.find((x) => getGenre(x.genre).medium === 'radio' && x.studioId)!;
    const before = showQuality(s, show);
    expect(before.recorded).toBe(1);
    s = ok(autoPlaceFurniture(s, audio, 'recordingBooth'));
    const after = showQuality(s, show);
    expect(after.recorded).toBe(1 + DECOR.recordingBooth);
    expect(after.quality).toBeCloseTo(before.quality * (1 + DECOR.recordingBooth));
  });
});
}

// From version014.
{
function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors. */
const station = (days = 30): GameState => {
  // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
  const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), days))));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  return s;
};

/** Hires a made-up person straight from the pool. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** Builds a room of a kind where the game proposes it, on the lowest floor with room, with everything on its checklist. Its id is `lastId`. */
function room(state: GameState, type: RoomType, ...extra: FurnitureType[]): GameState & { lastId?: string } {
  const floor = [1, 2].find((f) => proposeRoom(state, f, type))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, type)!, type }));
  const id = s.lastId!;
  if (STUDIO_REQUIREMENTS[type]) s = ok(addMissingEquipment(s, id));
  for (const piece of extra) s = ok(autoPlaceFurniture(s, id, piece));
  return Object.assign(s, { lastId: id });
}

/** A writers' room with places for `n` writers, and `n` writers of this skill at them. Their ids are `writers`. */
function writers(state: GameState, n: number, skill = 80): GameState & { writers: string[] } {
  let s = room(state, 'writersRoom', ...Array<FurnitureType>(n).fill('writingDesk'));
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    s = hirePerson(s, { role: 'writer', skill });
    ids.push(s.lastId!);
  }
  return Object.assign(s, { writers: ids });
}

/** Production staff with a workstation each. */
function producers(state: GameState, n: number): GameState & { staff: string[] } {
  let s = room(state, 'office', ...Array<FurnitureType>(n).fill('workstation'));
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    s = hirePerson(s, { role: 'production' });
    ids.push(s.lastId!);
  }
  return Object.assign(s, { staff: ids });
}

describe('version 0.14.0', () => {
  describe('writers (R110)', () => {
    it('work at a place in a writers’ room, once it has its story board', () => {
      let s = hirePerson(station(), { role: 'writer' });
      const writer = s.lastId!;
      s = ok(buildRoom(s, { ...proposeRoom(s, 1, 'writersRoom')!, type: 'writersRoom' }));
      const roomId = s.lastId!;
      s = ok(autoPlaceFurniture(s, roomId, 'writingDesk'));
      // Without the story board nobody writes there.
      expect(employeesWithDesk(s).has(writer)).toBe(false);
      s = ok(autoPlaceFurniture(s, roomId, 'storyBoard'));
      expect(employeesWithDesk(s).get(writer)).toMatchObject({ roomId });
      // Nobody else takes a writer's place, and a writer takes no workstation.
      const others = s.employees.filter((e) => e.role !== 'writer').map((e) => e.id);
      expect(others.some((id) => employeesWithDesk(s).get(id)?.roomId === roomId)).toBe(false);
      // In the office they sit at it, during their hours.
      expect(peopleAt(s).get(writer)).toMatchObject({ roomId, activity: 'sit' });
    });

    it('come into the hiring pool every month with the editors, without changing anything else a seeded game draws', () => {
      const s = createInitialState(1);
      const rng = new Rng(7);
      const before = s.nextId;
      const pool = generateCandidates(s, rng, 1980);
      const written = pool.filter((p) => p.role === 'writer');
      expect(written).toHaveLength(WRITER_CANDIDATES);
      // They take no number from the game's counter, and their ids are their own.
      expect(pool.filter((p) => p.role === 'editor')).toHaveLength(EDITOR_CANDIDATES);
      // (Nor do the audio engineers, cooks and clerks of 0.15.0, drawn after them, the talent managers of 0.18.0 and the recruiters of 0.17.0.)
      const side = pool.filter((p) => ['writer', 'editor', 'engineer', 'cook', 'clerk', 'talentManager', 'recruiter', 'scheduler', 'guard', 'lawyer', 'callAgent', 'journalist', 'meteorologist', 'psychologist'].includes(p.role)).length;
      expect(s.nextId - before).toBe(pool.length - side);
      expect(new Set(pool.map((p) => p.id)).size).toBe(pool.length);
      // Nobody in the pool is best at a genre that has no host.
      expect(pool.flatMap((p) => p.specialties).some((g) => !hasHost(getGenre(g)))).toBe(false);
    });

    it('make a sitcom, which has no host: their writing counts in a host’s place', () => {
      let s = room(station(), 'tvSitcomStudio');
      const studio = s.lastId!;
      s = producers(s, 5);
      const staff = (s as GameState & { staff: string[] }).staff;
      s = hirePerson(s, { role: 'host', specialties: ['sitcom'] });
      const host = s.lastId!;
      // A host given to a sitcom is left out.
      s = ok(createShow(s, { name: 'Coffee & Co', genre: 'sitcom', hostId: host, staffIds: staff, studioId: studio }));
      const id = s.lastId!;
      const show = () => s.shows.find((x) => x.id === id)!;
      expect(show().hostId).toBeNull();
      expect(showQuality(s, show()).problems).toEqual(['No writers']);

      const team = writers(s, 2);
      s = team;
      s = ok(createShow(s, { name: 'Coffee & Co 2', genre: 'sitcom', hostId: null, staffIds: staff, writerIds: team.writers, studioId: studio }));
      const written = s.shows.find((x) => x.id === s.lastId)!;
      const q = showQuality(s, written);
      expect(q.problems).toEqual([]);
      expect(q.host).toBe(q.writing);
      expect(q.writing).toBe(writingSkill(s, written, employeesWithDesk(s)));
      expect(q.quality).toBeGreaterThan(0);
      // One writer of the two it needs counts for half.
      const alone = showQuality(s, { ...written, writerIds: [team.writers[0]!] });
      expect(alone.writing).toBeCloseTo(q.writing / 2, 6);
      // Writers without a place write nothing, and the show says why.
      const noRoom = structuredClone(s);
      noRoom.rooms = noRoom.rooms.filter((r) => r.type !== 'writersRoom');
      expect(showQuality(noRoom, written).problems).toContain('Writers have no place in a writers’ room');
    });

    it('make a kids’ show or a radio drama up to a tenth better, and those keep their host', () => {
      expect(GENRES.filter((g) => g.writers && !g.writers.lead).map((g) => g.id).sort()).toEqual(['kids', 'radioDrama']);
      for (const genre of GENRES.filter((g) => g.writers && !g.writers.lead)) expect(hasHost(genre), genre.id).toBe(true);
      let s: GameState & { lastId?: string } = room(station(), 'tvKidsStudio');
      const studio = s.lastId!;
      s = producers(s, 3);
      const staff = (s as GameState & { staff: string[] }).staff;
      s = hirePerson(s, { role: 'host', specialties: ['kids'] });
      const host = s.lastId!;
      const team = writers(s, 1, 100);
      s = team;
      const kids: Show = { id: 'kids', name: 'Kids Club', genre: 'kids', hostId: host, staffIds: staff, writerIds: [], editorIds: [], studioId: studio, freshness: 1, tone: 'normal' };
      const without = showQuality(s, kids);
      const written = showQuality(s, { ...kids, writerIds: team.writers });
      expect(without.problems).toEqual([]);
      expect(without.writers).toBe(1);
      expect(written.writers).toBeGreaterThan(1);
      expect(written.writers).toBeLessThanOrEqual(1 + WRITERS.bonus);
      expect(written.quality / without.quality).toBeCloseTo(written.writers, 6);
    });

    it('make the soap opera too, which has no host either', () => {
      expect(hasHost(getGenre('soap'))).toBe(false);
      expect(getGenre('soap').writers).toEqual({ needed: 2, lead: true });
      let s: GameState & { lastId?: string } = structuredClone(station());
      s.techs.push('soapOperaFormat');
      s = room(s, 'tvSoapStudio');
      const studio = s.lastId!;
      s = hirePerson(s, { role: 'host', specialties: ['top40'] });
      s = ok(createShow(s, { name: 'Pub Life', genre: 'soap', hostId: s.lastId!, staffIds: [], studioId: studio }));
      const soap = s.shows.find((x) => x.id === s.lastId)!;
      expect(soap.hostId).toBeNull();
      expect(showQuality(s, soap).problems).toContain('No writers');
    });

    it('write two shows each at most', () => {
      let s = room(station(), 'tvSitcomStudio');
      const studio = s.lastId!;
      s = producers(s, 5);
      const staff = (s as GameState & { staff: string[] }).staff;
      const team = writers(s, 2);
      s = team;
      for (let n = 0; n < WRITERS.showsEach; n++) s = ok(createShow(s, { name: `Sitcom ${n}`, genre: 'sitcom', hostId: null, staffIds: [], writerIds: team.writers, studioId: studio }));
      const third = createShow(s, { name: 'One too many', genre: 'sitcom', hostId: null, staffIds: staff, writerIds: team.writers, studioId: studio });
      expect(third).toMatchObject({ ok: false, error: expect.stringMatching(/already writes 2 shows/) });
      // A writer is no producer, and a producer no writer.
      expect(createShow(s, { name: 'Mixed up', genre: 'sitcom', hostId: null, staffIds: [], writerIds: [staff[0]!], studioId: studio })).toMatchObject({ ok: false, error: 'Only writers can write a show.' });
    });
  });

  describe('video editors and the editing room (R46)', () => {
    it('edit a produced TV show, one each, and make it up to a tenth better', () => {
      let s: GameState & { lastId?: string } = room(station(), 'tvKidsStudio');
      const studio = s.lastId!;
      s = producers(s, 3);
      const staff = (s as GameState & { staff: string[] }).staff;
      s = hirePerson(s, { role: 'host', specialties: ['kids'] });
      const host = s.lastId!;
      s = room(s, 'editingRoom');
      const editingRoom = s.lastId!;
      s = hirePerson(s, { role: 'editor', skill: 100 });
      const editor = s.lastId!;
      expect(employeesWithDesk(s).get(editor)).toMatchObject({ roomId: editingRoom });
      s = hirePerson(s, { role: 'editor' });
      const second = s.lastId!;
      // Only one editor a show, and only an editor.
      expect(createShow(s, { name: 'Two', genre: 'kids', hostId: host, staffIds: staff, editorIds: [editor, second], studioId: studio })).toMatchObject({ ok: false, error: 'A show has one editor.' });
      expect(createShow(s, { name: 'Wrong', genre: 'kids', hostId: host, staffIds: staff, editorIds: [staff[0]!], studioId: studio })).toMatchObject({ ok: false, error: 'Only a video editor can edit a show.' });
      s = ok(createShow(s, { name: 'Kids Club', genre: 'kids', hostId: host, staffIds: staff, editorIds: [editor], studioId: studio }));
      const show = s.shows.find((x) => x.id === s.lastId)!;
      const edited = showQuality(s, show);
      const plain = showQuality(s, { ...show, editorIds: [] });
      expect(edited.edited).toBeGreaterThan(1);
      expect(edited.edited).toBeLessThanOrEqual(1 + EDITORS.bonus);
      expect(edited.quality / plain.quality).toBeCloseTo(edited.edited, 6);
      // Radio shows are not edited.
      const radio = ok(createShow(s, { name: 'Radio', genre: 'top40', hostId: null, staffIds: [], editorIds: [second], studioId: null }));
      expect(radio.shows.find((x) => x.id === radio.lastId)!.editorIds).toEqual([]);
    });
  });

  describe('a dressing room (R111)', () => {
    it('makes up two TV hosts for every make-up table, the most famous first, and their shows look better', () => {
      let s: GameState & { lastId?: string } = room(station(), 'tvKidsStudio');
      const studio = s.lastId!;
      s = producers(s, 3);
      const staff = (s as GameState & { staff: string[] }).staff;
      s = hirePerson(s, { role: 'host', specialties: ['kids'], fame: 50 });
      const host = s.lastId!;
      s = ok(createShow(s, { name: 'Kids Club', genre: 'kids', hostId: host, staffIds: staff, studioId: studio }));
      const show = s.shows.find((x) => x.id === s.lastId)!;
      expect(madeUpHosts(s).size).toBe(0);
      const before = showQuality(s, show);
      s = room(s, 'dressingRoom');
      expect(madeUpHosts(s)).toEqual(new Set([host]));
      const after = showQuality(s, show);
      expect(after.madeUp).toBe(1 + DRESSING.bonus);
      expect(after.quality / before.quality).toBeCloseTo(1 + DRESSING.bonus, 6);
      // Radio hosts are not made up.
      expect([...madeUpHosts(s)].every((id) => s.shows.some((x) => x.hostId === id && getGenre(x.genre).medium === 'tv'))).toBe(true);
    });
  });

  it('has a wiki article about writers', () => {
    const article = ARTICLES.find((a) => a.id === 'writers');
    expect(article).toBeDefined();
    expect(JSON.stringify(article)).toMatch(/writers’ room/);
  });
});
}
