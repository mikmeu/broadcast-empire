import { describe, expect, it } from 'vitest';
import { newGameStart, savesNote } from './newGameForm';

describe('the new-game form', () => {
  it('starts with empty names', () => {
    const start = newGameStart('a');
    expect(start.playerName).toBe('');
    expect(start.companyName).toBe('');
  });

  it('says nothing without a game', () => {
    expect(savesNote(null)).toBeNull();
  });

  it('warns about the game in play', () => {
    expect(savesNote({ bankrupt: false })).toContain('save it first');
  });

  it('only reassures after a bankruptcy', () => {
    expect(savesNote({ bankrupt: true })).toBe('Your saves stay as they are.');
  });
});
