// Player settings. They belong to the browser, not to a save: they apply to
// every game and survive starting a new one.

import { DIFFICULTIES, type Difficulty } from '../config/balance';

/** The color scheme: light by day and dark by night on the office clock (0.15.0), or always one of them. */
export const THEMES = ['clock', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export interface Settings {
  theme: Theme;
  /** Difficulty of the next new game; a running game keeps its own. */
  difficulty: Difficulty;
  /** Save automatically at the start of every month. */
  autosave: boolean;
  /** Stop moving decoration (the news ticker), on top of the system preference. */
  reduceMotion: boolean;
  /** 0–100; used once the game has sound. */
  soundVolume: number;
  musicVolume: number;
  /** 0–100: Uncle Tabby and Penny Cash in the tutorial. */
  voiceVolume: number;
  /** In the desktop app: ask at the start whether there is a newer version (0.13.0). */
  checkUpdates: boolean;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'clock', difficulty: 'normal', autosave: true, reduceMotion: false, soundVolume: 80, musicVolume: 60, voiceVolume: 100, checkUpdates: true };

/** Also read by the script in index.html that sets the color scheme before the first paint. */
const KEY = 'broadcast-empire:settings';

const volume = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;

/** Turns whatever was stored into valid settings; anything missing or invalid gets its default. */
export function parseSettings(data: unknown): Settings {
  const stored = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  return {
    // “Same as the system” is gone (0.15.0): whoever had it gets the time of day, the new default.
    theme: THEMES.includes(stored.theme as Theme) ? (stored.theme as Theme) : DEFAULT_SETTINGS.theme,
    difficulty: DIFFICULTIES.includes(stored.difficulty as Difficulty) ? (stored.difficulty as Difficulty) : DEFAULT_SETTINGS.difficulty,
    autosave: typeof stored.autosave === 'boolean' ? stored.autosave : DEFAULT_SETTINGS.autosave,
    reduceMotion: typeof stored.reduceMotion === 'boolean' ? stored.reduceMotion : DEFAULT_SETTINGS.reduceMotion,
    soundVolume: volume(stored.soundVolume, DEFAULT_SETTINGS.soundVolume),
    musicVolume: volume(stored.musicVolume, DEFAULT_SETTINGS.musicVolume),
    voiceVolume: volume(stored.voiceVolume, DEFAULT_SETTINGS.voiceVolume),
    checkUpdates: typeof stored.checkUpdates === 'boolean' ? stored.checkUpdates : DEFAULT_SETTINGS.checkUpdates,
  };
}

export function readSettings(): Settings {
  try {
    return parseSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    // Storage can be unavailable (private mode) or hold something unreadable.
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // The settings still apply until the page is closed.
  }
}
