import { defaultLook, type Look } from '../config/looks';

/** What the new-game form starts with: nothing from the game in play, so it is clear a new game is a new game. */
export function newGameStart(seed: string): { playerName: string; companyName: string; look: Look } {
  return { playerName: '', companyName: '', look: defaultLook(seed) };
}

/** The line about the player's saves, shown on both steps whenever a game is loaded. */
export function savesNote(game: { bankrupt: boolean } | null | undefined): string | null {
  if (!game) return null;
  if (game.bankrupt) return 'Your saves stay as they are.';
  return 'Your saves stay as they are. The game you are playing is kept as far as you last saved it, so save it first to keep it all. From 1 February the autosave holds the new game.';
}
