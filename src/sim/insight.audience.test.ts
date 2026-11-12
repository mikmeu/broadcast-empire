import { describe, expect, it } from 'vitest';
import { getGenre } from '../config/genres';
import { simulateDay } from './broadcast';
import { sensibleBot } from './bots';
import { audienceMatch, channelAudience, drawnAudience } from './insight';
import { createInitialState } from './newGame';
import type { GameState } from './state';
import { advance } from './tick';

const station = (): GameState => structuredClone(sensibleBot(createInitialState(1)));

describe('who a show drew (0.21.0, #262)', () => {
  it('each slot’s audiences add up to its listeners, and the slots to the channel’s', () => {
    for (const channel of simulateDay(station()).channels) {
      for (const slot of channel.slots) {
        if (slot.listeners === 0) continue;
        expect(Object.values(slot.audiences!).reduce((sum, n) => sum + n, 0)).toBeCloseTo(slot.listeners, 4);
      }
      for (const [id, total] of Object.entries(channel.audienceListeners)) {
        expect(channel.slots.reduce((sum, s) => sum + (s.audiences?.[id as 'teens'] ?? 0), 0)).toBeCloseTo(total!, 4);
      }
    }
  });

  it('shows the player’s shows and channel after a day, and nothing for an older result', () => {
    const s = advance(station(), 3);
    const channel = s.channels[0]!;
    const slot = channel.schedule.findIndex((id) => id !== null);
    const show = s.shows.find((x) => x.id === channel.schedule[slot])!;
    const rows = drawnAudience(s, channel.id, slot, show.id, show.genre);
    expect(rows).toHaveLength(6);
    expect(rows.reduce((sum, r) => sum + r.drawn, 0)).toBeCloseTo(1);
    expect(rows.reduce((sum, r) => sum + r.tunedIn, 0)).toBeCloseTo(1);
    expect(channelAudience(s, channel.id).reduce((sum, a) => sum + a.share, 0)).toBeCloseTo(1);

    // A result saved before 0.21.0 has no `audiences`.
    const old = structuredClone(s);
    for (const c of old.lastDay!.channels) for (const sl of c.slots) delete sl.audiences;
    expect(drawnAudience(old, channel.id, slot, show.id, show.genre)).toEqual([]);
    expect(channelAudience(old, channel.id).length).toBe(6);
  });

  it('gives no verdict when the genre suits all or none of the audiences', () => {
    const row = (own: boolean) => ({ audience: 'teens' as const, drawn: 0.5, tunedIn: 0.5, own });
    expect(audienceMatch([row(true), row(true)])).toBeNull();
    expect(audienceMatch([row(false), row(false)])).toBeNull();
  });

  it('a teen genre draws its audience where teens are tuned in more than in the rest of the day', () => {
    const fit = getGenre('rock').fit;
    expect(fit.teens).toBe(1);
    const rows = (['teens', 'students', 'families', 'workers', 'professionals', 'seniors'] as const).map((audience) => ({
      audience,
      own: fit[audience] >= 1,
      drawn: fit[audience] >= 1 ? 0.5 : 0.125,
      tunedIn: 1 / 6,
    }));
    expect(audienceMatch(rows)).toBe('own');
    expect(audienceMatch(rows.map((r) => ({ ...r, drawn: 1 / 6 })))).toBe('mix');
    expect(audienceMatch(rows.map((r) => ({ ...r, drawn: r.own ? 0.05 : 0.2 })))).toBe('others');
  });
});
