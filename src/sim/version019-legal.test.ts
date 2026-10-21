import { describe, expect, it } from 'vitest';
import { LEGAL } from '../config/balance';
import { buildRoom, hire, settleCase, setShowTone, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { autoPlaceFurniture } from './fixtures';
import { claimFor, fileLawsuits, hearLawsuits, hasLawyer, lossChance, settlement, suedChance } from './legal';
import { createInitialState } from './newGame';
import { employeesWithDesk } from './office';
import { proposeRoom } from './rooms';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState, Lawsuit, Show, Tone } from './state';
import { advance } from './tick';
import { unlockAll } from './unlocks';
import { GENRES } from '../config/genres';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with a show of a genre on its first slot. */
function stationWith(genre: Show['genre'], tone: Tone = 'normal'): GameState {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  const show: Show = { id: 'sx', name: 'Test show', genre, hostId: null, staffIds: [], writerIds: [], editorIds: [], studioId: null, freshness: 1, tone };
  // Nothing else on the air, so that only this show can be sued.
  for (const channel of s.channels) channel.schedule = channel.schedule.map(() => null);
  s.shows.push(show);
  s.channels[0]!.schedule[0] = show.id;
  s.lawsuits = [];
  return s;
}

/** How many of `months` first-of-the-month rolls sue the show. */
function suedIn(state: GameState, months: number): number {
  let sued = 0;
  for (let m = 0; m < months; m++) {
    const draft = structuredClone(state);
    draft.day = state.day + m * 30;
    fileLawsuits(draft);
    sued += draft.lawsuits.length;
  }
  return sued;
}

function withLawyers(state: GameState, count: number): GameState {
  const floor = [1, 2].find((f) => proposeRoom(state, f, 'office'))!;
  let s = ok(buildRoom(state, { ...proposeRoom(state, floor, 'office')!, type: 'office' }));
  const office = s.lastId!;
  for (let i = 0; i < count + 1; i++) s = ok(autoPlaceFurniture(s, office, 'workstation'));
  for (let i = 0; i < count; i++) {
    const id = `lawyer-${i}`;
    s.candidates.push({ id, name: `Lawyer ${i}`, role: 'lawyer', skill: 50, salary: 2_000, specialties: [], fame: 0, department: null, foundFor: null });
    s = ok(hire(s, id));
  }
  return s;
}

const lawsuit = (s: GameState, id = 'ls-test', claim = 100_000): Lawsuit => ({ id, showId: 'sx', showName: 'Test show', source: 'libel', claim, filedOn: s.day - 60, courtOn: s.day, channelId: s.channels[0]!.id });

describe('Lawsuits (0.19.0, R104)', () => {
  it('only talk, the news and reality TV can be sued', () => {
    const sueable = GENRES.filter((g) => suedChance({ genre: g.id, tone: 'bold' }) > 0).map((g) => g.id);
    expect(sueable.sort()).toEqual(['news', 'podcastTalk', 'reality', 'talk', 'talkShow', 'tvNews']);
    expect(suedIn(stationWith('top40', 'bold'), 400)).toBe(0);
    expect(suedIn(stationWith('talk', 'bold'), 400)).toBeGreaterThan(0);
  });

  it('a bold show is sued more often than a careful one', () => {
    const careful = suedIn(stationWith('talk', 'careful'), 1500);
    const normal = suedIn(stationWith('talk', 'normal'), 1500);
    const bold = suedIn(stationWith('talk', 'bold'), 1500);
    expect(careful).toBeLessThan(normal);
    expect(normal).toBeLessThan(bold);
  });

  it('a show off the schedule is not sued, and a show has one case at a time', () => {
    const s = stationWith('talk', 'bold');
    s.channels[0]!.schedule[0] = null;
    expect(suedIn(s, 400)).toBe(0);
    const open = stationWith('talk', 'bold');
    open.lawsuits.push(lawsuit(open));
    expect(suedIn(open, 400)).toBe(400);
  });

  it('the claim grows with the regions and the years', () => {
    expect(claimFor('libel', 2, 1970)).toBe(2 * LEGAL.perRegion.libel);
    expect(claimFor('injury', 1, 1970)).toBe(LEGAL.perRegion.injury);
    expect(claimFor('libel', 1, 1990)).toBeGreaterThan(claimFor('libel', 1, 1970));
    expect(claimFor('libel', 3, 1970)).toBeGreaterThan(claimFor('libel', 1, 1970));
  });

  it('a new case is an e-mail from the channel manager, and from the lawyer once there is one', () => {
    let s = stationWith('talk', 'bold');
    s.nextMessageId = 1_000_000;
    const before = s.messages.length;
    for (let d = 0; d < 500 && s.lawsuits.length === 0; d++) {
      s.day += 30;
      fileLawsuits(s);
    }
    expect(s.lawsuits).toHaveLength(1);
    const mail = s.messages[before]!;
    expect(mail.about).toBe('finance');
    expect(mail.text).toContain('is being sued for libel');
    expect(mail.from.title).toMatch(/Channel manager/);
    s = withLawyers(stationWith('talk', 'bold'), 1);
    for (let d = 0; d < 500 && s.lawsuits.length === 0; d++) {
      s.day += 30;
      fileLawsuits(s);
    }
    expect(s.messages.at(-1)!.from.title).toBe('Lawyer');
  });

  describe('lawyers', () => {
    it('lower the chance of losing, two at most count, and never to nothing', () => {
      const none = stationWith('talk');
      expect(lossChance(none, employeesWithDesk(none))).toBe(LEGAL.loss);
      const one = withLawyers(none, 1);
      const two = withLawyers(none, 2);
      const six = withLawyers(none, 6);
      expect(hasLawyer(one, employeesWithDesk(one))).toBe(true);
      const chance = (s: GameState) => lossChance(s, employeesWithDesk(s));
      expect(chance(one)).toBeLessThan(LEGAL.loss);
      expect(chance(two)).toBeLessThan(chance(one));
      expect(chance(six)).toBeCloseTo(chance(two), 10);
      expect(chance(six)).toBeGreaterThanOrEqual(LEGAL.minLoss);
    });

    it('make settling cheaper', () => {
      const none = stationWith('talk');
      const withOne = withLawyers(none, 1);
      const alone = settlement(none, employeesWithDesk(none), lawsuit(none));
      const defended = settlement(withOne, employeesWithDesk(withOne), lawsuit(withOne));
      expect(alone).toBe(100_000 * LEGAL.settle.alone);
      expect(defended).toBe(100_000 * LEGAL.settle.lawyer);
    });
  });

  describe('settling', () => {
    it('pays the settlement and closes the case', () => {
      const s = stationWith('talk');
      s.lawsuits.push(lawsuit(s));
      const after = ok(settleCase(s, 'ls-test'));
      expect(after.lawsuits).toHaveLength(0);
      expect(s.money - after.money).toBe(50_000);
      expect(after.ledger.legal).toBe(50_000);
    });

    it('needs the money, and a case that is open', () => {
      const s = stationWith('talk');
      s.lawsuits.push(lawsuit(s));
      s.money = 10;
      expect(settleCase(s, 'ls-test').ok).toBe(false);
      expect(settleCase(s, 'nothing').ok).toBe(false);
    });
  });

  describe('the court day', () => {
    /** The cases heard on their court day, one by one, until `want` wins and `want` losses are seen. */
    function heard(want: 'won' | 'lost') {
      for (let n = 0; n < 200; n++) {
        const s = stationWith('talk');
        const region = Object.keys(s.channels[0]!.reputation)[0] as keyof GameState['channels'][number]['reputation'];
        s.channels[0]!.reputation[region] = 0.5;
        s.lawsuits.push(lawsuit(s, `ls-${n}`));
        const after = structuredClone(s);
        hearLawsuits(after, employeesWithDesk(after));
        const paid = s.money - after.money;
        if ((want === 'lost') === (paid > 100_000)) return { s, after, region };
      }
      throw new Error(`No case was ${want}.`);
    }

    it('a lost case costs the claim and the legal costs, and some of the channel’s reputation', () => {
      const { s, after, region } = heard('lost');
      expect(s.money - after.money).toBeCloseTo(100_000 * (1 + LEGAL.costs), 5);
      expect(after.ledger.legal).toBeCloseTo(100_000 * (1 + LEGAL.costs), 5);
      expect(s.channels[0]!.reputation[region]! - after.channels[0]!.reputation[region]!).toBeCloseTo(LEGAL.reputation, 10);
      expect(after.lawsuits).toHaveLength(0);
    });

    it('a won case costs only the legal costs', () => {
      const { s, after, region } = heard('won');
      expect(s.money - after.money).toBe(100_000 * LEGAL.costs);
      expect(after.channels[0]!.reputation[region]).toBe(0.5);
      expect(after.lawsuits).toHaveLength(0);
    });

    it('waits for the court day', () => {
      const s = stationWith('talk');
      s.lawsuits.push({ ...lawsuit(s), courtOn: s.day + 1 });
      hearLawsuits(s, employeesWithDesk(s));
      expect(s.lawsuits).toHaveLength(1);
    });

    it('a case is heard even if its show has been cancelled', () => {
      const s = stationWith('talk');
      s.shows = s.shows.filter((show) => show.id !== 'sx');
      s.lawsuits.push(lawsuit(s));
      hearLawsuits(s, employeesWithDesk(s));
      expect(s.lawsuits).toHaveLength(0);
      expect(s.ledger.legal).toBeGreaterThan(0);
    });
  });

  it('the tone of a show can be changed at any time', () => {
    const s = stationWith('talk');
    expect(ok(setShowTone(s, 'sx', 'bold')).shows.find((x) => x.id === 'sx')!.tone).toBe('bold');
    expect(setShowTone(s, 'nothing', 'bold').ok).toBe(false);
  });

  describe('the save', () => {
    it('loads a save of version 47: every show is normal, nobody is sued', () => {
      const s = stationWith('talk');
      const file = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
      for (const show of file.state.shows) delete show.tone;
      delete file.state.lawsuits;
      delete file.state.ledger.legal;
      for (const report of file.state.monthlyReports) delete report.legal;
      const { version, state } = fromSaveFile({ ...file, version: 47 });
      expect(version).toBe(SAVE_VERSION);
      expect(state.shows.length).toBeGreaterThan(0);
      expect(state.shows.every((show) => show.tone === 'normal')).toBe(true);
      expect(state.lawsuits).toEqual([]);
      expect(state.ledger.legal).toBe(0);
      expect(state.monthlyReports.every((r) => r.legal === 0)).toBe(true);
    });
  });
});
