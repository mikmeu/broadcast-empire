import { describe, expect, it } from 'vitest';
import { freshHeadlines, issueNumber } from './paper';

const h = (day: number, text: string) => ({ day, text });

describe('the newspaper', () => {
  it('finds the headlines after the list has been cut', () => {
    const after = { headlines: [h(8, 'old'), h(10, 'new')] };
    expect(freshHeadlines({ day: 9 }, after)).toEqual([h(10, 'new')]);
  });

  it('returns nothing on the same day', () => {
    expect(freshHeadlines({ day: 10 }, { headlines: [h(10, 'seen')] })).toEqual([]);
  });

  it('returns several headlines of one day, in order', () => {
    const after = { headlines: [h(5, 'a'), h(6, 'b'), h(6, 'c')] };
    expect(freshHeadlines({ day: 5 }, after).map((x) => x.text)).toEqual(['b', 'c']);
  });

  it('numbers the issues one a day', () => {
    expect(issueNumber(0)).toBe(18263);
    expect(issueNumber(31) - issueNumber(30)).toBe(1);
  });
});
