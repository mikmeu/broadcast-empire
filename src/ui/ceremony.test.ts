import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CEREMONY, getLine } from '../config/guide';
import { AWARD_CATEGORIES } from '../sim/awards';
import { toDay } from '../sim/calendar';
import { createInitialState } from '../sim/newGame';
import { PLAYER, type AwardCategory, type AwardNight, type GameState, type Nominee } from '../sim/state';
import { ceremonySteps, pauseAfter, PACE } from './ceremony';

const nominee = (category: AwardCategory, name: string, won: boolean, ownerId: string = 'rival'): Nominee => ({
  category,
  channelId: 'ch1',
  channelName: 'Radio One',
  ownerId,
  showName: name,
  showId: null,
  hostName: category.endsWith('Host') ? `Host of ${name}` : null,
  hostId: null,
  score: 1,
  ...(won && { won }),
});

/** Two nominees for each of the four awards, the first of each winning. */
const full = (): AwardNight => ({ year: 1975, nominees: AWARD_CATEGORIES.flatMap((c) => [nominee(c, `${c} A`, true), nominee(c, `${c} B`, false, 'rival')]) });

describe('the awards night as steps', () => {
  it('goes welcome, then each award in the order it is given out, then goodnight', () => {
    const steps = ceremonySteps(full());
    expect(steps.slice(0, 2).map((s) => s.lineId)).toEqual(['lotta-welcome', 'sonny-welcome']);
    expect(steps.slice(-2).map((s) => s.lineId)).toEqual(['lotta-goodnight', 'sonny-goodnight']);
    expect(steps.filter((s) => s.kind === 'intro').map((s) => s.category)).toEqual([...AWARD_CATEGORIES]);
    for (const category of AWARD_CATEGORIES) {
      const own = steps.filter((s) => s.category === category);
      expect(own.map((s) => s.kind), category).toEqual(['intro', 'nominees', 'envelope', 'winner']);
    }
  });

  it('leaves out an award with no nominees', () => {
    const night = full();
    night.nominees = night.nominees.filter((n) => n.category !== 'tvShow');
    const steps = ceremonySteps(night);
    expect(steps.some((s) => s.category === 'tvShow')).toBe(false);
    expect(steps.filter((s) => s.kind === 'winner')).toHaveLength(3);
  });

  it('has only the welcome and the goodnight for a night without winners', () => {
    expect(ceremonySteps({ year: 1975, nominees: [] }).map((s) => s.kind)).toEqual(['welcome', 'welcome', 'goodnight', 'goodnight']);
  });

  it('names the winner in the winner step, and lets the other presenter open the envelope', () => {
    const steps = ceremonySteps(full());
    for (const step of steps.filter((s) => s.kind === 'winner')) {
      expect(step.winner?.won).toBe(true);
      expect(step.winner?.category).toBe(step.category);
    }
    for (const category of AWARD_CATEGORIES) {
      const own = steps.filter((s) => s.category === category);
      expect(own[2]!.who).not.toBe(own[0]!.who);
      expect(own[3]!.who).toBe(own[2]!.who);
    }
  });

  it('only says lines that are in the script, by the presenter who is on stage', () => {
    for (const step of ceremonySteps(full())) {
      if (!step.lineId) continue;
      const line = getLine(step.lineId);
      expect(line, step.lineId).toBeDefined();
      expect(line?.speaker, step.lineId).toBe(step.who);
    }
    // And every line of the script is used by a full night.
    const used = new Set(ceremonySteps(full()).flatMap((s) => (s.lineId ? [s.lineId] : [])));
    for (const line of CEREMONY) expect(used.has(line.id), line.id).toBe(true);
  });

  it('waits a short while after a line that was heard, and the time to read one that was not', () => {
    expect(pauseAfter('lotta-welcome', true)).toBe(PACE.after);
    expect(pauseAfter('sonny-goodnight', false)).toBe(PACE.least);
    expect(pauseAfter('sonny-welcome', false)).toBeGreaterThan(PACE.least);
  });
});

describe('the store on the night', () => {
  type Store = typeof import('./store');
  let useGameStore: Store['useGameStore'];

  beforeAll(async () => {
    // The store sets the colour scheme on the page when it loads.
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    ({ useGameStore } = await import('./store'));
  });

  /** A game on the eve of the night with one nominee up, so that there is a night to hold. */
  const eve = (year: number, nominations: Nominee[] | null): GameState => {
    const s = createInitialState(3);
    s.day = toDay(year, 10, 31);
    s.awards.nominations = nominations;
    return s;
  };

  it('stops the game and starts the night when it is held, in an awards year', () => {
    useGameStore.setState({ game: eve(1975, [nominee('radioShow', 'Morning', false)]), speed: 1, ceremony: undefined, celebration: undefined });
    useGameStore.getState().advanceDays(1);
    const state = useGameStore.getState();
    expect(state.game!.awards.past).toHaveLength(1);
    expect(state.ceremony).toEqual({ year: 1975, resume: true });
    expect(state.speed).toBe(0);
  });

  it('carries the game on when the night is closed, if it was running', () => {
    useGameStore.setState({ game: eve(1975, [nominee('radioShow', 'Morning', false)]), speed: 2, resumeSpeed: 2, ceremony: undefined, celebration: undefined });
    useGameStore.getState().advanceDays(1);
    useGameStore.getState().closeCeremony();
    expect(useGameStore.getState().ceremony).toBeUndefined();
    expect(useGameStore.getState().speed).toBe(2);
  });

  it('stays paused when the night is closed, if the game was paused', () => {
    useGameStore.setState({ game: eve(1975, [nominee('radioShow', 'Morning', false)]), speed: 0, ceremony: undefined, celebration: undefined });
    useGameStore.getState().advanceDays(1);
    expect(useGameStore.getState().ceremony).toEqual({ year: 1975, resume: false });
    useGameStore.getState().closeCeremony();
    expect(useGameStore.getState().speed).toBe(0);
  });

  it('holds no night, and starts none, in a year without awards or with nobody nominated', () => {
    useGameStore.setState({ game: eve(1976, [nominee('radioShow', 'Morning', false)]), speed: 1, ceremony: undefined, celebration: undefined });
    useGameStore.getState().advanceDays(1);
    expect(useGameStore.getState().ceremony).toBeUndefined();
    useGameStore.setState({ game: eve(1975, null), speed: 1, ceremony: undefined, celebration: undefined });
    useGameStore.getState().advanceDays(1);
    expect(useGameStore.getState().ceremony).toBeUndefined();
  });

  it('leaves the game paused for a milestone that the night reached, until both have been closed', () => {
    // The player is the only one up, so they win, and “And the winner is…” is reached on the night.
    useGameStore.setState({ game: eve(1975, [nominee('radioShow', 'Morning', false, PLAYER)]), speed: 1, resumeSpeed: 1, ceremony: undefined, celebration: undefined });
    useGameStore.getState().advanceDays(1);
    // The milestone pop-up (App.tsx) hides while the night is on, and the game stays paused behind both.
    expect(useGameStore.getState().celebration?.milestones).toContain('awardWinner');
    expect(useGameStore.getState().speed).toBe(0);
    useGameStore.getState().closeCeremony();
    expect(useGameStore.getState().speed).toBe(0);
    useGameStore.getState().closeCelebration();
    expect(useGameStore.getState().speed).toBe(1);
  });
});
