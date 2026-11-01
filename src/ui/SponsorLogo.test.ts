import { describe, expect, it } from 'vitest';
import { SPONSOR_NAMES } from '../config/names';
import { LOGOS } from './SponsorLogo';

describe('sponsor logos', () => {
  it('has a logo for every sponsor, and none for a name that is not one', () => {
    // SponsorLogo shows nothing for a missing logo, so a gap would go unnoticed on screen.
    expect(Object.keys(LOGOS).sort()).toEqual([...SPONSOR_NAMES].sort());
  });
});
