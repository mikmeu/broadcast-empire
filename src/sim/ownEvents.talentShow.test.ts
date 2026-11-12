import { describe, expect, it } from 'vitest';
import { EPISODE_COST, JURY_FAME_WEIGHT, JURY_SIZE, STUDIO_AUDIENCE, VOTES } from '../config/balance';
import { HINTS } from '../config/guide';
import { GENRES, getGenre } from '../config/genres';
import { FURNITURE, STUDIO_REQUIREMENTS } from '../config/office';
import { getTech } from '../config/tech';
import { TO_RECORD } from '../config/voiceOver';
import { airtimes } from '../office/day';
import { beatOfHour, peopleAt } from '../office/layout';
import { buildRoom, createShow, type ActionResult, type ShowInput } from './actions';
import { sensibleBot } from './bots';
import { hasCapacity, hostSkill, showFame, showLoad, showQuality, studioAudience } from './broadcast';
import { addMissingEquipment, autoPlaceFurniture } from './fixtures';
import { generateCandidates } from './generate';
import { DUE } from './guide';
import { createInitialState } from './newGame';
import { proposeRoom } from './rooms';
import { Rng } from './rng';
import { unassign } from './staff';
import { takesVotes } from './calls';
import type { GameState, Show } from './state';
import { advance } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const error = (result: ActionResult) => (result.ok ? 'no error' : result.error);

/**
 * The station of the sensible bot with an event hall that has its whole checklist and a jury table, talent shows
 * researched and five hosts with no show of their own: the host `jh1` and the jurors `jh2`, `jh3`, `jh4`, `jh5`.
 */
function hallWithHosts(table = true): { s: GameState; hall: string; input: ShowInput } {
  let s = structuredClone(advance(unlockAll(sensibleBot(createInitialState(1))), 8));
  s.money = 3_000_000;
  s.techs.push('talentShowFormat');
  const plan = proposeRoom(s, 1, 'eventHall')!;
  const built = ok(buildRoom(s, { ...plan, type: 'eventHall' }));
  const hall = built.lastId!;
  s = ok(addMissingEquipment(built, hall));
  if (table) s = ok(autoPlaceFurniture(s, hall, 'juryTable'));
  const template = s.employees.find((e) => e.role === 'host')!;
  [10, 20, 30, 40, 50].forEach((fame, i) => s.employees.push({ ...structuredClone(template), id: `jh${i + 1}`, name: `Judge ${i + 1}`, fame, specialties: [], away: undefined, backupId: null, talentUntil: null }));
  const input: ShowInput = { name: 'Stars of Tomorrow', genre: 'talentShow', hostId: 'jh1', staffIds: [], studioId: hall, jury: ['jh2', 'jh3', 'jh4'] };
  return { s, hall, input };
}

describe('the talent show (#405)', () => {
  it('is a produced TV genre of the event hall, researched in 2001, where viewers vote and seats count', () => {
    const genre = getGenre('talentShow');
    expect(genre).toMatchObject({ medium: 'tv', kind: 'produced', studio: 'eventHall', unlockYear: 2001, requiredStaff: 4, set: 'juryTable' });
    expect(getTech('talentShowFormat')).toMatchObject({ name: 'Talent shows', year: 2001, cost: 1_000, effects: { unlocks: 'talentShow' } });
    expect(FURNITURE.juryTable).toMatchObject({ rooms: ['eventHall'], unlock: 'talentShowFormat', w: 3, h: 1 });
    // A hall without a jury table still holds events.
    expect(STUDIO_REQUIREMENTS.eventHall).not.toHaveProperty('juryTable');
    expect(EPISODE_COST.talentShow).toBeGreaterThan(0);
    expect(VOTES.genres).toContain('talentShow');
    expect(takesVotes('talentShow')).toBe(true);
    expect(STUDIO_AUDIENCE.genres).toContain('talentShow');
  });

  it('needs three hosts on the jury, none of them its own host, and each free of other shows', () => {
    const { s, input } = hallWithHosts();
    const made = ok(createShow(s, input));
    const show = made.shows.find((x) => x.id === made.lastId)!;
    expect(show.jury).toEqual(['jh2', 'jh3', 'jh4']);
    expect(error(createShow(s, { ...input, jury: ['jh2', 'jh3'] }))).toMatch(/three different hosts/);
    expect(error(createShow(s, { ...input, jury: ['jh2', 'jh3', 'jh3'] }))).toMatch(/three different hosts/);
    expect(error(createShow(s, { ...input, jury: undefined }))).toMatch(/three different hosts/);
    expect(error(createShow(s, { ...input, jury: ['jh1', 'jh3', 'jh4'] }))).toMatch(/presents the show/);
    const busy = s.shows.find((x) => x.hostId)!.hostId!;
    expect(error(createShow(s, { ...input, jury: [busy, 'jh3', 'jh4'] }))).toMatch(/already has a show/);
    const talent = structuredClone(s);
    talent.employees.find((e) => e.id === 'jh3')!.talentUntil = s.day + 30;
    expect(error(createShow(talent, input))).toMatch(/talent programme/);
    const notHost = s.employees.find((e) => e.role !== 'host')!.id;
    expect(error(createShow(s, { ...input, jury: ['jh2', 'jh3', notHost] }))).toMatch(/Only hosts/);
  });

  it('keeps a juror to one jury: they present nothing else and a host with a show cannot join', () => {
    const { s, input } = hallWithHosts();
    const made = ok(createShow(s, input));
    expect(showLoad(made, 'jh2')).toBe(1);
    expect(hasCapacity(made, 'jh2')).toBe(false);
    expect(error(createShow(made, { ...input, name: 'Second', hostId: 'jh5', jury: ['jh2', 'jh3', 'jh4'] }))).toMatch(/already has a show/);
    expect(error(createShow(made, { ...input, name: 'Third', hostId: 'jh2', jury: ['jh5', 'jh3', 'jh4'] }))).toMatch(/already presents a show/);
  });

  it('is dropped from a show of any other genre', () => {
    const { s, input } = hallWithHosts();
    const radio = s.shows.find((x) => x.hostId)!;
    const made = ok(createShow(s, { name: 'Radio', genre: radio.genre, hostId: 'jh1', staffIds: [], studioId: radio.studioId, jury: input.jury }));
    expect(made.shows.find((x) => x.id === made.lastId)!.jury).toBeUndefined();
  });

  it('empties the seat of a juror who leaves', () => {
    const { s, input } = hallWithHosts();
    const made = ok(createShow(s, input));
    const draft = structuredClone(made);
    unassign(draft, 'jh3');
    expect(draft.shows.find((x) => x.id === made.lastId)!.jury).toEqual(['jh2', 'jh4']);
  });

  describe('fame and quality', () => {
    const talent = (state: GameState, jury: string[] = ['jh2', 'jh3', 'jh4']): Show => {
      const show: Show = { id: 'talent', name: 'Stars', genre: 'talentShow', hostId: 'jh1', staffIds: [], writerIds: [], editorIds: [], jury, studioId: state.rooms.find((r) => r.type === 'eventHall')!.roomId, freshness: 1, tone: 'normal' };
      state.shows.push(show);
      return show;
    };

    it('is the host’s fame plus half of each juror’s, never over 100', () => {
      const { s } = hallWithHosts();
      const show = talent(s);
      expect(JURY_FAME_WEIGHT).toBe(0.5);
      expect(showFame(s, show)).toBeCloseTo(10 + 0.5 * (20 + 30 + 40));
      for (const id of ['jh2', 'jh3', 'jh4']) s.employees.find((e) => e.id === id)!.fame = 100;
      expect(showFame(s, show)).toBe(100);
    });

    it('counts a juror who is away or on strike for nothing that day', () => {
      const { s } = hallWithHosts();
      const show = talent(s);
      s.employees.find((e) => e.id === 'jh4')!.away = { reason: 'leave', from: s.day, until: s.day + 5, temp: null };
      expect(showFame(s, show)).toBeCloseTo(10 + 0.5 * (20 + 30));
    });

    it('does not air with fewer than three jurors, or with no jury table in its hall', () => {
      const { s } = hallWithHosts();
      const show = talent(s, ['jh2', 'jh3']);
      expect(showQuality(s, show).problems).toContain('The jury needs three hosts');
      expect(showQuality(s, show).quality).toBe(0);
      const bare = hallWithHosts(false);
      const without = talent(bare.s);
      expect(showQuality(bare.s, without).problems).toContain('Its studio has no jury table');
      const complete = hallWithHosts();
      expect(showQuality(complete.s, talent(complete.s)).problems).not.toContain('The jury needs three hosts');
      expect(showQuality(complete.s, talent(complete.s)).problems).not.toContain('Its studio has no jury table');
    });

    it('counts a game show specialist in full as its host, and audience seating makes it better', () => {
      const base = { skill: 60, away: undefined };
      expect(hostSkill({ ...base, specialties: ['gameShow'] }, 'talentShow')).toBe(hostSkill({ ...base, specialties: ['talentShow'] }, 'talentShow'));
      expect(hostSkill({ ...base, specialties: ['gameShow'] }, 'talentShow')).toBeGreaterThan(hostSkill({ ...base, specialties: ['rock'] }, 'talentShow'));
      expect(hostSkill({ ...base, specialties: ['gameShow'] }, 'tvNews')).toBeLessThan(hostSkill({ ...base, specialties: ['gameShow'] }, 'talentShow'));
      const { s } = hallWithHosts();
      expect(studioAudience(s, talent(s))).toBeCloseTo(1 + 2 * STUDIO_AUDIENCE.perBlock);
    });
  });

  it('makes its jurors famous as it airs, but not one who is away', () => {
    const { s } = hallWithHosts();
    // The tick treats any aired show alike: give a show that is on the air a jury of hosts with no fame.
    const aired = s.shows.find((x) => x.hostId && s.channels.some((c) => c.schedule.includes(x.id)))!;
    aired.jury = ['jh2', 'jh3', 'jh4'];
    for (const id of aired.jury) s.employees.find((e) => e.id === id)!.fame = 0;
    s.employees.find((e) => e.id === 'jh4')!.away = { reason: 'leave', from: s.day, until: s.day + 200, temp: null };
    const after = advance(s, 20);
    const fame = (id: string) => after.employees.find((e) => e.id === id)!.fame;
    expect(fame('jh2')).toBeGreaterThan(0);
    expect(fame('jh3')).toBeGreaterThan(0);
    expect(fame('jh4')).toBe(0);
    // A host with no show who is not on a jury stays at nothing.
    expect(after.employees.find((e) => e.id === 'jh5')!.fame).toBeLessThan(50);
  });

  it('is never drawn as a host’s specialty', () => {
    const s = createInitialState(1);
    const rng = new Rng(5);
    for (let i = 0; i < 30; i++) {
      for (const person of generateCandidates(s, rng, 2010).filter((p) => p.role === 'host')) expect(person.specialties).not.toContain('talentShow');
    }
    expect(GENRES.some((g) => g.id === 'talentShow')).toBe(true);
  });

  it('is introduced by Penny once it is researched and no hall has a jury table', () => {
    const hint = HINTS.find((h) => h.id === 'talent-show')!;
    expect(hint.speaker).toBe('penny');
    expect(TO_RECORD['talent-show']).toBe('new');
    const { s: withTable } = hallWithHosts();
    expect(DUE['talent-show']!(createInitialState(1))).toBe(false);
    expect(DUE['talent-show']!(withTable)).toBe(false);
    const { s: bare } = hallWithHosts(false);
    expect(DUE['talent-show']!(bare)).toBe(true);
  });

  it('puts the host on the stage and the jurors at the jury table while it is on', () => {
    const { s, hall, input } = hallWithHosts();
    const made = ok(createShow(s, input));
    const show = made.shows.find((x) => x.id === made.lastId)!;
    made.channels[0]!.schedule[0] = show.id;
    const hour = airtimes(made, show)[0]![0] + 0.5;
    const room = made.rooms.find((r) => r.roomId === hall)!;
    const people = peopleAt(made, beatOfHour(hour));
    const inHall = (id: string) => people.get(id)!;
    const table = room.furniture.find((f) => f.type === 'juryTable')!;
    const stage = room.furniture.find((f) => f.type === 'stage')!;
    expect(inHall('jh1')).toMatchObject({ roomId: hall, status: 'onAir' });
    expect(inHall('jh1').x).toBeGreaterThanOrEqual(room.x + stage.x);
    const jurors = ['jh2', 'jh3', 'jh4'].map(inHall);
    for (const juror of jurors) expect(juror).toMatchObject({ roomId: hall, status: 'onAir', show: 'Stars of Tomorrow' });
    expect(new Set(jurors.map((j) => `${j.x},${j.z}`)).size).toBe(JURY_SIZE);
    for (const juror of jurors) {
      expect(juror.x).toBeGreaterThanOrEqual(room.x + table.x);
      expect(juror.x).toBeLessThanOrEqual(room.x + table.x + 3);
    }
  });
});
