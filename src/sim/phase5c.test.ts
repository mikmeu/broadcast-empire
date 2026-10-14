import { describe, expect, it } from 'vitest';
import { REGIONAL_AUDIENCES } from '../config/balance';
import { getGenre, type GenreId } from '../config/genres';
import { BEYOND_PATH, MAP_SIZE, REGION_LABELS, REGION_PATHS } from '../config/map';
import { PERSONALITIES } from '../config/rivals';
import { AUDIENCES, REGIONS, SLOTS, TUNED_IN, type RegionId } from '../config/world';
import { simulateDay } from './broadcast';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { fromSaveFile, SAVE_VERSION } from './save';
import type { GameState } from './state';
import { advance, tick } from './tick';
import { audienceShare, population, regionShare } from './world';

const station = (): GameState => structuredClone(sensibleBot(createInitialState(1)));

describe('regional audiences', () => {
  it('every region has three main audiences and a mix that adds up to 100%', () => {
    for (const region of REGIONS) {
      expect(new Set(region.mainAudiences).size).toBe(3);
      expect(AUDIENCES.reduce((sum, a) => sum + regionShare(region.id, a.id, 0), 0)).toBeCloseTo(1);
    }
  });

  it('a main audience is twice as common as in a region where it isn’t one', () => {
    // Teens are a main audience in Coaxia and Aerial Fields, not in Amplify Hills.
    expect(regionShare('capital', 'teens', 0)).toBeGreaterThan(1.8 * regionShare('highlands', 'teens', 0));
    expect(regionShare('highlands', 'seniors', 0)).toBeGreaterThan(1.5 * regionShare('capital', 'seniors', 0));
    const raw = (main: boolean) => 0.12 * (main ? REGIONAL_AUDIENCES.main : REGIONAL_AUDIENCES.other);
    expect(raw(true) / raw(false)).toBe(2);
  });

  it('keeps the national totals within a few points of the brief', () => {
    const total = REGIONS.reduce((sum, r) => sum + population(r.id, 0), 0);
    for (const a of AUDIENCES) {
      const national = REGIONS.reduce((sum, r) => sum + regionShare(r.id, a.id, 0) * population(r.id, 0), 0) / total;
      expect(Math.abs(national - audienceShare(a.id, 0))).toBeLessThan(0.04);
    }
  });

  it('the same show draws a visibly different audience in different regions', () => {
    /** People per head a show of this genre can hope to reach over a day, weighted by how well it fits them. */
    const pull = (regionId: RegionId, genreId: GenreId) => {
      const genre = getGenre(genreId);
      return AUDIENCES.reduce((sum, a) => sum + regionShare(regionId, a.id, 0) * genre.fit[a.id] * SLOTS.reduce((t, _, slot) => t + TUNED_IN[genre.medium][a.id][slot]!, 0), 0);
    };
    // Rock belongs in young Coaxia, not on Skywave Beach; classical music and soaps are the other way round.
    expect(pull('capital', 'rock')).toBeGreaterThan(1.25 * pull('coast', 'rock'));
    expect(pull('coast', 'classical')).toBeGreaterThan(1.3 * pull('heartland', 'classical'));
    expect(pull('highlands', 'soap')).toBeGreaterThan(1.25 * pull('capital', 'soap'));

    // The same station, moved from Coaxia to Amplify Hills with no rivals on the air: far fewer of its listeners are teens.
    const teens = (regionId: RegionId) => {
      const s = station();
      s.rivals = [];
      s.licenses = s.licenses.map((l) => ({ ...l, regionId }));
      const day = simulateDay(s).channels[0]!;
      return day.audienceListeners.teens! / day.slots.reduce((sum, slot) => sum + slot.listeners, 0);
    };
    expect(teens('capital')).toBeGreaterThan(1.5 * teens('highlands'));
  });

  it('rivals start where their shows fit, leaving Coaxia to the public broadcaster', () => {
    expect(PERSONALITIES.youth.regions).toEqual(['heartland']);
    expect(PERSONALITIES.cheap.regions).toEqual(['north', 'highlands']);
    const inCoaxia = createInitialState(1).rivals.filter((r) => r.channels.some((c) => c.regionIds.includes('capital')));
    expect(inCoaxia.map((r) => r.personality)).toEqual(['highbrow']);
  });
});

describe('ratings by region and audience', () => {
  it('daily results split listeners by audience, and weekly reports by region and audience', () => {
    for (const channel of simulateDay(station()).channels) {
      const total = channel.slots.reduce((sum, slot) => sum + slot.listeners, 0);
      expect(Object.values(channel.audienceListeners).reduce((sum, n) => sum + n, 0)).toBeCloseTo(total);
    }
    const s = advance(station(), 15);
    const report = s.weeklyReports.at(-1)!;
    for (const channel of report.channels) {
      const perSlot = channel.slots.reduce((sum, slot) => sum + slot.listeners, 0) / channel.slots.length;
      expect(Object.values(channel.regionListeners).reduce((sum, n) => sum + n, 0)).toBeCloseTo(perSlot, 0);
      expect(Object.values(channel.audienceListeners).reduce((sum, n) => sum + n, 0)).toBeCloseTo(perSlot, 0);
    }
  });
});

describe('the map of Etheria', () => {
  it('has a closed outline and a label on the map for every region', () => {
    for (const region of REGIONS) {
      expect(REGION_PATHS[region.id]).toMatch(/^M[\d.]+[ ,][\d.]+.*Z$/);
      const { x, y } = REGION_LABELS[region.id];
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(MAP_SIZE.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(MAP_SIZE.height);
    }
    expect(BEYOND_PATH).toMatch(/^M.*Z$/);
  });
});

describe('saves from before Phase 5c', () => {
  it('upgrade with empty audience and region breakdowns', () => {
    const s = structuredClone(advance(station(), 10)) as unknown as Record<string, unknown> & GameState;
    for (const day of [s.lastDay!, ...s.week]) for (const c of day.channels) delete (c as unknown as Record<string, unknown>).audienceListeners;
    for (const r of s.weeklyReports) {
      for (const c of r.channels) {
        delete (c as unknown as Record<string, unknown>).audienceListeners;
        delete (c as unknown as Record<string, unknown>).regionListeners;
      }
    }
    const { state, version } = fromSaveFile({ version: 10, savedAt: 1, state: s });
    expect(version).toBe(SAVE_VERSION);
    expect(state.weeklyReports.every((r) => r.channels.every((c) => c.regionListeners && c.audienceListeners))).toBe(true);
    expect(tick(state).lastDay!.channels[0]!.audienceListeners.teens).toBeGreaterThan(0);
  });
});
