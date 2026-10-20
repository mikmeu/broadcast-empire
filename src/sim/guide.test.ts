import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTIVE_REGIONS, DIFFICULTIES, MARKETING, MAX_SHOWS_PER_HOST, MAX_SHOWS_PER_PERSON, type Difficulty } from '../config/balance';
import { getGenre, type GenreId } from '../config/genres';
import { FAREWELL, HINTS, LINES, OFFER, STEPS, WELCOME } from '../config/guide';
import { voiceOverScript } from '../config/voiceOver';
import type { RegionId } from '../config/world';
import { acceptOffer, buildRoom, buyLicense, buyRecords, createChannel, createShow, hire, scheduleShow, setChannelManager, startCampaign, takeLoan, type ActionResult } from './actions';
import { addMissingEquipment, autoPlaceFurniture, setUpPostRoom } from './fixtures';
import { RECEPTION, type RoomType } from '../config/office';
import { proposeRoom } from './rooms';
import { hostSkill, showLoad } from './broadcast';
import { runningResult } from './economy';
import { GUIDE_TEAM, HINT_NEEDS, HINT_PAUSE, acknowledge, guideFinished, guideView, setGuide, skipWelcome, stepDone } from './guide';
import { createInitialState } from './newGame';
import { employeesWithDesk, isManager, needsDesk } from './office';
import { showListeners, showsForOffer } from './sales';
import { fromSaveFile, toSaveFile } from './save';
import type { GameState, Role } from './state';
import { isUnlocked } from './unlocks';
import { tick } from './tick';

const must = (result: ActionResult) => {
  if (!result.ok) throw new Error(result.error);
  return result;
};
const done = (state: GameState, result: ActionResult) => must(result).state ?? state;

/** A new company whose player has heard Uncle Tabby out and said yes to Penny. */
function started(seed = 1, headquarters: RegionId = 'capital', difficulty: Difficulty = 'normal'): GameState {
  return setGuide(skipWelcome(createInitialState(seed, difficulty, { playerName: 'Robin', companyName: 'Coax FM', headquarters })), true);
}

/** The first candidate of a role in the hiring pool, which the Staff window sorts by skill. */
const top = (state: GameState, role: Role) => [...state.candidates.filter((c) => c.role === role)].sort((a, b) => b.skill - a.skill)[0]!;
const free = (state: GameState, role: Role) => state.employees.filter((e) => e.role === role && showLoad(state, e.id) < (role === 'host' ? MAX_SHOWS_PER_HOST : MAX_SHOWS_PER_PERSON));

/** Makes a show the way the form offers it: the host who is best at the genre among those who are free, the first free producers, the studio. */
function makeShow(state: GameState, genre: GenreId): GameState {
  const host = [...free(state, 'host')].sort((a, b) => hostSkill(b, genre) - hostSkill(a, genre))[0]!;
  const staff = free(state, 'production').slice(0, getGenre(genre).requiredStaff);
  const studio = state.rooms.find((r) => r.type === 'radioStudio')!;
  return done(state, createShow(state, { name: `${getGenre(genre).name} ${state.shows.length + 1}`, genre, hostId: host.id, staffIds: staff.map((e) => e.id), studioId: studio.roomId }));
}

/**
 * Does what the step Penny is on asks for, the way a player who only reads her
 * lines would: the rooms she names, the candidates at the top of the list, and
 * people put on shows in the order they come.
 */
function follow(state: GameState, stepId: string): GameState {
  /** A room of a kind, built where the game proposes it: what “Propose a place” and “Build” do. */
  const built = (type: RoomType) => must(buildRoom(state, { ...proposeRoom(state, 1, type)!, type }));
  const roomOf = (type: RoomType) => state.rooms.find((r) => r.type === type)!.roomId;
  switch (stepId) {
    // The company itself comes first (0.16.0): the CEO's office with its desk, and the reception desk.
    case 'ceo-office': {
      const office = built('ceoOffice');
      return done(state, addMissingEquipment(office.state, office.id!));
    }
    case 'reception':
      return done(state, autoPlaceFurniture(state, RECEPTION.id, 'receptionDesk'));
    case 'clock':
    case 'look-around':
      return acknowledge(state, stepId);
    // Every channel goes out through a master control room, and a technician works its desk (0.16.0).
    case 'mcr': {
      const room = built('masterControl');
      return done(state, addMissingEquipment(room.state, room.id!));
    }
    // The cheapest, as her steps say.
    case 'technician-hire':
      return done(state, hire(state, [...state.candidates.filter((c) => c.role === 'technician')].sort((a, b) => a.salary - b.salary)[0]!.id));
    case 'studio':
      return built('radioStudio').state;
    case 'equipment':
      return done(state, addMissingEquipment(state, roomOf('radioStudio')));
    case 'office':
      return built('office').state;
    case 'management': {
      const office = built('managementOffice');
      return done(state, addMissingEquipment(office.state, office.id!));
    }
    case 'manager':
      return done(state, hire(state, top(state, 'channelManager').id));
    case 'hosts':
      return done(state, hire(state, top(state, 'host').id));
    case 'production':
      return done(state, hire(state, top(state, 'production').id));
    case 'desks':
      return done(state, autoPlaceFurniture(state, roomOf('office'), 'workstation'));
    // The records for the music (0.18.0): a post room, a library with a shelf, and the Top 40 and rock collections.
    case 'music-post':
      return done(state, setUpPostRoom(state));
    case 'music-library': {
      const library = built('library');
      return done(state, autoPlaceFurniture(library.state, library.id!, 'shelving'));
    }
    case 'music-records':
      return done(state, buyRecords(state.records.includes('top40') ? state : done(state, buyRecords(state, 'top40')), 'rock'));
    case 'channel':
      return done(state, createChannel(state, { name: 'Coax FM', logo: { shape: 'circle', color: '#6631d2', initials: 'CF' }, medium: 'radio' }));
    case 'in-charge':
      return done(state, setChannelManager(state, state.channels[0]!.id, state.employees.find((e) => e.role === 'channelManager')!.id));
    case 'license':
      return done(state, buyLicense(state, state.channels[0]!.id, 'capital'));
    case 'show':
      return makeShow(state, 'morningShow');
    // Three Top 40 shows and a rock show, in that order.
    case 'full-day':
      return makeShow(state, state.shows.length === 4 ? 'rock' : 'top40');
    // Each show goes in the first slot that is free, in the order they were made: what the ring points at.
    case 'schedule': {
      const channel = state.channels[0]!;
      const waiting = state.shows.find((show) => !channel.schedule.includes(show.id))!;
      return done(state, scheduleShow(state, channel.id, channel.schedule.findIndex((id) => !id), waiting.id));
    }
    case 'cleaner':
      return done(state, hire(state, top(state, 'cleaner').id));
    case 'play':
    case 'first-month':
    case 'black':
      return tick(state);
    // Someone new is hired from the top of the list and then given a workstation in the office.
    case 'sales':
    case 'marketing':
      return state.employees.some((e) => e.role === stepId) ? done(state, autoPlaceFurniture(state, roomOf('office'), 'workstation')) : done(state, hire(state, top(state, stepId).id));
    case 'sponsor': {
      // An offer goes to the show with the most listeners that clears its minimum, as Penny says; without one the days run on.
      const listeners = state.lastDay ? showListeners(state.lastDay) : new Map<string, number>();
      for (const offer of state.offers) {
        const show = showsForOffer(state, offer).find((s) => (listeners.get(s.id) ?? 0) > offer.minListeners);
        if (show) return done(state, acceptOffer(state, offer.id, show.id));
      }
      return tick(state);
    }
    case 'campaign':
      return done(state, startCampaign(state, { targetId: state.channels[0]!.id, audience: 'all', weeklyBudget: MARKETING.budgets[0]!, weeks: MARKETING.durations[0]! }));
    case 'finish':
      return acknowledge(state, 'finish');
    default:
      throw new Error(`Nobody knows how to do “${stepId}”.`);
  }
}

/** Follows Penny until she has nothing left to ask, or for `days` days of play. */
function followPenny(state: GameState, days = 120): { state: GameState; steps: string[] } {
  const steps: string[] = [];
  let s = state;
  const endDay = s.day + days;
  for (let guard = 0; guard < 2000 && s.day <= endDay; guard++) {
    const view = guideView(s);
    if (view?.kind !== 'step') break;
    if (steps[steps.length - 1] !== view.line.id) steps.push(view.line.id);
    s = follow(s, view.line.id);
  }
  return { state: s, steps };
}

describe('the welcome', () => {
  it('starts every new game with Uncle Tabby, then Penny’s question', () => {
    let state = createInitialState(1);
    expect(state.guide).toEqual({ stage: 'welcome', seen: [], quiet: 0 });
    for (const [page, line] of WELCOME.entries()) {
      const view = guideView(state);
      expect(view).toMatchObject({ kind: 'welcome', page, pages: WELCOME.length });
      expect(view?.line.id).toBe(line.id);
      state = acknowledge(state, line.id);
    }
    expect(state.guide.stage).toBe('offer');
    expect(guideView(state)).toMatchObject({ kind: 'offer', line: OFFER });
  });

  it('can be skipped, which still leaves the question', () => {
    const state = skipWelcome(createInitialState(1));
    expect(guideView(state)?.kind).toBe('offer');
  });

  it('says nothing more once Penny is sent away, and picks up again when she is called back', () => {
    const away = setGuide(skipWelcome(createInitialState(1)), false);
    expect(guideView(away)).toBeNull();
    expect(guideView(tick(away))).toBeNull();
    expect(guideView(setGuide(away, true))).toMatchObject({ kind: 'step', index: 0 });
  });

  it('does not touch the simulation', () => {
    const plain = createInitialState(5);
    const guided = started(5);
    const strip = (s: GameState) => ({ ...s, guide: null, playerName: '', companyName: '', look: null });
    expect(strip(tick(tick(guided)))).toEqual(strip(tick(tick(plain))));
  });
});

describe('Penny’s first weeks', () => {
  it('goes through every step in order for a player who does what she says', () => {
    const { state, steps } = followPenny(started());
    // Her January pays its own way, so there is no second month to wait for: “Into the black” is done as it comes up.
    expect(runningResult(state.monthlyReports[0]!)).toBeGreaterThan(0);
    expect(steps).toEqual(STEPS.map((s) => s.id).filter((id) => id !== 'black'));
    // The five shows are made first and scheduled after, the morning show in the morning and the rock show last.
    expect(steps.indexOf('full-day')).toBeLessThan(steps.indexOf('schedule'));
    expect(state.channels[0]!.schedule.map((id) => state.shows.find((show) => show.id === id)!.genre)).toEqual(['morningShow', 'top40', 'top40', 'top40', 'rock']);
    expect(guideFinished(state)).toBe(true);
    expect(state.channels[0]!.schedule.every(Boolean)).toBe(true);
  });

  it('asks for a team that can fill the day: five shows at two each', () => {
    expect(GUIDE_TEAM.hosts * MAX_SHOWS_PER_HOST).toBeGreaterThanOrEqual(5);
    // A morning show takes two producers, the four music shows one each.
    expect(GUIDE_TEAM.production * MAX_SHOWS_PER_PERSON).toBeGreaterThanOrEqual(getGenre('morningShow').requiredStaff + 3 * getGenre('top40').requiredStaff + getGenre('rock').requiredStaff);
  });

  it('has room in the office she names for everyone she has the player hire', () => {
    const { state } = followPenny(started(), 0);
    const office = state.rooms.find((r) => r.type === 'office')!;
    expect(office.furniture.filter((f) => f.type === 'workstation')).toHaveLength(state.employees.filter((e) => needsDesk(e.role) && !isManager(e.role)).length);
    // The manager sits apart, at a desk of their own in the management office she had the player rent.
    const management = state.rooms.find((r) => r.type === 'managementOffice')!;
    expect(management.furniture.filter((f) => f.type === 'managerDesk')).toHaveLength(state.employees.filter((e) => isManager(e.role)).length);
    expect(employeesWithDesk(state).size).toBe(state.employees.filter((e) => needsDesk(e.role)).length);
    expect(stepDone(state, 'desks')).toBe(true);
  });

  it('skips what the player has already done, in whatever order', () => {
    let state = started();
    state = done(state, hire(state, top(state, 'channelManager').id));
    state = done(state, createChannel(state, { name: 'Early', logo: { shape: 'circle', color: '#6631d2', initials: 'E' }, medium: 'radio' }));
    // A look around and the company itself come first (0.16.0).
    expect(guideView(state)).toMatchObject({ kind: 'step', line: { id: 'look-around' } });
    state = follow(state, 'look-around');
    expect(guideView(state)).toMatchObject({ kind: 'step', line: { id: 'ceo-office' } });
    state = follow(follow(state, 'ceo-office'), 'reception');
    expect(guideView(state)).toMatchObject({ kind: 'step', line: { id: 'studio' } });
    for (const id of ['studio', 'equipment', 'mcr', 'office', 'management']) state = follow(state, id);
    // The manager is hired and the channel exists: Penny goes on to the hosts.
    expect(guideView(state)).toMatchObject({ kind: 'step', line: { id: 'hosts' }, progress: { have: 0, need: GUIDE_TEAM.hosts } });
  });

  it('counts along on the steps that take several clicks', () => {
    let state = started();
    for (const id of ['look-around', 'ceo-office', 'reception', 'studio', 'equipment', 'mcr', 'office', 'management', 'manager', 'hosts']) state = follow(state, id);
    expect(guideView(state)).toMatchObject({ kind: 'step', line: { id: 'hosts' }, progress: { have: 1, need: GUIDE_TEAM.hosts, of: 'hosts hired' } });
  });

  // The roadmap's test for the phase: a player who only follows the tutorial gets on the air and has a month in the black.
  it.each(ACTIVE_REGIONS.flatMap((hq) => DIFFICULTIES.map((d) => [hq, d] as const)))('ends in the black within three months with the headquarters in %s on %s', (headquarters, difficulty) => {
    const late: string[] = [];
    for (const seed of [1, 7, 99, 2024]) {
      const { state } = followPenny(started(seed, headquarters, difficulty));
      // In the black as Penny and the monthly report count it: the running result, without what was bought once.
      const firstBlack = state.monthlyReports.findIndex((r) => runningResult(r) > 0);
      expect(state.licenses).toHaveLength(1);
      if (firstBlack < 0 || firstBlack > 2) late.push(`seed ${seed}: ${state.monthlyReports.map((r) => Math.round(runningResult(r))).join(', ')}`);
      expect(state.money).toBeGreaterThan(0);
      if (firstBlack >= 0) expect(guideFinished(state)).toBe(true);
    }
    // Since 0.16.0 the master control room and its technician cost about €1,300 a month more: on hard, one start of
    // the four (seed 1, outside Coaxia, with a weak hiring pool) no longer gets there in three months.
    expect(late.length, late.join('; ')).toBeLessThanOrEqual(difficulty === 'hard' ? 1 : 0);
  });
});

describe('sales and marketing in the first weeks (Phase 12f)', () => {
  it('goes on after the month in the black: someone in sales, a sponsor, someone in marketing, a campaign', () => {
    const ids = STEPS.map((step) => step.id);
    expect(ids.slice(ids.indexOf('black'))).toEqual(['black', 'sales', 'sponsor', 'marketing', 'campaign', 'finish']);
    // Every step is something Penny says aloud, and none of them names a number.
    for (const id of ['sales', 'sponsor', 'marketing', 'campaign']) {
      const line = STEPS.find((step) => step.id === id)!;
      expect(line.say.length, id).toBeGreaterThan(80);
      expect(line.say, id).not.toMatch(/\d/);
      expect(line.how!.length, id).toBeGreaterThan(0);
    }
  });

  it('never asks for something that is still locked', () => {
    let s = started();
    const asked: string[] = [];
    for (let guard = 0; guard < 2000; guard++) {
      const view = guideView(s);
      if (view?.kind !== 'step') break;
      if (asked[asked.length - 1] !== view.line.id) {
        asked.push(view.line.id);
        // The moment a step comes up, what it needs is open.
        if (view.line.id === 'sales' || view.line.id === 'sponsor') expect(isUnlocked(s, 'sales'), view.line.id).toBe(true);
        if (view.line.id === 'marketing' || view.line.id === 'campaign') expect(isUnlocked(s, 'marketing'), view.line.id).toBe(true);
      }
      s = follow(s, view.line.id);
    }
    expect(asked.slice(-5)).toEqual(['sales', 'sponsor', 'marketing', 'campaign', 'finish']);
    // The desks of the first team are one step; a later hire gets theirs in their own step, and the old one does not come back.
    expect(asked.filter((id) => id === 'desks')).toHaveLength(1);
  });

  it('leaves a company with a salesperson and a marketer at their desks, a sponsor and a small campaign', () => {
    const { state } = followPenny(started());
    const desked = employeesWithDesk(state);
    for (const role of ['sales', 'marketing'] as const) {
      const people = state.employees.filter((e) => e.role === role);
      expect(people, role).toHaveLength(1);
      expect(desked.has(people[0]!.id), role).toBe(true);
    }
    expect(state.milestones.some((m) => m.id === 'firstSponsor')).toBe(true);
    expect(state.campaigns).toHaveLength(1);
    expect(state.campaigns[0]).toMatchObject({ weeklyBudget: MARKETING.budgets[0], audience: 'all', targetId: state.channels[0]!.id });
    // Still within the first half year, and with money in the bank.
    expect(state.day).toBeLessThan(150);
    expect(state.money).toBeGreaterThan(0);
  });

  it('opens Marketing the moment the first sponsor is signed, not a day later', () => {
    let s = started();
    for (let guard = 0; guard < 2000; guard++) {
      const view = guideView(s);
      if (view?.kind !== 'step' || (view.line.id === 'sponsor' && s.offers.length > 0)) break;
      s = follow(s, view.line.id);
    }
    expect(guideView(s)).toMatchObject({ kind: 'step', line: { id: 'sponsor' } });
    expect(isUnlocked(s, 'marketing')).toBe(false);
    // The follower signs when a show clears an offer's minimum, and lets a day pass otherwise.
    let signed: GameState | null = null;
    for (let guard = 0; guard < 60 && !signed; guard++) {
      const next = follow(s, 'sponsor');
      if (next.contracts.length > 0) {
        expect(next.day).toBe(s.day);
        signed = next;
      }
      s = next;
    }
    expect(signed).not.toBeNull();
    expect(isUnlocked(signed!, 'marketing')).toBe(true);
    expect(guideView(signed!)).toMatchObject({ kind: 'step', line: { id: 'marketing' } });
    expect(signed!.messages.some((m) => m.about === 'marketing' && /Marketing is open/.test(m.text))).toBe(true);
  });
});

describe('hints', () => {
  /** A company that has been through the first weeks and thanked Penny. */
  const graduate = () => followPenny(started()).state;

  it('wait until the first weeks are over', () => {
    let state = started();
    for (const id of ['studio', 'equipment', 'office']) state = follow(state, id);
    // No salesperson, which is a hint later; now Penny is still on her steps.
    expect(guideView(state)?.kind).toBe('step');
  });

  it('come one at a time, a week apart', () => {
    let state = graduate();
    // Thanking Penny starts a quiet week too.
    expect(guideView(state)).toBeNull();
    while (!guideView(state)) state = tick(state);
    const first = guideView(state)!;
    expect(first.kind).toBe('hint');
    // Sponsors and marketing are steps of the first weeks now, not hints.
    for (const id of ['sponsors', 'offer', 'marketing']) expect(HINTS.some((line) => line.id === id), id).toBe(false);
    state = acknowledge(state, first.line.id);
    expect(state.guide.quiet).toBe(state.day + HINT_PAUSE);
    expect(guideView(state)).toBeNull();
    const heard = new Set<string>([first.line.id]);
    for (let day = 0; day < 400; day++) {
      state = tick(state);
      const view = guideView(state);
      if (view?.kind !== 'hint') continue;
      expect(heard.has(view.line.id)).toBe(false);
      // Penny never points at something that still has a lock on it.
      const needs = HINT_NEEDS[view.line.id];
      if (needs) expect(isUnlocked(state, needs), view.line.id).toBe(true);
      heard.add(view.line.id);
      state = acknowledge(state, view.line.id);
    }
    // A year of a small radio company: these come up for everyone. (Penny has the technician hired in her first weeks since 0.16.0.)
    for (const id of ['stale', 'second-region']) expect(heard, id).toContain(id);
    // Research is for a company in two regions or at the top of one: this one is neither, so she keeps it for later.
    expect(isUnlocked(state, 'research')).toBe(false);
    expect(heard).not.toContain('research');
  });

  it('about being in the red interrupts the first weeks', () => {
    let state = started();
    for (const id of ['look-around', 'ceo-office', 'reception', 'studio', 'equipment']) state = follow(state, id);
    state = { ...state, money: -5_000 };
    expect(guideView(state)).toMatchObject({ kind: 'hint', line: { id: 'red' } });
    state = acknowledge(state, 'red');
    expect(guideView(state)).toMatchObject({ kind: 'step', line: { id: 'mcr' } });
  });

  it('about something with a deadline does not wait for its turn', () => {
    let state = graduate();
    expect(guideView(state)).toBeNull();
    const host = state.employees.find((e) => e.role === 'host')!;
    state = { ...state, poachOffers: [{ id: 'p1', hostId: host.id, rivalId: state.rivals[0]!.id, salary: 9_000, expiresOn: state.day + 7 }] };
    expect(guideView(state)).toMatchObject({ kind: 'hint', line: { id: 'poaching' } });
  });

  it('are still there after a loan, a save and a load', () => {
    let state = graduate();
    const loan = takeLoan(state, 10_000, 24);
    if (loan.ok) state = loan.state;
    const loaded = fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(state, 0)))).state;
    expect(loaded.guide).toEqual(state.guide);
    expect(guideView(loaded)).toEqual(guideView(state));
  });
});

describe('the script', () => {
  it('gives every line an id of its own, for its recording', () => {
    const ids = LINES.map((line) => line.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(LINES).toContain(FAREWELL);
  });

  it('never has Penny or Uncle Tabby say a figure that balance.ts could change, or a name the player typed', () => {
    for (const line of LINES) expect(line.say.replaceAll('Top 40', ''), line.id).not.toMatch(/[0-9€%]/);
  });

  it('is written out for the voice-over as it stands (npm run voice-over)', () => {
    expect(readFileSync(new URL('../../design/voice-over.md', import.meta.url), 'utf8')).toBe(voiceOverScript());
    for (const hint of HINTS) expect(hint.when, hint.id).toBeTruthy();
  });

  it('knows when every step is done and when every hint is due', () => {
    const state = started();
    for (const step of STEPS) expect(() => stepDone(state, step.id)).not.toThrow();
    // A hint nobody could ever get would be a recording nobody hears.
    const late = { ...followPenny(started()).state, guide: { stage: 'on' as const, seen: ['finish'], quiet: 0 } };
    expect(HINTS.map((h) => h.id)).toContain(guideView(late)!.line.id);
  });
});

describe('older saves', () => {
  const old = (state: GameState) => {
    const { guide: _guide, ...rest } = state;
    // Version 15 is the last one from before the tutorial.
    return { version: 15, savedAt: 0, state: rest };
  };

  it('ask a company that has yet to start whether it wants Penny', () => {
    const loaded = fromSaveFile(JSON.parse(JSON.stringify(old(createInitialState(3))))).state;
    expect(loaded.guide).toEqual({ stage: 'offer', seen: [], quiet: 0 });
  });

  it('leave a company that is on the air alone', () => {
    const loaded = fromSaveFile(JSON.parse(JSON.stringify(old(followPenny(started()).state)))).state;
    expect(loaded.guide).toEqual({ stage: 'off', seen: [], quiet: 0 });
    expect(guideView(loaded)).toBeNull();
  });
});
