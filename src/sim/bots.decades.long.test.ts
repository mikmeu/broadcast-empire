import { describe, expect, it } from 'vitest';
import { tvBot } from './bots';
import { toCalendarDate, toDay } from './calendar';
import { createInitialState } from './newGame';
import { slow } from './slow';
import { unlockAll } from './unlocks';
import { tick } from './tick';

// --- Phase 4c acceptance (prompt.md section 14) ---
// A long test: it runs in its own job, when a change touches game logic (see PIPELINE.md, "Testing: what runs where").

describe('Phase 4c acceptance', () => {
  it('a full 1970–2030 game is playable, and every decade has its own events', () => {
    let s = unlockAll(createInitialState(1));
    const end = toDay(2030, 1, 1);
    const news = new Map<number, string[]>();
    let seen = 0;
    let offers = 0;
    let lastOffer = '';
    while (s.day < end && !s.bankrupt) {
      s = tick(tvBot(s));
      for (const h of s.headlines.filter((x) => x.day === s.day)) {
        const decade = Math.floor(toCalendarDate(h.day).year / 10) * 10;
        news.set(decade, [...(news.get(decade) ?? []), h.text]);
        seen += 1;
      }
      const offer = s.poachOffers[0]?.id ?? '';
      if (offer && offer !== lastOffer) offers += 1;
      lastOffer = offer || lastOffer;
    }
    expect(s.bankrupt).toBe(false);
    expect(s.day).toBe(end);
    expect(Number.isFinite(s.money)).toBe(true);
    expect(seen).toBeGreaterThan(150);
    expect(offers).toBeGreaterThan(3);
    for (let decade = 1970; decade <= 2020; decade += 10) {
      const texts = news.get(decade)!.join('\n');
      expect(texts).toMatch(/World Cup \d{4} begins/);
      expect(texts).toMatch(/Olympics \d{4} begins/);
      expect(texts).toMatch(/TV rights to the/);
      expect(texts).toMatch(/election campaign/);
      expect(texts).toMatch(/hits the economy/);
      expect(texts).toMatch(new RegExp(`New in ${String(decade).slice(0, 3)}\\d:`));
    }
  }, slow(300_000));
});
