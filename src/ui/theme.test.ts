import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveTheme } from './theme';
import { DEFAULT_SETTINGS, parseSettings } from '../persistence/settings';

describe('color scheme (Phase 7, 0.15.0)', () => {
  it('follows the office clock unless the player chose a scheme', () => {
    // 1 December 1970 is eight in the morning, before the sun is up; 15 December is three in the afternoon; 31 December, evening.
    const december = (dayOfMonth: number) => 334 + dayOfMonth - 1;
    expect(resolveTheme('clock', december(1))).toBe('dark');
    expect(resolveTheme('clock', december(15))).toBe('light');
    expect(resolveTheme('clock', december(31))).toBe('dark');
    // In June it never gets dark in the office's day.
    expect(Array.from({ length: 30 }, (_, i) => resolveTheme('clock', 151 + i))).not.toContain('dark');
    // Without a game it is light, and a scheme the player chose holds day and night.
    expect(resolveTheme('clock', null)).toBe('light');
    expect(resolveTheme('light', december(31))).toBe('light');
    expect(resolveTheme('dark', december(15))).toBe('dark');
  });

  it('turns “Same as the system” of an older version into the time of day', () => {
    expect(parseSettings({ theme: 'system' }).theme).toBe('clock');
    expect(DEFAULT_SETTINGS.theme).toBe('clock');
  });

  it('is decided by data-theme alone in the stylesheet', () => {
    const css = readFileSync('src/ui/styles.css', 'utf8');
    // A media query here would bring the system's scheme back in behind the player's choice.
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).toMatch(/:root\[data-theme='dark'\] \{/);
  });

  it('is set before the first paint from the same setting', () => {
    const page = readFileSync('index.html', 'utf8');
    expect(page).toContain("localStorage.getItem('broadcast-empire:settings')");
    expect(readFileSync('src/persistence/settings.ts', 'utf8')).toContain("const KEY = 'broadcast-empire:settings';");
    // Nothing is fetched from another site: the fonts ship with the game.
    expect(page).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });
});
