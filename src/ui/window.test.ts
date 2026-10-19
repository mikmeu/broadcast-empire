import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fitSize, MIN_SIZE } from './Window';

describe('windows that can be resized (0.17.0, #62)', () => {
  const stage = { w: 1280, h: 720 };

  it('keeps a size the player drags to as it is, when it fits', () => {
    expect(fitSize({ w: 600, h: 400 }, { x: 104, y: 12 }, stage)).toEqual({ w: 600, h: 400 });
  });

  it('never makes a window smaller than its title bar and a few lines', () => {
    expect(fitSize({ w: 40, h: -100 }, { x: 104, y: 12 }, stage)).toEqual(MIN_SIZE);
  });

  it('stops 12px short of the right and bottom edges of the stage', () => {
    expect(fitSize({ w: 5000, h: 5000 }, { x: 104, y: 12 }, stage)).toEqual({ w: 1280 - 104 - 12, h: 720 - 12 - 12 });
  });

  it('lets a window near the right edge keep its smallest size, even past the edge', () => {
    // Moved until only its title bar shows: there is no room left, so the smallest size wins.
    expect(fitSize({ w: 900, h: 500 }, { x: 1180, y: 600 }, stage)).toEqual(MIN_SIZE);
    // Half in view: as wide as the room that is left.
    expect(fitSize({ w: 900, h: 300 }, { x: 800, y: 12 }, stage)).toEqual({ w: 1280 - 800 - 12, h: 300 });
  });

  it('rounds to whole pixels', () => {
    expect(fitSize({ w: 500.6, h: 300.2 }, { x: 0, y: 0 }, stage)).toEqual({ w: 501, h: 300 });
  });

  it('lays out the screens inside a window by its width, not the screen’s', () => {
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    for (const layout of ['.two-col', '.wiki', '.catalog-layout', '.map-layout']) {
      expect(css, layout).toMatch(new RegExp(`@container window \\(max-width: \\d+px\\) \\{\\s*\\${layout} \\{`));
    }
  });
});
