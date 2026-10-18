import { describe, expect, it } from 'vitest';
import { CONTENT, MARKETING, SALES, STUDIO_AUDIENCE } from '../config/balance';
import { LINES } from '../config/guide';
import { TO_RECORD } from '../config/voiceOver';
import { SLOTS } from '../config/world';
import { DAY_BEATS, peopleAt, slotAt } from '../office/layout';
import { buildRoom, buyLicense, buyTitle, createChannel, createShow, extendCampaign, hire, scheduleShow, setCampaignRepeat, setChannelManager, setRoomType, startCampaign, type ActionResult } from './actions';
import { growthBot, networkBot, sensibleBot } from './bots';
import { appeal, showQuality, simulateDay, slotFactors } from './broadcast';
import { outlook } from './economy';
import { addMissingEquipment, autoPlaceFurniture, rentRoom, setUpMasterControl } from './fixtures';
import { guideView } from './guide';
import {
  changesSince,
  channelGroups,
  reportLosses,
  settledFreshness,
  slotAudience,
  snapshotSlots,
  suitability,
  titleSupply,
  TITLES_FOR_FULL_FRESHNESS,
  warnAboutTitles,
} from './insight';
import { createInitialState } from './newGame';
import { proposeRoom } from './rooms';
import { fromSaveFile, toSaveFile } from './save';
import { slow } from './slow';
import type { GameState, Person, SponsorContract } from './state';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';
import { ARTICLES } from '../wiki/articles';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open and money to spare. */
const station = (days = 30): GameState => {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), days)));
  s.money = 3_000_000;
  s.floorsUnlocked = 2;
  return s;
};

/** Hires a made-up person straight from the pool. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: 'Test Person', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** A TV channel in Coaxia with a manager, beside the radio station. */
function withTv(state: GameState): GameState & { tvId: string } {
  let s: GameState & { lastId?: string } = ok(createChannel(state, { name: 'Test TV', logo: { shape: 'square', color: '#000', initials: 'TV' }, medium: 'tv' }));
  const tvId = s.lastId!;
  s = ok(buyLicense(s, tvId, 'capital'));
  s = hirePerson(s, { role: 'channelManager' });
  const manager = s.lastId!;
  s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
  s = ok(setChannelManager(s, tvId, manager));
  return Object.assign(s, { tvId });
}

describe('version 0.13.0', () => {
  describe('what the company earns, apart (R99)', () => {
    it('a sponsor’s part of a show’s revenue is what its rate adds to the ads', () => {
      const s = station();
      const show = s.shows.find((x) => s.channels[0]!.schedule.includes(x.id))!;
      const plain = simulateDay(s).channels.find((c) => c.isPlayer)!.slots.find((x) => x.showId === show.id)!;
      expect(plain.sponsorRevenue).toBe(0);
      const contract: SponsorContract = { id: 'c', sponsor: 'Acme', medium: 'radio', cpmMultiplier: 1.5, preferredAudience: null, minListeners: 0, weeks: 4, penalty: 0, showId: show.id, startDay: s.day, endDay: s.day + 28, listenerSum: 0, daysRun: 0 } as unknown as SponsorContract;
      const sponsored = simulateDay({ ...s, contracts: [contract] }).channels.find((c) => c.isPlayer)!.slots.find((x) => x.showId === show.id)!;
      expect(sponsored.revenue).toBeCloseTo(plain.revenue * 1.5, 6);
      expect(sponsored.sponsorRevenue).toBeCloseTo(plain.revenue * 0.5, 6);
      expect(SALES.preferredAudienceBonus).toBeGreaterThan(1);
    });

    it('the books keep the sponsors’ part and teleshopping fees as part of the revenue', () => {
      // Mid-month, so that no report is filed in between.
      let s = station(10);
      const start = s.ledger.revenue;
      s = advance(s, 3);
      expect(s.ledger.revenue).toBeGreaterThan(start);
      expect(s.ledger.sponsorRevenue).toBeGreaterThanOrEqual(0);
      expect(s.ledger.sponsorRevenue + s.ledger.fees).toBeLessThanOrEqual(s.ledger.revenue);
      const ahead = outlook(s);
      expect(ahead.sponsors + ahead.fees).toBeLessThanOrEqual(ahead.income);
    });
  });

  describe('why a slot draws what it draws (R100)', () => {
    it('the parts of a slot’s appeal multiply to its appeal; reruns have none', () => {
      const s = station();
      const factors = slotFactors(s, s.channels[0]!.id);
      expect(factors).toHaveLength(SLOTS.length);
      for (const f of factors) {
        expect(f).not.toBeNull();
        expect(f!.appeal).toBeCloseTo(appeal(f!.quality, f!.fit, f!.fame, f!.freshness, f!.reputation, f!.promotion, f!.bonus), 9);
        expect(f!.tunedIn).toBeGreaterThan(0);
      }
      const empty = structuredClone(s);
      empty.channels[0]!.schedule[0] = null;
      expect(slotFactors(empty, empty.channels[0]!.id)[0]).toBeNull();
    });

    it('a show that goes stale loses its audience, and the news says that freshness is why', () => {
      let s = station();
      s.weekAgo = snapshotSlots(s);
      const show = s.shows.find((x) => x.id === s.channels[0]!.schedule[0])!;
      s = structuredClone(s);
      s.shows.find((x) => x.id === show.id)!.freshness = 0.4;
      s.lastDay = simulateDay(s);
      const before = s.weekAgo[`${s.channels[0]!.id}:0`]!;
      const now = slotFactors(s, s.channels[0]!.id)[0]!;
      expect(changesSince(before, now)[0]).toMatchObject({ factor: 'freshness' });
      reportLosses(s);
      expect(s.messages.at(-1)!.text).toMatch(new RegExp(`“${show.name}”.*fewer listeners than a week ago: its freshness fell`));
      expect(s.messages.at(-1)!.about).toBe('broadcast:channels');
    });

    it('the week’s figures are taken every Monday', () => {
      const s = station(40);
      expect(Object.keys(s.weekAgo).length).toBe(SLOTS.length);
    });
  });

  describe('when to schedule what (R101)', () => {
    it('a slot names who is tuned in, and a genre suits it by the people there and what they are worth', () => {
      const s = station();
      const radio = s.channels[0]!;
      const morning = slotAudience(s, radio, 0);
      const late = slotAudience(s, radio, SLOTS.indexOf('lateNight'));
      expect(suitability(morning, 'morningShow').label).toBe('good');
      expect(suitability(late, 'rock').score).toBeGreaterThan(suitability(late, 'classical').score);
      expect(suitability(late, 'classical').label).toBe('poor');
    });

    it('a channel specializes with three slots of one kind, and the schedule says when one more would do it', () => {
      const s = station();
      const radio = s.channels[0]!;
      expect(channelGroups(s, radio).group).toBe('Music');
      // Penny's plan: a morning show, Top 40 twice, the news and rock. Without the rock there are two music slots.
      const two = structuredClone(s);
      const rock = two.channels[0]!.schedule.findIndex((id) => two.shows.find((x) => x.id === id)?.genre === 'rock');
      two.channels[0]!.schedule[rock] = null;
      expect(channelGroups(two, two.channels[0]!)).toMatchObject({ group: null, almost: 'Music' });
    });
  });

  describe('a test player that grows the way the wiki says (R102)', () => {
    it('your own channels share the audience: a second channel like the first takes from it', () => {
      const s = station();
      const alone = simulateDay(s).channels.find((c) => c.isPlayer)!;
      // Every channel after the first goes out through a master control room (0.16.0).
      const twin = structuredClone(ok(setUpMasterControl(s)));
      twin.channels.push({ ...structuredClone(s.channels[0]!), id: 'twin', name: 'Twin FM' });
      for (const license of s.licenses) twin.licenses.push({ ...license, id: `${license.id}-twin`, channelId: 'twin' });
      const both = simulateDay(twin).channels.filter((c) => c.isPlayer);
      const total = (c: { slots: { listeners: number }[] }) => c.slots.reduce((sum, x) => sum + x.listeners, 0);
      expect(total(both.find((c) => c.channelId === s.channels[0]!.id)!)).toBeLessThan(total(alone));
      expect(total(both[0]!) + total(both[1]!)).toBeLessThan(2 * total(alone));
    });

    // Over three games together (0.16.0): in one of them, seed 1, the station for the same audience draws a few per cent more.
    it('a second station for other audiences draws more than a second one for the same', () => {
      const play = (bot: typeof growthBot, seed: number) => {
        let s = createInitialState(seed);
        while (s.day < 4 * 365) s = tick(bot(s));
        return s;
      };
      const second = (s: GameState) => s.channels.find((c) => c.name === 'Bot Talk' || c.name === 'Bot Rock');
      const listeners = (s: GameState) => s.weeklyReports.slice(-8).reduce((sum, r) => sum + r.channels.filter((c) => c.isPlayer && c.medium === 'radio').reduce((x, c) => x + c.slots.reduce((y, slot) => y + slot.listeners, 0), 0), 0);
      let [growthTotal, networkTotal] = [0, 0];
      for (const seed of [1, 2, 3]) {
        const growth = play(growthBot, seed);
        const network = play(networkBot, seed);
        expect(second(growth)?.name).toBe('Bot Rock');
        expect(second(network)?.name).toBe('Bot Talk');
        growthTotal += listeners(growth);
        networkTotal += listeners(network);
      }
      expect(networkTotal).toBeGreaterThan(growthTotal);
    }, slow(300_000));

    it('the wiki has an article on growing, and Penny brings up audiences once the first weeks are over', () => {
      expect(ARTICLES.some((a) => a.id === 'market-leader')).toBe(true);
      const s = { ...station(130), guide: { stage: 'on' as const, quiet: 0, seen: [...LINES.map((l) => l.id).filter((id) => id !== 'audiences'), 'television-later'] } };
      expect(guideView(s)).toMatchObject({ kind: 'hint', line: { id: 'audiences' } });
      for (const id of ['audiences', 'titles-low', 'stale-titles']) expect(TO_RECORD[id]).toBe('new');
    });
  });

  describe('bought titles that run out or go stale (R88, R89)', () => {
    it('the news warns a week before the titles run out, and when they have', () => {
      let s: GameState & { lastId?: string; tvId?: string } = withTv(station());
      const tvId = s.tvId!;
      s = ok(addMissingEquipment(ok(setRoomType(ok(rentRoom(s, 'K')), 'K', 'library')), 'K'));
      s = ok(buyTitle(s, s.market.titles.find((t) => t.genre === 'series')!.id));
      s = ok(createShow(s, { name: 'Series Night', genre: 'series', hostId: null, staffIds: [], studioId: null }));
      s = ok(scheduleShow(s, tvId, 3, s.lastId!));
      s.library[0]!.airingsLeft = 9;
      const before = titleSupply(s);
      expect(before).toEqual([expect.objectContaining({ genre: 'series', left: 9, perDay: 1, days: 9 })]);
      let next = s;
      const warnings: string[] = [];
      for (let day = 0; day < 10; day++) {
        const was = titleSupply(next);
        next = structuredClone(next);
        next.library.forEach((t) => (t.airingsLeft -= 1));
        next.library = next.library.filter((t) => t.airingsLeft > 0);
        const count = next.messages.length;
        warnAboutTitles(next, was);
        warnings.push(...next.messages.slice(count).map((m) => m.text));
      }
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toMatch(/series in your library last 7 more days/);
      expect(warnings[1]).toMatch(/no series left/);
    });

    it('titles that take turns settle at a freshness that grows with how many there are', () => {
      expect(settledFreshness(1)).toBe(CONTENT.minFreshness);
      expect(settledFreshness(4)).toBeLessThan(settledFreshness(6));
      expect(settledFreshness(TITLES_FOR_FULL_FRESHNESS)).toBe(1);
      expect(settledFreshness(TITLES_FOR_FULL_FRESHNESS - 1)).toBeLessThan(1);
    });
  });

  describe('campaigns that go on (R90)', () => {
    it('a campaign can be made longer, and one that repeats starts again when it ends', () => {
      let s = station();
      s = hirePerson(s, { role: 'marketing' });
      s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'office')!.roomId, 'workstation'));
      s = ok(startCampaign(s, { targetId: s.channels[0]!.id, audience: 'all', weeklyBudget: MARKETING.budgets[0]!, weeks: 4 }));
      const id = s.campaigns[0]!.id;
      const end = s.campaigns[0]!.endDay;
      s = ok(extendCampaign(s, id, 4));
      expect(s.campaigns[0]!.endDay).toBe(end + 28);
      expect(extendCampaign(s, id, 3).ok).toBe(false);
      s = ok(setCampaignRepeat(s, id, true));
      s = advance(s, 8 * 7 + 1);
      expect(s.campaigns).toHaveLength(1);
      expect(s.campaigns[0]!.endDay).toBe(end + 28 + 28);
      s = ok(setCampaignRepeat(s, id, false));
      const notices = advance(s, 4 * 7 + 1).messages.map((m) => m.text);
      expect(notices.some((t) => /ends in a week/.test(t))).toBe(true);
      expect(notices.some((t) => /has ended/.test(t))).toBe(true);
    });
  });

  describe('a studio audience, and contestants (R91, R92)', () => {
    /** A game show with its host in a game show studio, on the TV channel's evening. */
    function gameShow(seats: number): GameState & { showId: string } {
      let s: GameState & { lastId?: string; tvId?: string } = withTv(station());
      s.techs.push('gameShowFormat');
      // A game show studio with room for an audience: bigger than usual.
      const place = proposeRoom(s, 2, 'tvGameStudio')!;
      s = ok(buildRoom(s, { ...place, w: 9, h: 7, door: { x: place.door.x, z: place.y + 7 }, type: 'tvGameStudio' }));
      const studio = s.lastId!;
      s = ok(addMissingEquipment(s, studio));
      for (let i = 0; i < seats; i++) s = ok(autoPlaceFurniture(s, studio, 'audienceSeating'));
      s = hirePerson(s, { role: 'host', specialties: ['gameShow'] });
      const host = s.lastId!;
      s = ok(createShow(s, { name: 'Quiz Night', genre: 'gameShow', hostId: host, staffIds: [], studioId: studio }));
      const showId = s.lastId!;
      s = ok(scheduleShow(s, s.tvId!, SLOTS.indexOf('evening'), showId));
      return Object.assign(s, { showId });
    }

    it('audience seating lifts a game show by a step per block, up to its most, and does nothing for the news', () => {
      const quality = (seats: number) => {
        const s = gameShow(seats);
        return showQuality(s, s.shows.find((x) => x.id === s.showId)!).audience;
      };
      expect(quality(0)).toBe(1);
      expect(quality(1)).toBeCloseTo(1 + STUDIO_AUDIENCE.perBlock, 9);
      expect(quality(STUDIO_AUDIENCE.maxBlocks + 1)).toBeCloseTo(1 + STUDIO_AUDIENCE.perBlock * STUDIO_AUDIENCE.maxBlocks, 9);
      const s = station();
      const news = s.shows.find((x) => x.genre !== 'gameShow')!;
      expect(showQuality(s, news).audience).toBe(1);
    });

    it('two contestants stand at the set while the game show is on, and none when it is not', () => {
      const s = gameShow(0);
      let seenLive = false;
      for (let beat = 0; beat < DAY_BEATS; beat++) {
        const contestants = [...peopleAt(s, beat).values()].filter((p) => p.id.startsWith('visitor-contestant'));
        const live = slotAt(beat) === SLOTS.indexOf('evening');
        expect(contestants.length, `beat ${beat}`).toBe(live ? 2 : 0);
        if (live) seenLive = true;
      }
      expect(seenLive).toBe(true);
    });
  });

  it('a save from 0.12 keeps loading, with the new books and the week’s figures to come', () => {
    const s = station();
    const old = structuredClone(toSaveFile(s, 0)) as unknown as { version: number; state: Record<string, any> };
    old.version = 28;
    delete old.state.weekAgo;
    delete old.state.ledger.sponsorRevenue;
    delete old.state.ledger.fees;
    old.state.campaigns = [{ id: 'm1', targetId: s.channels[0]!.id, audience: 'all', weeklyBudget: 1_000, marketerId: 'x', endDay: s.day + 10 }];
    const { state } = fromSaveFile(old);
    expect(state.weekAgo).toEqual({});
    expect(state.ledger).toMatchObject({ sponsorRevenue: 0, fees: 0 });
    expect(state.campaigns[0]).toMatchObject({ weeks: 2, repeat: false });
  });
});
