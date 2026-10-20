import { describe, expect, it } from 'vitest';
import * as lists from '../config/names';
import { PERSONALITIES } from '../config/rivals';
import { slug } from './inbox';
import { generateRivals, generateRivalShow, personName } from './generate';
import { channelInitials, channelNameFor, combine, combinations, drawCompanyName, drawShowName, suggestChannelName, suggestCompanyName } from './names';
import { createInitialState } from './newGame';
import { Rng } from './rng';

const NAME_LISTS = [
  'GIVEN_NAMES_FEMALE', 'GIVEN_NAMES_MALE', 'LAST_NAME_PREFIX', 'LAST_NAME_SUFFIX', 'SHOW_PREFIX', 'SHOW_SUFFIX',
  'CHANNEL_PREFIX', 'RADIO_CHANNEL_SUFFIX', 'TV_CHANNEL_SUFFIX', 'COMPANY_PREFIX', 'COMPANY_SUFFIX',
] as const;

/** How many numbers the generator has made: the state after n draws is told by running a copy. */
const steps = (seed: number, run: (rng: Rng) => unknown) => {
  const rng = new Rng(seed);
  run(rng);
  const probe = new Rng(seed);
  let n = 0;
  while (probe.state !== rng.state && n < 100) {
    probe.next();
    n++;
  }
  return n;
};

describe('the name lists', () => {
  it('are not empty and have no entry twice', () => {
    for (const key of NAME_LISTS) {
      const list = lists[key];
      expect(list.length, key).toBeGreaterThan(0);
      expect(new Set(list).size, key).toBe(list.length);
    }
  });

  it('write a pair together as written, with a capital to begin', () => {
    expect(combine(['Daily'], [' Show'], 0)).toBe('Daily Show');
    expect(combine(['fantasy'], [' FM'], 0)).toBe('Fantasy FM');
    expect(combine(['a', 'b'], ['x', 'y'], 3)).toBe('By');
    expect(combine(['a', 'b'], ['x', 'y'], 4)).toBe('Ax');
  });
});

describe('making names', () => {
  it('takes two draws for a person and one for a show, a company and a last name', () => {
    expect(steps(7, (r) => personName(r))).toBe(2);
    expect(steps(7, (r) => drawShowName(r, []))).toBe(1);
    expect(steps(7, (r) => drawShowName(r, ['Daily Show']))).toBe(1);
    expect(steps(7, (r) => drawCompanyName(r, new Set(['Picture Media'])))).toBe(1);
  });

  it('gives the same names for the same seed', () => {
    expect(personName(new Rng(5))).toBe(personName(new Rng(5)));
    expect(createInitialState(3).rivals.map((r) => r.name)).toEqual(createInitialState(3).rivals.map((r) => r.name));
  });

  it('makes a person of a given name and a last name', () => {
    for (let seed = 1; seed < 30; seed++) {
      const [given, last] = personName(new Rng(seed)).split(' ');
      expect([...lists.GIVEN_NAMES_FEMALE, ...lists.GIVEN_NAMES_MALE]).toContain(given);
      expect(last!.length).toBeGreaterThan(3);
    }
  });

  it('skips a show name that is taken, and adds II when all are', () => {
    const rng = new Rng(11);
    const first = drawShowName(new Rng(11), []);
    expect(drawShowName(rng, [first])).not.toBe(first);
    const all = Array.from({ length: combinations(lists.SHOW_PREFIX, lists.SHOW_SUFFIX) }, (_, i) => combine(lists.SHOW_PREFIX, lists.SHOW_SUFFIX, i));
    expect(drawShowName(new Rng(11), all)).toBe(`${first} II`);
    const show = generateRivalShow(new Rng(11), 'cheap', 'news', [], 1);
    expect(show.name.length).toBeGreaterThan(0);
  });

  it('gives rival companies that differ from each other', () => {
    for (const seed of [1, 2, 3, 4]) {
      const names = createInitialState(seed).rivals.map((r) => r.name);
      expect(new Set(names).size).toBe(names.length);
    }
    const state = createInitialState(1);
    state.rivals = [];
    expect(generateRivals(state, new Rng(1)).map((r) => r.name)).toContain('EPB');
  });

  it('names radio channels with a radio suffix and TV channels with a TV one', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const rival of createInitialState(seed).rivals) {
        for (const channel of rival.channels) {
          if (PERSONALITIES[rival.personality].channels.some((c) => c.name === channel.name) || channel.name === 'EPB-TV') continue;
          const suffixes = channel.medium === 'tv' ? lists.TV_CHANNEL_SUFFIX : lists.RADIO_CHANNEL_SUFFIX;
          expect(suffixes.some((s) => channel.name.toLowerCase().endsWith(s.toLowerCase())), channel.name).toBe(true);
        }
      }
    }
  });

  it('picks a channel name from its key alone', () => {
    expect(channelNameFor('X|radio|0', 'radio')).toBe(channelNameFor('X|radio|0', 'radio'));
    expect(channelInitials('Tiger FM')).toBe('TF');
    expect(channelInitials('Mountaintv')).toBe('MO');
  });

  it('suggests names for the player', () => {
    expect(suggestChannelName('tv').length).toBeGreaterThan(0);
    expect(suggestCompanyName().length).toBeGreaterThan(0);
  });

  it('makes names that become a clean address', () => {
    for (const prefix of lists.COMPANY_PREFIX) for (const suffix of lists.COMPANY_SUFFIX) expect(slug(combine([prefix], [suffix], 0))).toMatch(/^[a-z0-9-]+$/);
    for (const prefix of lists.CHANNEL_PREFIX) for (const suffix of lists.RADIO_CHANNEL_SUFFIX) expect(slug(combine([prefix], [suffix], 0))).toMatch(/^[a-z0-9-]+$/);
  });
});
