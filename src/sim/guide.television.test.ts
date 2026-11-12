import { describe, expect, it } from 'vitest';
import { ACTIVE_REGIONS, LICENSE } from '../config/balance';
import { HINTS, STEPS, TV_STEPS } from '../config/guide';
import { buildRoom, buyLicense, buyTitle, createChannel, createShow, hire, scheduleShow, setChannelManager, type ActionResult } from './actions';
import { autoPlaceFurniture, setUpPostRoom } from './fixtures';
import { growthBot, sensibleBot, type Bot } from './bots';
import { runningResult } from './economy';
import { TV_EPISODES, TV_OFFER, acknowledge, guideFinished, guideView, inTvChapter, postpone, setGuide, startTvChapter, stepDone } from './guide';
import { licenseMonthly, licensePrice, LIST_PRICES } from './licenses';
import { proposeRoom } from './rooms';
import { createInitialState } from './newGame';
import { slow } from './slow';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { PLAYER, type GameState, type Show } from './state';
import { tick } from './tick';
import { isUnlocked, unlockAll } from './unlocks';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** The sensible bot's company after a number of days. */
function company(days: number, seed = 1, bot: Bot = sensibleBot): GameState {
  let s = createInitialState(seed);
  for (let day = 0; day < days; day++) s = tick(bot(s));
  return s;
}

describe('version 0.10.0', () => {
  describe('a month that pays its own way (R42)', () => {
    it('Penny and the first profitable month go by the running result, like the monthly report', () => {
      // The sensible bot's January now runs about €500 short: it keeps its records in a library and a post room, and their rent
      // (35 tiles) is more than its first month had to spare (#43, measured in version018.test.ts). The growth bot's clears it.
      const s = company(31, 1, growthBot);
      const january = s.monthlyReports[0]!;
      // The bot's January: the shopping makes it close down, while the company already earns what it costs to run.
      expect(january.net).toBeLessThan(0);
      expect(runningResult(january)).toBeGreaterThan(0);
      expect(s.milestones.map((m) => m.id)).toContain('firstProfit');
      expect(isUnlocked(s, 'sales')).toBe(true);
      // So there is no month to sit out: the step “Into the black” is done on the first of February.
      expect(stepDone(s, 'black')).toBe(true);

      // A January that ran at a loss leaves it open, whatever else was spent.
      const loss: GameState = { ...s, unlocked: [], milestones: [], monthlyReports: [{ ...january, revenue: 0 }] };
      expect(stepDone(loss, 'black')).toBe(false);
      expect(guideView(setGuide({ ...loss, guide: { ...loss.guide, seen: [] } }, true))?.kind).toBe('step');
    });
  });

  describe('five shows first, then the schedule (R55)', () => {
    it('Penny has the shows made before she talks about slots', () => {
      const ids = STEPS.map((step) => step.id);
      expect(ids.slice(ids.indexOf('show'), ids.indexOf('show') + 3)).toEqual(['show', 'full-day', 'schedule']);
      const s = company(0);
      expect(stepDone(s, 'full-day')).toBe(false);
      const five: GameState = { ...s, shows: Array.from({ length: 5 }, (_, n): Show => ({ id: `s${n}`, name: `s${n}`, genre: 'top40', hostId: null, staffIds: [], writerIds: [], editorIds: [], studioId: null, freshness: 1, tone: 'normal' })) };
      expect(stepDone(five, 'full-day')).toBe(true);
      expect(stepDone(five, 'schedule')).toBe(false);
    });
  });

  describe('television, the small way (R64)', () => {
    it('a TV license costs a fifth less than it did', () => {
      expect(LICENSE.tv.basePrice).toBe(160_000);
      expect(licensePrice('tv', 'capital', LIST_PRICES)).toBe(160_000);
      expect(licenseMonthly('tv', 'capital', LIST_PRICES)).toBeLessThan(13_000);
    });

    /** Does what a step of the television chapter asks for, the way Penny says. */
    function follow(state: GameState, stepId: string): GameState {
      const tv = () => state.channels.find((c) => c.medium === 'tv')!;
      switch (stepId) {
        case 'tv-channel':
          return ok(createChannel(state, { name: 'Coax TV', logo: { shape: 'circle', color: '#6631d2', initials: 'TV' }, medium: 'tv' }));
        case 'tv-manager': {
          const candidate = [...state.candidates.filter((c) => c.role === 'channelManager')].sort((a, b) => b.skill - a.skill)[0]!;
          let s = ok(hire(state, candidate.id));
          s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
          return ok(setChannelManager(s, tv().id, candidate.id));
        }
        case 'tv-license':
          return ok(buyLicense(state, tv().id, 'capital'));
        case 'tv-post':
          return ok(setUpPostRoom(state));
        case 'tv-library': {
          const place = [1, 2, 3].map((floor) => (floor <= state.floorsUnlocked ? proposeRoom(state, floor, 'library') : null)).find(Boolean)!;
          const built = buildRoom(state, { ...place, type: 'library' });
          if (!built.ok) throw new Error(built.error);
          return ok(autoPlaceFurniture(built.state, built.id!, 'shelving'));
        }
        case 'tv-titles': {
          const series = state.market.titles.filter((t) => t.genre === 'series').sort((a, b) => b.quality - a.quality)[0]!;
          return ok(buyTitle(state, series.id));
        }
        case 'tv-show': {
          const made = createShow(state, { name: 'Evening Series', genre: 'series', hostId: null, staffIds: [], studioId: null });
          if (!made.ok) throw new Error(made.error);
          return ok(scheduleShow(made.state, tv().id, 3, made.id!));
        }
        default:
          return acknowledge(state, stepId);
      }
    }

    /** The company with its monthly reports made over to these running results, oldest first. */
    function reports(state: GameState, results: number[]): GameState {
      const model = state.monthlyReports[state.monthlyReports.length - 1]!;
      return { ...state, monthlyReports: results.map((result) => ({ ...model, revenue: model.revenue - runningResult(model) + result })) };
    }
    /** Six months, the last three in the black: steady enough for her offer (#50). */
    const STEADY = [-1_000, 1_000, -1_000, 1_000, 1_000, 1_000];
    /** A company past the first weeks with the money for television, that has heard these lines. */
    let played: GameState | undefined;
    function ready(seen: string[]): GameState {
      // Played once for all the tests that use it: the full suite runs on a busy machine.
      played ??= company(120, 1, growthBot);
      // Without the library, post room and records the bot keeps for its music (0.18.0): the chapter on television builds them itself.
      const base = reports({ ...played, rooms: played.rooms.filter((r) => r.type !== 'library' && r.type !== 'postRoom'), records: [] }, STEADY);
      return { ...base, money: 600_000, negativeMonths: 0, poachOffers: [], guide: { stage: 'on', quiet: 0, seen } };
    }
    /** Every step of the first weeks and every hint, but these. */
    const allBut = (...ids: string[]) => [...STEPS, ...HINTS].map((line) => line.id).filter((id) => !ids.includes(id));
    /** Follows the chapter on television to its end, taking every hint that cuts in; with the steps in the order she gave them. */
    function walk(state: GameState): { s: GameState; steps: string[]; hints: string[] } {
      let s = state;
      const steps: string[] = [];
      const hints: string[] = [];
      for (let guard = 0; guard < 80 && inTvChapter(s); guard++) {
        const view = guideView(s)!;
        if (view.kind === 'hint') {
          // She says where she goes back to, and goes back there.
          expect(view.resumes).toMatchObject({ chapter: 'television', total: TV_STEPS.length });
          hints.push(view.line.id);
          const next = guideView(acknowledge(s, view.line.id))!;
          if (next.kind === 'step') expect(next).toMatchObject({ chapter: 'television', index: view.resumes!.index });
          s = acknowledge(s, view.line.id);
          continue;
        }
        expect(view).toMatchObject({ kind: 'step', chapter: 'television', total: TV_STEPS.length });
        if (steps[steps.length - 1] !== view.line.id) steps.push(view.line.id);
        s = follow(s, view.line.id);
      }
      return { s, steps, hints };
    }

    it('Penny offers it once the company has paid its way for a few months, not before (#50)', () => {
      const s = ready(allBut('television'));
      expect(TV_OFFER).toEqual({ reports: 6, black: 3 });
      expect(guideView(s)).toMatchObject({ kind: 'hint', line: { id: 'television' } });
      // Four months, all in the black: too early.
      expect(guideView(reports(s, [1_000, 1_000, 1_000, 1_000]))).toBeNull();
      // Six months, but the last of them in the red.
      expect(guideView(reports(s, [1_000, 1_000, 1_000, 1_000, 1_000, -1_000]))).toBeNull();
      // Still not without the money.
      expect(guideView({ ...s, money: 100_000 })).toBeNull();
    });

    it('auctions and titles running low wait until the chapter is done; what still cuts in is followed by the same step (#50)', () => {
      // A company that has heard no hints, with a license and a rights auction open for television all along.
      let s = unlockAll(ready([...STEPS.map((line) => line.id), 'television']));
      s = {
        ...s,
        // Not in the capital, where she has the player buy the license.
        auctions: [...s.auctions, { id: 'tv-auction', medium: 'tv', regionId: ACTIVE_REGIONS.find((r) => r !== 'capital')!, reserve: 160_000, endsOn: s.day + 60, interested: 1, bid: null, holder: null }],
        rightsAuctions: [{ id: 'rights', eventId: 'world-cup', name: 'The World Cup', reserve: 100_000, endsOn: s.day + 60, interested: 1, bid: null }],
      };
      const { s: done, steps, hints } = walk(s);
      expect(steps).toEqual(TV_STEPS.map((line) => line.id));
      expect(hints.filter((id) => ['auction', 'rights', 'titles-low'].includes(id))).toEqual([]);
      // Once she is done with television, they come up.
      const after: string[] = [];
      let t = done;
      for (let view = guideView(t); view && after.length < 40; view = guideView(t)) {
        expect(view.kind).toBe('hint');
        after.push(view.line.id);
        t = acknowledge(t, view.line.id);
      }
      expect(after).toEqual(expect.arrayContaining(['auction', 'rights']));
    });

    it.each([
      ['red', (s: GameState): GameState => ({ ...s, negativeMonths: 1 })],
      ['bailout', (s: GameState): GameState => ({ ...s, bailedOut: true })],
      ['strike', (s: GameState): GameState => ({ ...s, unrest: { sales: { since: 0, warnedOn: s.day, strikeUntil: null } } })],
      ['poaching', (s: GameState): GameState => ({ ...s, poachOffers: [{} as GameState['poachOffers'][number]] })],
      ['notice', (s: GameState): GameState => ({ ...s, employees: s.employees.map((e, i) => (i === 0 ? { ...e, leaving: { on: s.day + 30, rivalId: s.rivals[0]!.id } } : e)) })],
      ['maintenance', (s: GameState): GameState => ({ ...s, employees: s.employees.filter((e) => e.role !== 'maintenance'), rooms: s.rooms.map((r, i) => (i === 0 ? { ...r, issue: 'lighting' as never } : r)) })],
      ['renewal', (s: GameState): GameState => ({ ...s, auctions: [{ id: 'renewal', medium: 'radio', regionId: 'capital', reserve: 1, endsOn: s.day + 30, interested: 1, bid: null, holder: { ownerId: PLAYER, channelId: s.channels[0]!.id, value: 1 } }] })],
    ])('the chapter carries on after %s cuts in (#50)', (id, force) => {
      // In the chapter, at its third step.
      let s = acknowledge(ready(allBut('television', id)), 'television');
      for (const line of TV_STEPS.slice(0, 2)) while (!stepDone(s, line.id)) s = follow(s, line.id);
      const at = guideView(s);
      expect(at).toMatchObject({ kind: 'step', index: 2, chapter: 'television' });
      const cut = force(s);
      expect(guideView(cut)).toMatchObject({ kind: 'hint', line: { id }, resumes: { chapter: 'television', index: 2, total: TV_STEPS.length } });
      expect(guideView(acknowledge(cut, id))).toMatchObject({ kind: 'step', index: 2, chapter: 'television', line: { id: at!.line.id } });
      // And so it does after Penny was sent away and called back in.
      expect(guideView(setGuide(setGuide(s, false), true))).toEqual(at);
    });

    it('the Settings start the chapter again: after “Not now”, with a channel on the air, and with Penny sent away (#50)', () => {
      const offered = ready(allBut('television'));
      // After “Not now”, from its first step.
      const later = postpone(offered, 'television');
      expect(inTvChapter(later)).toBe(false);
      const again = startTvChapter(later);
      expect(guideView(again)).toMatchObject({ kind: 'step', index: 0, chapter: 'television', line: { id: 'tv-channel' } });
      // While it is on, the button does nothing.
      expect(startTvChapter(again)).toBe(again);
      // Nor during her first weeks.
      const firstWeeks: GameState = { ...offered, guide: { stage: 'on', quiet: 0, seen: [] } };
      expect(startTvChapter(firstWeeks)).toBe(firstWeeks);

      // With a TV channel on the air, only her last word is left.
      const { s: aired } = walk(again);
      expect(inTvChapter(aired)).toBe(false);
      const replay = startTvChapter(aired);
      expect(guideView(replay)).toMatchObject({ kind: 'step', chapter: 'television', line: { id: 'tv-finish' }, index: TV_STEPS.length - 1 });
      expect(inTvChapter(acknowledge(replay, 'tv-finish'))).toBe(false);

      // Penny sent away in her first weeks: she comes back for television, not for the office clock.
      const away: GameState = { ...offered, guide: { stage: 'off', quiet: 0, seen: [] } };
      const back = startTvChapter(away);
      expect(back.guide.stage).toBe('on');
      expect(guideFinished(back)).toBe(true);
      expect(inTvChapter(back)).toBe(true);
      const view = guideView(back)!;
      if (view.kind === 'hint') expect(view.resumes).toMatchObject({ chapter: 'television', index: 0 });
      else expect(view).toMatchObject({ kind: 'step', chapter: 'television', index: 0 });
    });

    it('Penny offers to walk through it, and does so step by step when the answer is yes', () => {
      // A company past the first weeks with the money for it, that has heard every other hint.
      let s: GameState = ready(allBut('television'));
      expect(guideView(s)).toMatchObject({ kind: 'hint', line: { id: 'television', later: 'Not now' } });
      // “Not now” takes the hint away, and nothing follows unless the player starts it from the Settings.
      expect(guideView(postpone(s, 'television'))).toBeNull();
      expect(inTvChapter(postpone(s, 'television'))).toBe(false);

      s = acknowledge(s, 'television');
      const steps: string[] = [];
      for (let guard = 0; guard < 40 && inTvChapter(s); guard++) {
        const view = guideView(s);
        expect(view).toMatchObject({ kind: 'step', chapter: 'television', total: TV_STEPS.length });
        const id = view!.line.id;
        if (steps[steps.length - 1] !== id) steps.push(id);
        s = follow(s, id);
      }
      expect(steps).toEqual(TV_STEPS.map((line) => line.id));
      expect(s.library.filter((t) => t.genre === 'series').reduce((sum, t) => sum + t.airingsLeft, 0)).toBeGreaterThanOrEqual(TV_EPISODES);
      const tv = s.channels.find((c) => c.medium === 'tv')!;
      expect(tv.schedule.filter(Boolean)).toHaveLength(1);
      // The first evening on the air: the series goes out, with reruns around it.
      const day = tick(s).lastDay!.channels.find((c) => c.channelId === tv.id)!;
      expect(day.onAir).toBe(true);
      expect(day.slots[3]!.showId).not.toBeNull();
      expect(day.slots[3]!.listeners).toBeGreaterThan(10 * day.slots[0]!.listeners);
      // No studio, no host and no producer were needed for it.
      expect(s.rooms.some((r) => r.type?.startsWith('tv'))).toBe(false);
    });

    // What Penny teaches is tested to work: one programme of series pays for its titles, its license and its manager.
    it.each([1, 2])('pays its own way once the channel is known (seed %i)', (seed) => {
      let s: GameState = company(120, seed, growthBot);
      s = { ...s, money: s.money + 400_000 };
      for (const line of TV_STEPS.slice(0, -1)) while (!stepDone(s, line.id)) s = follow(s, line.id);
      const tv = s.channels.find((c) => c.medium === 'tv')!;
      const spentOnTitles = (state: GameState) => state.ledger.titles + state.monthlyReports.reduce((sum, r) => sum + r.titles, 0);
      const episodes = (state: GameState) => state.library.filter((t) => t.genre === 'series').reduce((sum, t) => sum + t.airingsLeft, 0);
      let income = 0;
      let titlesBefore = 0;
      const [settle, measured] = [90, 180];
      for (let day = 0; day < settle + measured; day++) {
        // The library is kept stocked with the best series on the market, as she says.
        for (const offer of s.market.titles.filter((t) => t.genre === 'series' && t.quality >= 0.5).sort((a, b) => b.quality - a.quality)) {
          if (episodes(s) >= 45) break;
          const bought = buyTitle(s, offer.id);
          if (bought.ok) s = bought.state;
        }
        s = tick(growthBot(s));
        if (day < settle) titlesBefore = spentOnTitles(s);
        else income += s.lastDay!.channels.find((c) => c.channelId === tv.id)!.slots.reduce((sum, slot) => sum + slot.revenue, 0);
      }
      const months = measured / 30;
      const manager = s.employees.find((e) => e.id === tv.managerId)!;
      const costs = (spentOnTitles(s) - titlesBefore) / months + licenseMonthly('tv', 'capital', s) + manager.salary;
      expect(income / months).toBeGreaterThan(costs);
      // And not by so much that it is a licence to print money.
      expect(income / months).toBeLessThan(costs * 2);
    }, slow(120_000));

    it('a second station: Penny brings it up once the company can pay for one', () => {
      const base = company(120, 1, growthBot);
      const one: GameState = { ...base, channels: base.channels.slice(0, 1), money: 5_000, guide: { stage: 'on', quiet: 0, seen: [...[...STEPS, ...HINTS].map((line) => line.id).filter((id) => id !== 'talk-station'), 'television-later'] } };
      expect(guideView(one)).toBeNull();
      expect(guideView({ ...one, money: 200_000 })).toMatchObject({ kind: 'hint', line: { id: 'talk-station' } });
      // Not for a company that has a second channel already.
      if (base.channels.length > 1) expect(guideView({ ...one, channels: base.channels, money: 200_000 })).toBeNull();
    });
  });

  describe('a game from before (save version 26)', () => {
    it('nobody is on a course, the sponsors under contract are known, and television is not walked through unasked', () => {
      const s = company(150, 1, growthBot);
      const old = structuredClone(toSaveFile({ ...s, guide: { ...s.guide, seen: [...s.guide.seen, 'television'] } }, 0)) as unknown as { version: number; state: Record<string, any> };
      old.version = 26;
      delete old.state.relations;
      delete old.state.ledger.training;
      for (const report of old.state.monthlyReports) delete report.training;
      for (const employee of old.state.employees) delete employee.trainingUntil;
      const { version, state } = fromSaveFile(old);
      expect(version).toBe(SAVE_VERSION);
      expect(state.employees.every((e) => e.trainingUntil === null)).toBe(true);
      expect(state.ledger.training).toBe(0);
      expect(state.monthlyReports.every((r) => r.training === 0)).toBe(true);
      expect(Object.keys(state.relations).sort()).toEqual([...new Set(s.contracts.map((c) => c.sponsor))].sort());
      expect(Object.values(state.relations).every((r) => r.level === 1 && r.points === 0)).toBe(true);
      expect(inTvChapter(state)).toBe(false);
      // And it plays on.
      expect(tick(state).day).toBe(state.day + 1);
    });
  });
});
