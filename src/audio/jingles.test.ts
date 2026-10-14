import { describe, expect, it } from 'vitest';
import { sensibleBot } from '../sim/bots';
import { createInitialState } from '../sim/newGame';
import { addMessage, topMessage, type GameState } from '../sim/state';
import { tick } from '../sim/tick';
import { JINGLE_RANK, jingleFor, type Jingle } from './jingles';
import { SOUNDS } from './sounds';

/** The same game with something added to it. */
function after(before: GameState, change: (draft: GameState) => void): GameState {
  const draft = structuredClone(before);
  change(draft);
  return draft;
}

describe('jingles (Phase 8c)', () => {
  const game = createInitialState(1);

  it('every jingle is one clip from the jingles pack, and has a rank', () => {
    for (const id of Object.keys(JINGLE_RANK) as Jingle[]) {
      expect(SOUNDS[id].files).toHaveLength(1);
      expect(SOUNDS[id].files[0]).toMatch(/^jingles\//);
    }
    expect(JINGLE_RANK.bankrupt).toBeGreaterThan(JINGLE_RANK.milestone);
    expect(JINGLE_RANK.milestone).toBeGreaterThan(JINGLE_RANK.trouble);
    expect(JINGLE_RANK.trouble).toBeGreaterThan(JINGLE_RANK.win);
    expect(JINGLE_RANK.win).toBeGreaterThan(JINGLE_RANK.event);
  });

  it('nothing new, nothing to play', () => {
    expect(jingleFor(game, game)).toBeNull();
    expect(jingleFor(game, after(game, (d) => addMessage(d, 'info', 'Weekly ratings are in.')))).toBeNull();
    expect(jingleFor(game, after(game, (d) => addMessage(d, 'warning', 'Room A is getting dirty.')))).toBeNull();
  });

  it('good news, bad news and news from the country each have their own', () => {
    expect(jingleFor(game, after(game, (d) => addMessage(d, 'good', 'Research complete.')))).toBe('win');
    expect(jingleFor(game, after(game, (d) => addMessage(d, 'danger', 'A host has left.')))).toBe('trouble');
    expect(jingleFor(game, after(game, (d) => addMessage(d, 'info', 'The games have begun.', 'event')))).toBe('event');
    expect(jingleFor(game, after(game, (d) => addMessage(d, 'warning', 'A recession has begun.', 'event')))).toBe('event');
    expect(jingleFor(game, after(game, (d) => addMessage(d, 'good', 'Milestone reached.', 'milestone')))).toBe('milestone');
  });

  it('the monthly report and other routine good news stay quiet', () => {
    expect(jingleFor(game, after(game, (d) => addMessage(d, 'good', 'March report: net +€5,000', 'routine')))).toBeNull();
  });

  it('on a day with several, the most important one plays', () => {
    const busy = (...add: ((d: GameState) => void)[]) => jingleFor(game, after(game, (d) => add.forEach((fn) => fn(d))));
    const good = (d: GameState) => addMessage(d, 'good', 'You won the license.');
    const bad = (d: GameState) => addMessage(d, 'danger', 'Equipment has broken down.');
    const news = (d: GameState) => addMessage(d, 'info', 'An election campaign has begun.', 'event');
    const milestone = (d: GameState) => addMessage(d, 'good', 'Milestone reached.', 'milestone');
    const warning = (d: GameState) => addMessage(d, 'warning', 'A rival starts broadcasting in Coaxia.');
    expect(busy(news, good)).toBe('win');
    expect(busy(good, bad)).toBe('trouble');
    // The tune fits the words on screen: a warning is shown before good news, and has no tune.
    expect(busy(good, warning)).toBeNull();
    expect(topMessage(game, after(game, (d) => (good(d), warning(d))))?.kind).toBe('warning');
    // A milestone is shown before a warning, and trouble before a milestone; the milestone is heard either way.
    expect(topMessage(game, after(game, (d) => (warning(d), milestone(d))))?.topic).toBe('milestone');
    expect(topMessage(game, after(game, (d) => (milestone(d), bad(d))))?.kind).toBe('danger');
    expect(busy(bad, milestone, good)).toBe('milestone');
    expect(busy(milestone, (d) => void (d.bankrupt = true))).toBe('bankrupt');
  });

  it('only looks at what is new', () => {
    const old = after(game, (d) => addMessage(d, 'danger', 'Something broke last week.'));
    expect(jingleFor(old, old)).toBeNull();
    expect(jingleFor(old, after(old, (d) => addMessage(d, 'info', 'Weekly ratings are in.')))).toBeNull();
  });

  it('in a real game, milestones and events are heard and the months are not one long tune', () => {
    let s = createInitialState(1);
    const heard: Jingle[] = [];
    const days = 3 * 365;
    for (let day = 0; day < days; day++) {
      const acted = sensibleBot(s);
      const next = tick(acted);
      // What the bot did counts as the player's own actions; the day that follows is the game's.
      for (const jingle of [jingleFor(s, acted), jingleFor(acted, next)]) if (jingle) heard.push(jingle);
      s = next;
    }
    expect(heard).toContain('milestone');
    // One tune for the milestones of a moment: a first month that also pays its own way is two milestones and one jingle.
    const tunes = heard.filter((j) => j === 'milestone').length;
    expect(tunes).toBeGreaterThanOrEqual(new Set(s.milestones.map((m) => m.day)).size);
    expect(tunes).toBeLessThanOrEqual(s.milestones.length);
    expect(heard).toContain('event');
    // Well under one a week.
    expect(heard.length).toBeLessThan(days / 7);
    expect(heard.length).toBeGreaterThan(5);
  });
});
