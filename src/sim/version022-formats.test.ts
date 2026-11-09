import { describe, expect, it } from 'vitest';
import { FORMAT } from '../config/balance';
import { ACTS, FORMATS, GENRES, defaultFormat, hasFormat, hasSignature, type Format } from '../config/genres';
import { HINTS } from '../config/guide';
import { createShow, revampShow, rewriteGain, rewriteShow, updateShow, type ActionResult } from './actions';
import { formatAppeal } from './broadcast';
import { DUE } from './guide';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState, Show } from './state';
import { advance } from './tick';
import { unlockAll } from './unlocks';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A month in, with a show of a genre pushed on directly: no people, so no writing, which is the half of a rewrite that is always there. */
function stationWith(genre: Show['genre'], freshness = 0.5, formatChangedOn: number | null = null): GameState {
  const s = structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));
  s.shows = s.shows.filter(() => false);
  const format = defaultFormat(genre);
  s.shows.push({ id: 'sx', name: 'Test show', genre, hostId: null, staffIds: [], writerIds: [], editorIds: [], studioId: null, freshness, tone: 'normal', ...(format ? { format, formatChangedOn } : {}) });
  return s;
}

const change = (_s: GameState, acts: number, genre: Show['genre'] = 'soap'): Format => {
  const format = { ...defaultFormat(genre)! };
  ACTS.slice(0, acts).forEach((a) => (format[a.id] = FORMATS[genre]![a.id].options[1]!.id));
  return format;
};

describe('Formats (0.22.0, #260)', () => {
  it('only the shows their writers lead have a format, four options to an act, and one signature each', () => {
    expect(GENRES.filter((g) => hasFormat(g.id)).map((g) => g.id).sort()).toEqual(['reality', 'sitcom', 'soap']);
    expect(GENRES.filter((g) => g.writers?.lead).map((g) => g.id).sort()).toEqual(['reality', 'sitcom', 'soap']);
    for (const acts of Object.values(FORMATS)) {
      for (const act of ACTS) expect(acts![act.id].options).toHaveLength(4);
      expect(ACTS.filter((a) => acts![a.id].signature).length).toBe(1);
    }
    // The soap's cliffhanger is the default, so a new soap has it.
    expect(hasSignature('soap', defaultFormat('soap'))).toBe(true);
    expect(hasSignature('sitcom', defaultFormat('sitcom'))).toBe(false);
  });

  it('a new show has its first options and waits for its first rewrite', () => {
    const s = ok(createShow(stationWith('soap'), { name: 'New', genre: 'soap', hostId: null, staffIds: [], studioId: null }));
    const show = s.shows.find((x) => x.id === s.lastId)!;
    expect(show.format).toEqual(defaultFormat('soap'));
    expect(show.formatChangedOn).toBe(s.day);
    show.freshness = 0.5;
    const again = rewriteShow(s, show.id, change(s, 1));
    expect(again.ok).toBe(false);
  });

  it('a show of another genre has no format, and one made of another genre’s options is refused', () => {
    const s = ok(createShow(stationWith('soap'), { name: 'Talk', genre: 'top40', hostId: null, staffIds: [], studioId: null }));
    expect(s.shows.find((x) => x.id === s.lastId)!.format).toBeUndefined();
    expect(rewriteShow(s, s.lastId!, defaultFormat('soap')!).ok).toBe(false);
    const soap = stationWith('soap');
    expect(rewriteShow(soap, 'sx', defaultFormat('sitcom')!).ok).toBe(false);
    const bad = createShow(soap, { name: 'Bad', genre: 'soap', hostId: null, staffIds: [], studioId: null, format: defaultFormat('sitcom')! });
    expect(bad.ok).toBe(false);
  });

  it('a rewrite brings back freshness for each act changed, at least half of it with no writing, and costs nothing', () => {
    const s = stationWith('soap');
    const gain = rewriteGain(s, s.shows[0]!, change(s, 2));
    expect(gain.changed).toBe(2);
    expect(gain.gain).toBeCloseTo(2 * FORMAT.perAct * 0.5, 5);
    const done = ok(rewriteShow(s, 'sx', change(s, 2)));
    expect(done.shows[0]!.freshness).toBeCloseTo(0.5 + gain.gain, 5);
    expect(done.shows[0]!.format).toEqual(change(s, 2));
    expect(done.shows[0]!.formatChangedOn).toBe(s.day);
    expect(done.money).toBe(s.money);
  });

  it('never goes above 100%, and refuses when nothing changed', () => {
    const s = stationWith('sitcom', 0.99);
    expect(ok(rewriteShow(s, 'sx', change(s, 5, 'sitcom'))).shows[0]!.freshness).toBe(1);
    expect(rewriteShow(s, 'sx', defaultFormat('sitcom')!).ok).toBe(false);
  });

  it('can be rewritten once in four weeks', () => {
    const s = stationWith('reality');
    const first = ok(rewriteShow(s, 'sx', change(s, 1, 'reality')));
    const second = rewriteShow(first, 'sx', change(s, 2, 'reality'));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/You can rewrite it again on/);
    first.day += FORMAT.cooldownDays - 1;
    expect(rewriteShow(first, 'sx', change(s, 2, 'reality')).ok).toBe(false);
    first.day += 1;
    expect(rewriteShow(first, 'sx', change(s, 2, 'reality')).ok).toBe(true);
  });

  it('a revamp is refused for a show its writers lead, but not for a kids’ show', () => {
    expect(revampShow(stationWith('soap'), 'sx').ok).toBe(false);
    const kids = stationWith('kids');
    expect(rewriteShow(kids, 'sx', defaultFormat('soap')!).ok).toBe(false);
    expect(revampShow(kids, 'sx').ok).toBe(true);
  });

  it('changing a show to another genre gives it that genre’s format, or none', () => {
    const s = stationWith('top40');
    const sitcom = ok(updateShow(s, 'sx', { name: 'Test show', genre: 'sitcom', hostId: null, staffIds: [], studioId: null }));
    expect(sitcom.shows[0]!.format).toEqual(defaultFormat('sitcom'));
    const back = ok(updateShow(sitcom, 'sx', { name: 'Test show', genre: 'top40', hostId: null, staffIds: [], studioId: null }));
    expect(back.shows[0]!.format).toBeUndefined();
  });

  it('the signature option draws a little more, and only while it is there', () => {
    const s = stationWith('sitcom');
    const show = s.shows[0]!;
    expect(formatAppeal(show)).toBe(1);
    show.format = { ...show.format!, resolution: 'catchphrase' };
    expect(formatAppeal(show)).toBe(FORMAT.signature);
    show.format = { ...show.format, resolution: 'group-hug' };
    expect(formatAppeal(show)).toBe(1);
    // Another genre's option of the same name is not its signature.
    expect(formatAppeal({ ...show, genre: 'top40', format: undefined })).toBe(1);
  });

  it('loads from save version 80: every written show gets its first format and can rewrite at once', () => {
    const s = stationWith('top40');
    s.shows.push({ id: 'so', name: 'Soap', genre: 'soap', hostId: null, staffIds: [], writerIds: [], editorIds: [], studioId: null, freshness: 0.6, tone: 'normal' });
    const file = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
    const loaded = fromSaveFile({ ...file, version: 80 });
    expect(loaded.version).toBe(SAVE_VERSION);
    const soap = loaded.state.shows.find((x) => x.id === 'so')!;
    expect(soap.format).toEqual(defaultFormat('soap'));
    expect(soap.formatChangedOn).toBeNull();
    expect(loaded.state.shows.find((x) => x.id === 'sx')!.format).toBeUndefined();
    expect(ok(rewriteShow(loaded.state, 'so', change(loaded.state, 1))).shows.find((x) => x.id === 'so')!.freshness).toBeGreaterThan(0.6);
  });

  it('Penny says one of the two stale lines for a show, never both', () => {
    expect(HINTS.some((h) => h.id === 'stale-format')).toBe(true);
    const radio = stationWith('top40', 0.5);
    expect([DUE['stale']!(radio), DUE['stale-format']!(radio)]).toEqual([true, false]);
    const written = stationWith('soap', 0.5);
    expect([DUE['stale']!(written), DUE['stale-format']!(written)]).toEqual([false, true]);
  });
});
