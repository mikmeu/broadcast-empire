import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveTheme } from './theme';

describe('color scheme (Phase 7)', () => {
  it('follows the system unless the player chose a scheme', () => {
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
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
