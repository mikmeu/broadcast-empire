import { describe, expect, it } from 'vitest';
import { HOME_REGION } from '../config/balance';
import { REGIONS } from '../config/world';
import { buyLicense, createChannel, renameCompany, type ActionResult } from './actions';
import { NAME_LENGTH, cleanName, createInitialState, setupError } from './newGame';
import { unlockAll } from './unlocks';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const rich = (s: GameState): GameState => unlockAll({ ...s, money: 1_000_000 });

describe('a new game (Phase 8b)', () => {
  const setup = { playerName: '  Mike  ', companyName: 'Meu   Media', headquarters: 'coast' as const };

  it('starts with the player’s name, the company’s name and the headquarters', () => {
    const s = createInitialState(1, 'normal', setup);
    expect(s.playerName).toBe('Mike');
    expect(s.companyName).toBe('Meu Media');
    expect(s.headquarters).toBe('coast');
  });

  it('tidies names and keeps them short', () => {
    expect(cleanName('  a \n b  ')).toBe('a b');
    expect(cleanName('x'.repeat(100))).toHaveLength(NAME_LENGTH);
  });

  it('needs both names', () => {
    expect(setupError(setup)).toBeNull();
    expect(setupError({ ...setup, playerName: '   ' })).toMatch(/your name/);
    expect(setupError({ ...setup, companyName: '' })).toMatch(/company/);
    expect(() => createInitialState(1, 'normal', { ...setup, companyName: ' ' })).toThrow();
  });

  it('makes the same game from the same seed, whatever the names', () => {
    // The character a player gets without choosing one goes by their name, so it is left out as well.
    const { playerName: _a, companyName: _b, look: _e, ...one } = createInitialState(7, 'normal', setup);
    const { playerName: _c, companyName: _d, look: _f, ...other } = createInitialState(7, 'normal', { ...setup, playerName: 'Someone else', companyName: 'Other' });
    expect(one).toEqual(other);
  });

  it('lets the names be changed later, but not emptied', () => {
    const s = ok(renameCompany(createInitialState(1, 'normal', setup), 'Mik', ' Empire FM '));
    expect([s.playerName, s.companyName, s.headquarters]).toEqual(['Mik', 'Empire FM', 'coast']);
    expect(renameCompany(s, '', 'Empire FM').ok).toBe(false);
    expect(renameCompany(s, 'Mik', '  ').ok).toBe(false);
  });

  it('gives a channel a head start at home and none elsewhere', () => {
    for (const region of REGIONS) {
      let s = rich(createInitialState(1, 'normal', { ...setup, headquarters: region.id }));
      s = ok(createChannel(s, { name: 'One', logo: { shape: 'circle', color: '#000000', initials: 'ON' } }));
      const channel = s.channels[0]!.id;
      const away = REGIONS.find((r) => r.id !== region.id)!.id;
      s = ok(buyLicense(ok(buyLicense(s, channel, region.id)), channel, away));
      expect(s.channels[0]!.reputation[region.id]).toBe(HOME_REGION.startReputation);
      expect(s.channels[0]!.reputation[away]).toBe(0);
    }
  });

  it('gives saves from before the form stand-in names and Coaxia as headquarters', () => {
    const { playerName: _a, companyName: _b, headquarters: _c, ...old } = createInitialState(3);
    const { state } = fromSaveFile({ version: 13, savedAt: 0, state: old });
    expect(state.playerName).not.toBe('');
    expect(state.companyName).not.toBe('');
    expect(state.headquarters).toBe('capital');
    // And a save made now keeps what the player chose.
    const mine = createInitialState(3, 'normal', setup);
    expect(fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(mine, 0))))).toEqual({ version: SAVE_VERSION, savedAt: 0, state: mine });
  });
});
