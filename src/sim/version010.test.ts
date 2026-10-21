import { describe, expect, it } from 'vitest';
import { ACTIVE_REGIONS, EXTRA_PRODUCER, LICENSE, OPENING_SHOWS, RELATIONS, SPORTS_RIGHTS, TRAINING } from '../config/balance';
import { GENRES, getGenre } from '../config/genres';
import { FURNITURE, RENTABLE_ROOM_TYPES, ROOM_SIZES, ROOM_TYPE_NAMES, STUDIO_REQUIREMENTS, isStudioType, type FurnitureType, type RoomType } from '../config/office';
import { existsSync } from 'node:fs';
import { voiceFile } from '../audio/voice';
import { HINTS, LINES, STEPS, TV_STEPS } from '../config/guide';
import { TO_RECORD, VOICE_FOLDER } from '../config/voiceOver';
import { acceptOffer, buildRoom, buyLicense, buyTitle, cancelContract, createChannel, createShow, hire, renameRoom, scheduleShow, sendOnTraining, setChannelManager, setRoomType, type ActionResult } from './actions';
import { autoPlaceFurniture, rentRoom, setUpPostRoom } from './fixtures';
import { hostSkill, productionSkill, rightsBonus, talksOnly } from './broadcast';
import { growthBot, sensibleBot, type Bot } from './bots';
import { runningResult } from './economy';
import { TV_EPISODES, TV_OFFER, acknowledge, guideFinished, guideView, inTvChapter, postpone, setGuide, startTvChapter, stepDone } from './guide';
import { licenseMonthly, licensePrice, LIST_PRICES } from './licenses';
import { proposeRoom } from './rooms';
import { createInitialState } from './newGame';
import { employeesWithDesk, findRoom } from './office';
import { Rng } from './rng';
import { hasFreeShow, pointsForLevel, refreshOffers, relationOf, sponsorRate, workOnRelations } from './sales';
import { slow } from './slow';
import { skillAtWork, trainingBlocker, trainingCost } from './staff';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { PLAYER, type Employee, type GameState, type Show, type SponsorContract, type SponsorOffer } from './state';
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
  describe('a studio for every kind of staged show (R60)', () => {
    it('every produced genre is made in a studio that can be built, and every studio has a size and a checklist', () => {
      for (const genre of GENRES.filter((g) => g.kind === 'produced')) {
        expect(isStudioType(genre.studio), genre.id).toBe(true);
        expect(RENTABLE_ROOM_TYPES, genre.id).toContain(genre.studio);
        expect(STUDIO_REQUIREMENTS[genre.studio], genre.id).toBeDefined();
        // The set a show is made on is on the checklist of its studio, and goes in that studio.
        if (genre.set) {
          expect(STUDIO_REQUIREMENTS[genre.studio]![genre.set], genre.id).toBe(1);
          expect(FURNITURE[genre.set].rooms, genre.id).toEqual([genre.studio]);
        }
      }
      for (const type of RENTABLE_ROOM_TYPES) {
        // What a room needs fits in the size the game proposes for it.
        const area = Object.entries(STUDIO_REQUIREMENTS[type] ?? {}).reduce((sum, [piece, n]) => sum + FURNITURE[piece as FurnitureType].w * FURNITURE[piece as FurnitureType].h * n!, 0);
        expect(area, type).toBeLessThan(ROOM_SIZES[type].w * ROOM_SIZES[type].h);
      }
    });

    it('a game from before keeps its game shows and soaps where the studio made nothing else', () => {
      const techs: GameState['techs'] = ['gameShowFormat', 'soapOperaFormat'];
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

  describe('a sports show without rights (R63)', () => {
    it('talks about sport and draws less; rights for the season show the games', () => {
      const s = createInitialState(1);
      const sports = getGenre('tvSports');
      expect(talksOnly(s, sports)).toBe(true);
      expect(rightsBonus(s, sports)).toBe(SPORTS_RIGHTS.talkOnly);
      // Any rights are better than none.
      expect(SPORTS_RIGHTS.talkOnly).toBeLessThan(SPORTS_RIGHTS.prestige.min);
      const held: GameState = { ...s, sportsRights: [{ id: 'x', name: 'League', prestige: 1.1, endDay: s.day + 100 }] };
      expect(talksOnly(held, sports)).toBe(false);
      expect(rightsBonus(held, sports)).toBe(1.1);
      // Radio commentary and every other genre have nothing to do with rights.
      for (const genre of GENRES.filter((g) => g.id !== 'tvSports')) expect(rightsBonus(s, genre), genre.id).toBe(1);
    });
  });

  describe('the first hiring pool (R41)', () => {
    it('has a host for each of the five shows Penny plans, in every new game', () => {
      for (let seed = 1; seed <= 25; seed++) {
        const hosts = createInitialState(seed).candidates.filter((c) => c.role === 'host');
        const left = [...hosts];
        for (const genre of OPENING_SHOWS) {
          const at = left.findIndex((h) => h.specialties[0] === genre);
          expect(at, `seed ${seed}: no host left for ${genre}`).toBeGreaterThanOrEqual(0);
          left.splice(at, 1);
        }
        // Nobody has the same specialty twice, or more than two.
        for (const host of hosts) expect(new Set(host.specialties).size, `seed ${seed}`).toBe(host.specialties.length);
        for (const host of hosts) expect(host.specialties.length, `seed ${seed}`).toBeLessThanOrEqual(2);
      }
    });

    it('later pools are left to chance', () => {
      const pools = Array.from({ length: 12 }, (_, seed) => company(31, seed + 1).candidates.filter((c) => c.role === 'host' && getGenre(c.specialties[0]!).medium === 'radio'));
      const fits = (pool: GameState['candidates']) => OPENING_SHOWS.every((genre, i) => pool[i]?.specialties[0] === genre);
      expect(pools.some((pool) => !fits(pool))).toBe(true);
    });
  });

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

  describe('sponsor offers (R57)', () => {
    const sponsored = (s: GameState, shows: readonly Show[]): GameState => ({
      ...s,
      offers: [],
      contracts: shows.map((show, n) => ({ id: `c${n}`, showId: show.id, sponsor: 'Test' }) as unknown as SponsorContract),
    });
    const offersAfter = (s: GameState, seed: number) => {
      const draft = structuredClone(s);
      refreshOffers(draft, new Rng(seed), employeesWithDesk(draft));
      return draft.offers;
    };

    it('none come while every show has a sponsor; they come again when a show is free', () => {
      const s = company(150, 1, growthBot);
      expect(s.employees.some((e) => e.role === 'sales')).toBe(true);
      expect(s.shows.length).toBeGreaterThan(1);

      const full = sponsored(s, s.shows);
      expect(hasFreeShow(full, 'radio')).toBe(false);
      for (let seed = 1; seed <= 20; seed++) expect(offersAfter(full, seed)).toEqual([]);

      const oneFree = sponsored(s, s.shows.slice(1));
      expect(hasFreeShow(oneFree, 'radio')).toBe(true);
      expect(Array.from({ length: 20 }, (_, seed) => offersAfter(oneFree, seed + 1).length).some((n) => n > 0)).toBe(true);
      // And only for the medium that has a free show.
      for (let seed = 1; seed <= 20; seed++) for (const offer of offersAfter(oneFree, seed)) expect(offer.medium).toBe('radio');
    });
  });
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

  describe('a name for a room (R61)', () => {
    it('a room takes the name the player gives it, and no two rooms the same one', () => {
      const s = company(10);
      const [studio, office] = [s.rooms.find((r) => r.type === 'radioStudio')!, s.rooms.find((r) => r.type === 'office')!];
      const named = ok(renameRoom(s, studio.roomId, '  The   Fishbowl '));
      expect(findRoom(named, studio.roomId)!.name).toBe('The Fishbowl');
      const error = (result: ActionResult) => (result.ok ? '' : result.error);
      expect(error(renameRoom(named, office.roomId, 'the fishbowl'))).toMatch(/Another room is called The Fishbowl/);
      expect(error(renameRoom(named, office.roomId, '   '))).toMatch(/Give the room a name/);
      // A show made there says so by the new name; nothing else about the room changes.
      expect(findRoom(named, studio.roomId)).toMatchObject({ type: 'radioStudio', furniture: studio.furniture });
    });
  });

  describe('a course for someone (R49)', () => {
    /** The sensible bot's company with a head of Production at a desk. */
    function withHead(): GameState {
      let s: GameState = { ...unlockAll(company(40)), money: 500_000 };
      const head = { ...s.candidates.find((c) => c.role === 'manager')!, department: 'production' as const };
      s = ok(hire({ ...s, candidates: s.candidates.map((c) => (c.id === head.id ? head : c)) }, head.id));
      return ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
    }
    const error = (result: ActionResult) => (result.ok ? '' : result.error);

    it('needs the head of the department, costs two months of salary and takes one at a time', () => {
      const bare = { ...unlockAll(company(40)), money: 500_000 };
      const producer = bare.employees.find((e) => e.role === 'production')!;
      expect(error(sendOnTraining(bare, producer.id))).toMatch(/arranged by the head of Production/);
      expect(error(sendOnTraining(bare, bare.employees.find((e) => e.role === 'cleaner')!.id))).toMatch(/no courses for this job/);

      const s = withHead();
      const sent = ok(sendOnTraining(s, producer.id));
      expect(s.money - sent.money).toBe(trainingCost(s, producer));
      expect(trainingCost(s, producer)).toBe(Math.round((producer.salary * TRAINING.salaryMonths) / 100) * 100);
      expect(sent.ledger.training).toBe(trainingCost(s, producer));
      expect(sent.employees.find((e) => e.id === producer.id)!.trainingUntil).toBe(s.day + TRAINING.days);
      const other = s.employees.find((e) => e.role === 'production' && e.id !== producer.id)!;
      expect(error(sendOnTraining(sent, other.id))).toMatch(/one at a time/);
      // A host is sent by a channel manager, who is there from the first day.
      expect(trainingBlocker(s, s.employees.find((e) => e.role === 'host')!)).toBeNull();
    });

    it('a stand-in does the work less well, and they come back better and dearer', () => {
      const s = withHead();
      const host = s.employees.find((e) => e.role === 'host')!;
      let away = ok(sendOnTraining(s, host.id));
      const there = () => away.employees.find((e) => e.id === host.id)!;
      expect(skillAtWork(there())).toBeCloseTo(host.skill * TRAINING.standIn, 6);
      expect(hostSkill(there(), host.specialties[0]!)).toBeCloseTo(hostSkill(host, host.specialties[0]!) * TRAINING.standIn, 6);
      const xp = there().xp;
      for (let day = 0; day < TRAINING.days - 1; day++) away = tick(away);
      expect(there().trainingUntil).not.toBeNull();
      // Whoever is away earns no experience at work: the days are the stand-in's.
      expect(there().xp).toBe(xp);
      away = tick(away);
      expect(there().trainingUntil).toBeNull();
      const gained = there().skill - host.skill;
      expect(gained).toBeGreaterThanOrEqual(Math.min(TRAINING.skillGain.min, 100 - host.skill));
      expect(gained).toBeLessThanOrEqual(TRAINING.skillGain.max);
      expect(there().salary).toBeGreaterThanOrEqual(host.salary);
      expect(away.messages.some((m) => m.text.includes(`${host.name} is back from the course`))).toBe(true);
    });
  });

  describe('getting to know a sponsor (R58)', () => {
    it('a sponsor pays 20% over the ad rate at level 1 and 70% at the highest', () => {
      expect(sponsorRate(1)).toBe(1.2);
      expect(sponsorRate(RELATIONS.levels)).toBe(1.7);
      expect(sponsorRate(RELATIONS.levels + 3)).toBe(1.7);
      for (let level = 1; level < RELATIONS.levels; level++) expect(sponsorRate(level + 1)).toBeGreaterThan(sponsorRate(level));
    });

    it('the sales staff work on the sponsors under contract; a new level pays at once, and a penalty costs one', () => {
      const s = company(150, 1, growthBot);
      const [first, second] = s.shows;
      const offer = (id: string, sponsor: string): SponsorOffer => ({ id, sponsor, medium: 'radio', cpmMultiplier: sponsorRate(1), preferredAudience: null, minListeners: 1, weeks: 26, penalty: 100, expiresOn: s.day + 14 });
      let t: GameState = { ...s, contracts: [], relations: {}, offers: [offer('o1', 'Acme'), offer('o2', 'Bolt')] };
      t = ok(acceptOffer(ok(acceptOffer(t, 'o1', first!.id)), 'o2', second!.id));
      expect(t.relations).toEqual({ Acme: { level: 1, points: 0 }, Bolt: { level: 1, points: 0 } });

      const draft = structuredClone(t);
      const desked = employeesWithDesk(draft);
      let days = 0;
      while (relationOf(draft, 'Acme').level === 1 && days < 2_000) {
        workOnRelations(draft, desked);
        days++;
      }
      expect(relationOf(draft, 'Acme').level).toBe(2);
      expect(relationOf(draft, 'Bolt').level).toBe(2);
      expect(days).toBeGreaterThan(pointsForLevel(1) / 4);
      // The contracts that run pay the new rate, and the news is about Sales.
      for (const contract of draft.contracts) expect(contract.cpmMultiplier).toBe(sponsorRate(2));
      expect(draft.messages.filter((m) => /on better terms with (Acme|Bolt): level 2/.test(m.text) && m.about === 'sales')).toHaveLength(2);

      // Half the offers come from a sponsor the company knows, at the rate of its level.
      const offers = Array.from({ length: 30 }, (_, seed) => {
        const next: GameState = structuredClone({ ...draft, offers: [] as SponsorOffer[], contracts: draft.contracts.slice(0, 1) });
        refreshOffers(next, new Rng(seed + 1), employeesWithDesk(next));
        return next.offers;
      }).flat();
      expect(offers.some((o) => o.sponsor === 'Acme' || o.sponsor === 'Bolt')).toBe(true);
      for (const o of offers) expect(o.cpmMultiplier).toBe(sponsorRate(relationOf(draft, o.sponsor).level));

      // Breaking a contract costs the penalty, and a level with that sponsor.
      const broken = ok(cancelContract(draft, draft.contracts.find((c) => c.sponsor === 'Acme')!.id));
      expect(relationOf(broken, 'Acme')).toEqual({ level: 1, points: 0 });
      expect(relationOf(broken, 'Bolt').level).toBe(2);
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
      return { ...base, money: 600_000, negativeMonths: 0, guide: { stage: 'on', quiet: 0, seen } };
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
  describe('the voices', () => {
    it('every line has its recording, or is on the list of lines to record', () => {
      for (const line of LINES) {
        const recorded = existsSync(`${VOICE_FOLDER}/${voiceFile(line.id)}`);
        const waits = TO_RECORD[line.id];
        // A new line has no file; a changed one has the old file, which the game does not play.
        expect(recorded, `${line.id}: ${waits ?? 'recorded'}`).toBe(waits !== 'new');
      }
      for (const id of Object.keys(TO_RECORD)) expect(LINES.some((line) => line.id === id), id).toBe(true);
      // The three that were recorded for this version are in.
      for (const id of ['first-month', 'black', 'bailout']) expect(TO_RECORD[id]).toBeUndefined();
    });
  });
});
