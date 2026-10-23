import { describe, expect, it } from 'vitest';
import { DRESSING, EDITOR_CANDIDATES, EDITORS, FLOOR_UNLOCK_VALUE, POACH, TALENT, WRITER_CANDIDATES, WRITERS } from '../config/balance';
import { getGenre, hasHost, GENRES } from '../config/genres';
import { LINES } from '../config/guide';
import { BUILDINGS, FURNITURE, STUDIO_REQUIREMENTS, type FurnitureType, type RoomType } from '../config/office';
import { TO_RECORD } from '../config/voiceOver';
import { SLOTS } from '../config/world';
import { DAY_BEATS, castName, peopleAt, slotAt, whereabouts } from '../office/layout';
import { buildRoom, buyLicense, createChannel, createShow, hire, scheduleShow, sendToTalentProgramme, setChannelManager, type ActionResult } from './actions';
import { talentBlocker, talentCost } from './staff';
import { FURNITURE_ASSETS } from '../office/assets';
import { sensibleBot } from './bots';
import { madeUpHosts, showQuality, writingSkill } from './broadcast';
import { addMissingEquipment, autoPlaceFurniture, withoutRecordRooms } from './fixtures';
import { generateCandidates } from './generate';
import { guideView } from './guide';
import { createInitialState } from './newGame';
import { employeesWithDesk, findRoom } from './office';
import { rivalPoachAttempt } from './poaching';
import { Rng } from './rng';
import { kindError, proposeRoom } from './rooms';
import { fromSaveFile, toSaveFile } from './save';
import type { GameState, Person, Show } from './state';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';
import { ARTICLES } from '../wiki/articles';

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

/** A TV channel in Coaxia with a manager of its own, beside the radio station. */
function withTv(state: GameState): GameState {
  let s = ok(createChannel(state, { name: 'Test TV', logo: { shape: 'square', color: '#000', initials: 'TV' }, medium: 'tv' }));
  const tvId = s.lastId!;
  s = ok(buyLicense(s, tvId, 'capital'));
  s = hirePerson(s, { role: 'channelManager' });
  const manager = s.lastId!;
  s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
  return ok(setChannelManager(s, tvId, manager));
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
      const side = pool.filter((p) => ['writer', 'editor', 'engineer', 'cook', 'clerk', 'talentManager', 'recruiter', 'scheduler', 'guard', 'lawyer'].includes(p.role)).length;
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

  describe('a studio for every kind of staged show (R68)', () => {
    it('the sitcom, kids’ shows and reality TV each have a studio of their own, and the production studio is gone', () => {
      expect(Object.keys(STUDIO_REQUIREMENTS)).not.toContain('tvProductionStudio');
      for (const [genre, type, set] of [['sitcom', 'tvSitcomStudio', 'sitcomSet'], ['kids', 'tvKidsStudio', 'kidsSet'], ['reality', 'tvRealityStudio', 'realitySet']] as const) {
        expect(getGenre(genre)).toMatchObject({ studio: type, set });
        expect(STUDIO_REQUIREMENTS[type]![set]).toBe(1);
        expect(FURNITURE[set].rooms).toEqual([type]);
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

  describe('a cast on the set (R87)', () => {
    it('plays a sitcom or reality show while it is on, one of them in the confession booth', () => {
      for (const [genre, type, cast] of [['sitcom', 'tvSitcomStudio', 3], ['reality', 'tvRealityStudio', 5]] as const) {
        let s: GameState & { lastId?: string } = withTv(structuredClone(station()));
        s.techs.push('realityFormat');
        s = room(s, type);
        const studio = s.lastId!;
        const team = writers(s, 2);
        s = producers(team, 5);
        const staff = (s as GameState & { staff: string[] }).staff;
        s = ok(createShow(s, { name: 'On the set', genre, hostId: null, staffIds: staff, writerIds: team.writers, studioId: studio }));
        const showId = s.lastId!;
        const tv = s.channels.find((c) => c.medium === 'tv')!;
        const slot = SLOTS.indexOf('evening');
        s = ok(scheduleShow(s, tv.id, slot, showId));
        const beat = Array.from({ length: DAY_BEATS }, (_, b) => b).find((b) => slotAt(b) === slot)!;
        const people = [...peopleAt(s, beat).values()].filter((p) => p.id.startsWith('visitor-cast-'));
        expect(people, genre).toHaveLength(cast);
        expect(people.every((p) => p.roomId === studio)).toBe(true);
        expect(people.map((p) => p.name)).toEqual(people.map((_, i) => castName(showId, i)));
        expect(whereabouts(s, people[0]!)).toMatch(/in the cast of “On the set”/);
        // Not while something else is on.
        const other = Array.from({ length: DAY_BEATS }, (_, b) => b).find((b) => slotAt(b) === 0)!;
        expect([...peopleAt(s, other).values()].some((p) => p.id.startsWith('visitor-cast-'))).toBe(false);
      }
    });
  });

  describe('bigger buildings (R109)', () => {
    it('has six floors in town and four in the country, opened by the company’s value', () => {
      expect(BUILDINGS.standard.floors).toBe(6);
      expect(BUILDINGS.long.floors).toBe(4);
      expect(FLOOR_UNLOCK_VALUE[6]).toBeGreaterThan(FLOOR_UNLOCK_VALUE[5]!);
      expect(FLOOR_UNLOCK_VALUE[4]).toBeGreaterThan(FLOOR_UNLOCK_VALUE[3]!);
      let s = { ...structuredClone(station()), floorsUnlocked: 3, money: FLOOR_UNLOCK_VALUE[4]! * 1.5 };
      for (let day = 0; day < 31; day++) s = tick(s);
      expect(s.floorsUnlocked).toBe(4);
      expect(s.messages.some((m) => /floor 4 is now open/.test(m.text))).toBe(true);
      expect(ok(buildRoom(s, { ...proposeRoom(s, 4, 'office')!, type: 'office' })).rooms.at(-1)!.floor).toBe(4);
    });
  });

  describe('a month’s notice (R107)', () => {
    it('a host who is leaving is not courted again', () => {
      const s = structuredClone(station());
      for (const host of s.employees.filter((e) => e.role === 'host')) {
        host.fame = 90;
        host.leaving = { on: s.day + POACH.noticeDays, rivalId: s.rivals[0]!.id };
      }
      // A roll that always says yes.
      const yes = { next: () => 0, int: (min: number) => min, pick: <T>(items: readonly T[]) => items[0]! } as unknown as Rng;
      rivalPoachAttempt(s, yes);
      expect(s.poachOffers).toEqual([]);
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

  describe('the talent programme (R108)', () => {
    it('takes a weak host without a show away for a year, and brings them back much better', () => {
      // A talent manager in a workshop arranges it (0.18.0).
      let s: GameState & { lastId?: string } = hirePerson(hirePerson(room(station(), 'workshop'), { role: 'talentManager' }), { role: 'host', skill: 30 });
      const host = s.lastId!;
      expect(talentBlocker(s, s.employees.find((e) => e.id === host)!)).toBeNull();
      const strong = s.employees.find((e) => e.role === 'host' && e.skill > TALENT.maxSkill);
      if (strong) expect(talentBlocker(s, strong)).toMatch(/skill 40 or less/);
      const money = s.money;
      s = ok(sendToTalentProgramme(s, host));
      const away = s.employees.find((e) => e.id === host)!;
      expect(away.talentUntil).toBe(s.day + TALENT.days);
      expect(money - s.money).toBe(talentCost(away));
      // Nobody else meanwhile, and no show for them.
      s = hirePerson(s, { role: 'host', skill: 20 });
      expect(talentBlocker(s, s.employees.find((e) => e.id === s.lastId)!)).toMatch(/one at a time/);
      expect(createShow(s, { name: 'Too soon', genre: 'top40', hostId: host, staffIds: [], studioId: null })).toMatchObject({ ok: false, error: expect.stringMatching(/talent programme/) });
      s = advance(s, TALENT.days);
      const back = s.employees.find((e) => e.id === host)!;
      expect(back.talentUntil).toBeNull();
      expect(back.skill).toBeGreaterThanOrEqual(30 + TALENT.skillGain.min);
      expect(s.messages.some((m) => m.text.includes('through the talent programme'))).toBe(true);
    });
  });

  describe('the reality set', () => {
    it('has its turned couch facing the low table, and whoever sits on it too', () => {
      const parts = FURNITURE_ASSETS.realitySet.parts.filter((p) => 'model' in p && p.model === 'sofa');
      // A couch faces south unturned; three quarter turns face it west, towards the table in the middle.
      expect(parts.map((p) => p.turn ?? 0)).toEqual([0, 3]);
      expect(FURNITURE_ASSETS.realitySet.spots![2]).toMatchObject({ turn: 1 });
    });
  });

  describe('Penny (0.14.0)', () => {
    const asked = (s: GameState, id: string) => ({ ...s, guide: { stage: 'on' as const, quiet: 0, seen: [...LINES.map((l) => l.id).filter((x) => x !== id), 'television-later'] } });

    it('says that a sitcom needs writers, that a host works out a month, and that the top floor is open', () => {
      const base = station(130);
      const sitcom = room(base, 'tvSitcomStudio');
      expect(guideView(asked(sitcom, 'writers'))).toMatchObject({ kind: 'hint', line: { id: 'writers' } });
      expect(guideView(asked(writers(sitcom, 1), 'writers'))).toBeNull();

      const leaving = structuredClone(base);
      leaving.employees.find((e) => e.role === 'host')!.leaving = { on: leaving.day + POACH.noticeDays, rivalId: leaving.rivals[0]!.id };
      expect(guideView(asked(leaving, 'notice'))).toMatchObject({ kind: 'hint', line: { id: 'notice' } });

      expect(guideView(asked({ ...base, floorsUnlocked: 6 }, 'top-floor'))).toMatchObject({ kind: 'hint', line: { id: 'top-floor' } });
      expect(guideView(asked({ ...base, floorsUnlocked: 5 }, 'top-floor'))).toBeNull();
      for (const id of ['writers', 'notice', 'top-floor']) expect(TO_RECORD[id]).toBeUndefined();
    });
  });

  describe('a game from 0.13.0', () => {
    it('turns a production studio into the studio of what it made, with that decor, and frees the host of a sitcom', () => {
      let s: GameState & { lastId?: string } = structuredClone(station());
      s = room(s, 'tvKidsStudio');
      const kidsRoom = s.lastId!;
      s = room(s, 'tvKidsStudio');
      const mixed = s.lastId!;
      s = hirePerson(s, { role: 'host', specialties: ['sitcom'] });
      const host = s.lastId!;
      // As 0.13.0 had them: production studios without a set, one making a kids' show, one a sitcom and a kids' show.
      for (const id of [kidsRoom, mixed]) {
        const r = findRoom(s, id)!;
        r.type = 'tvProductionStudio' as RoomType;
        r.furniture = r.furniture.filter((f) => f.type !== 'kidsSet');
      }
      findRoom(s, kidsRoom)!.name = 'TV production studio 1';
      findRoom(s, mixed)!.name = 'Studio Two';
      const show = (id: string, genre: Show['genre'], studioId: string, hostId: string | null = null): Show => ({ id, name: id, genre, hostId, staffIds: [], writerIds: [], editorIds: [], studioId, freshness: 1, tone: 'normal' });
      s.shows.push(show('kids', 'kids', kidsRoom), show('sitcom', 'sitcom', mixed, host), show('sitcom2', 'sitcom', mixed), show('kids2', 'kids', mixed));
      const old = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      for (const sh of old.state.shows) delete sh.writerIds;
      for (const e of old.state.employees) delete e.leaving;
      const rivalSitcom = old.state.rivals.flatMap((r: GameState['rivals'][number]) => r.channels).flatMap((c: { schedule: { genre: string; hostName: string }[] }) => c.schedule);
      rivalSitcom[0].genre = 'sitcom';
      rivalSitcom[0].hostName = 'Old Host';

      const { state } = fromSaveFile({ ...old, version: 29 });
      expect(findRoom(state, kidsRoom)).toMatchObject({ type: 'tvKidsStudio', name: 'TV kids’ studio 1' });
      expect(findRoom(state, kidsRoom)!.furniture.some((f) => f.type === 'kidsSet')).toBe(true);
      // Most of what the second made were sitcoms: it is a sitcom studio, and keeps the name it was given.
      expect(findRoom(state, mixed)).toMatchObject({ type: 'tvSitcomStudio', name: 'Studio Two' });
      expect(findRoom(state, mixed)!.furniture.some((f) => f.type === 'sitcomSet')).toBe(true);
      const studioOf = (id: string) => state.shows.find((x) => x.id === id)!.studioId;
      expect([studioOf('kids'), studioOf('sitcom'), studioOf('sitcom2'), studioOf('kids2')]).toEqual([kidsRoom, mixed, mixed, null]);
      expect(state.messages.some((m) => /“kids2” needs a TV kids’ studio now/.test(m.text))).toBe(true);
      // The sitcom's host is free, and the sitcom needs writers.
      expect(state.shows.find((x) => x.id === 'sitcom')!.hostId).toBeNull();
      expect(state.messages.some((m) => /“sitcom” needs writers now.*is free for another show/.test(m.text))).toBe(true);
      expect(state.shows.every((x) => Array.isArray(x.writerIds))).toBe(true);
      expect(state.employees.every((e) => e.leaving === null)).toBe(true);
      expect(state.rivals.flatMap((r) => r.channels).flatMap((c) => c.schedule)[0]!.hostName).toBe('');
      // Every show that has a studio has one of its kind.
      for (const sh of state.shows.filter((x) => x.studioId)) expect(findRoom(state, sh.studioId!)!.type, sh.id).toBe(getGenre(sh.genre).studio);
    });
  });

  it('has a wiki article about writers', () => {
    const article = ARTICLES.find((a) => a.id === 'writers');
    expect(article).toBeDefined();
    expect(JSON.stringify(article)).toMatch(/writers’ room/);
  });
});
