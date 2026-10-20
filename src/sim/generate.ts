import { CANDIDATE_POOL, CLERK_CANDIDATES, COOK_CANDIDATES, EDITOR_CANDIDATES, ENGINEER_CANDIDATES, GUARD_CANDIDATES, OPENING_SHOWS, RECRUITER_CANDIDATES, RIVAL_DIFFICULTY, RIVAL_ERA, RIVAL_QUALITY_CAP, TV_HOST_CANDIDATES, RIVAL_START_REPUTATION, SCHEDULER_CANDIDATES, SKILL_RANGE, START_YEAR, TALENT_MANAGER_CANDIDATES, WRITER_CANDIDATES } from '../config/balance';
import { GENRES, getGenre, hasHost, type GenreId } from '../config/genres';
import { LOGO_COLORS } from '../config/names';
import { PERSONALITIES, type Personality, type RivalChannelSpec } from '../config/rivals';
import type { Medium, RegionId } from '../config/world';
import { hostAsking, salaryFor } from './economy';
import { toCalendarDate } from './calendar';
import { staggeredExpiry } from './licenses';
import { channelInitials, channelNameFor, drawCompanyName, drawLastName, drawShowName, GIVEN_NAMES } from './names';
import { Rng } from './rng';
import {
  newId,
  type Candidate,
  type Department,
  type GameState,
  type LogoShape,
  type Person,
  type Logo,
  type Rival,
  type RivalChannel,
  type RivalShow,
  type Role,
} from './state';

/** Mixed into the state of the game's chance to start the stream of the writers and the editors. */
const WRITER_STREAM = 0x5eed_0014;

/** A given name, then a last name made of a prefix and a suffix (issue #92). Two draws. */
export function personName(rng: Rng): string {
  const given = rng.pick(GIVEN_NAMES);
  return `${given} ${drawLastName(rng)}`;
}

/** Skill clusters around the middle of the range (average of two rolls). */
function rollSkill(rng: Rng): number {
  const { min, max } = SKILL_RANGE;
  return Math.round((rng.int(min, max) + rng.int(min, max)) / 2);
}

const DEPARTMENTS: readonly Department[] = ['production', 'sales', 'marketing', 'research'];

/**
 * Hosts specialize in genres of one medium. `id` is a new one from the game's counter unless one is given.
 * `bestOf` draws the skill that many times and keeps the best: a recruiter's candidates (0.17.0).
 */
export function generatePerson(draft: GameState, rng: Rng, role: Role, year: number, medium: Medium = 'radio', id?: string, bestOf = 1): Person {
  let skill = rollSkill(rng);
  for (let i = 1; i < bestOf; i++) skill = Math.max(skill, rollSkill(rng));
  const isHost = role === 'host';
  const fame = isHost ? rng.int(0, Math.round(skill / 3)) : 0;
  const specialties: GenreId[] = [];
  if (isHost) {
    const available = GENRES.filter((g) => g.kind === 'produced' && g.medium === medium && g.unlockYear <= year);
    const count = rng.int(1, 2);
    while (specialties.length < count) {
      const genre = rng.pick(available).id;
      if (!specialties.includes(genre)) specialties.push(genre);
    }
    // A sitcom and reality TV have no host (0.14.0). They are drawn as before, so seeded games stay the same, and
    // then left out; a host who had only one of them is best at the first genre of their medium that has a host.
    const hosted = specialties.filter((g) => hasHost(getGenre(g)));
    specialties.splice(0, specialties.length, ...(hosted.length > 0 ? hosted : [available.find(hasHost)!.id]));
  }
  return {
    id: id ?? newId(draft, 'p'),
    name: personName(rng),
    role,
    skill,
    salary: isHost ? hostAsking(draft, skill, fame) : salaryFor(role, skill, fame, draft),
    specialties,
    fame,
    department: role === 'manager' ? rng.pick(DEPARTMENTS) : null,
  };
}

/**
 * `opening` is the first pool of a new game: its radio hosts are at home in the shows Penny plans (see OPENING_SHOWS).
 * `recruited` is how many more the recruiters bring in (0.17.0; see `recruitedCandidates`).
 */
export function generateCandidates(draft: GameState, rng: Rng, year: number, opening = false, recruited = 0): Candidate[] {
  const people: Candidate[] = [];
  for (const [role, count] of Object.entries(CANDIDATE_POOL) as [Role, number][]) {
    for (let i = 0; i < count; i++) people.push(generatePerson(draft, rng, role, year));
  }
  if (opening) {
    // Who they are, how good and what they ask stays as chance had it; only what they are best at is given.
    const hosts = people.filter((p) => p.role === 'host');
    OPENING_SHOWS.forEach((genre, i) => {
      const host = hosts[i];
      if (host) host.specialties = [genre, ...host.specialties.filter((g) => g !== genre)].slice(0, 2);
    });
  }
  for (let i = 0; i < TV_HOST_CANDIDATES; i++) people.push(generatePerson(draft, rng, 'host', year, 'tv'));
  // Writers and video editors (0.14.0) come from a stream of chance of their own and take no number from the
  // game's counter, so that everything else in a seeded game happens as it did before there were any.
  const side = new Rng((rng.state ^ WRITER_STREAM) >>> 0);
  for (let i = 0; i < WRITER_CANDIDATES; i++) people.push(generatePerson(draft, side, 'writer', year, 'radio', `p${draft.nextId}w${i}`));
  for (let i = 0; i < EDITOR_CANDIDATES; i++) people.push(generatePerson(draft, side, 'editor', year, 'radio', `p${draft.nextId}e${i}`));
  // Audio engineers, cooks and post room clerks (0.15.0) come after them in the same stream.
  for (let i = 0; i < ENGINEER_CANDIDATES; i++) people.push(generatePerson(draft, side, 'engineer', year, 'radio', `p${draft.nextId}a${i}`));
  for (let i = 0; i < COOK_CANDIDATES; i++) people.push(generatePerson(draft, side, 'cook', year, 'radio', `p${draft.nextId}k${i}`));
  for (let i = 0; i < CLERK_CANDIDATES; i++) people.push(generatePerson(draft, side, 'clerk', year, 'radio', `p${draft.nextId}m${i}`));
  // Talent managers (0.18.0) after the clerks.
  for (let i = 0; i < TALENT_MANAGER_CANDIDATES; i++) people.push(generatePerson(draft, side, 'talentManager', year, 'radio', `p${draft.nextId}t${i}`));
  // Recruiters (0.17.0) last of all, and then whoever the recruiters bring in: the better of two draws each,
  // spread over the jobs the company has, hosts first.
  for (let i = 0; i < RECRUITER_CANDIDATES; i++) people.push(generatePerson(draft, side, 'recruiter', year, 'radio', `p${draft.nextId}r${i}`));
  // Music schedulers (0.18.0) after the recruiters, so that nobody drawn before is any different.
  for (let i = 0; i < SCHEDULER_CANDIDATES; i++) people.push(generatePerson(draft, side, 'scheduler', year, 'radio', `p${draft.nextId}s${i}`));
  const jobs = recruitedJobs(draft);
  const hostMedia = [...new Set(draft.employees.filter((e) => e.role === 'host').map((e) => (e.specialties[0] ? getGenre(e.specialties[0]).medium : 'radio')))];
  for (let i = 0; i < recruited; i++) {
    const role = jobs[i % jobs.length]!;
    const medium = role === 'host' && hostMedia.length > 1 ? side.pick(hostMedia) : (hostMedia[0] ?? 'radio');
    people.push(generatePerson(draft, side, role, year, medium, `p${draft.nextId}x${i}`, 2));
  }
  // Guards (0.18.0) after all of them, so that nobody drawn before is any different.
  for (let i = 0; i < GUARD_CANDIDATES; i++) people.push(generatePerson(draft, side, 'guard', year, 'radio', `p${draft.nextId}g${i}`));
  return people.map((p) => ({ ...p, foundFor: null }));
}

/** The jobs a recruiter looks for people for: hosts, then every other job the company has, in the order of the list of jobs. Never a department's manager. */
function recruitedJobs(draft: GameState): Role[] {
  const employed = new Set(draft.employees.map((e) => e.role));
  return ['host', ...ROLES.filter((role) => role !== 'host' && role !== 'manager' && employed.has(role))];
}

/** Every job, in a fixed order, so that seeded pools stay the same. */
const ROLES: readonly Role[] = ['host', 'production', 'channelManager', 'sales', 'marketing', 'researcher', 'manager', 'cleaner', 'technician', 'maintenance', 'writer', 'editor', 'engineer', 'cook', 'clerk', 'recruiter', 'scheduler', 'guard'];

/** Rivals get better over the decades (staff, formats, technology). */
export const rivalEraQuality = (year: number) => Math.min(RIVAL_ERA.max, 1 + RIVAL_ERA.perYear * Math.max(0, year - START_YEAR));

/** How good rivals are in this game and year: the difficulty setting × how far broadcasting has come. Saves from before difficulty existed count as normal. */
export function rivalStrength(state: Pick<GameState, 'difficulty' | 'day'>): number {
  return (RIVAL_DIFFICULTY[state.difficulty] ?? RIVAL_DIFFICULTY.normal) * rivalEraQuality(toCalendarDate(state.day).year);
}

/** A fresh rival show for a slot, avoiding names already on that channel. `strength` is rivalStrength(state). */
export function generateRivalShow(rng: Rng, personality: Personality, genre: GenreId, taken: readonly string[], strength: number): RivalShow {
  const spec = PERSONALITIES[personality];
  const base = spec.quality.min + rng.next() * (spec.quality.max - spec.quality.min);
  // In the order the draws were always made, so seeded games stay as they were.
  const name = drawShowName(rng, taken);
  const hostFame = rng.int(spec.hostFame.min, spec.hostFame.max);
  const hostName = getGenre(genre).kind === 'produced' ? personName(rng) : '';
  return {
    name,
    genre,
    quality: Math.min(RIVAL_QUALITY_CAP, base * strength),
    hostFame,
    // A sitcom or reality TV has a cast, not a host (0.14.0).
    hostName: hasHost(getGenre(genre)) ? hostName : '',
  };
}

const LOGO_SHAPES: readonly LogoShape[] = ['circle', 'square', 'diamond', 'shield'];

/** A rival channel with a fresh schedule, broadcasting in `regionIds`. */
export function generateRivalChannel(
  draft: GameState,
  rng: Rng,
  rival: Pick<Rival, 'name' | 'personality'> & { logo: Omit<Logo, 'initials'> },
  spec: RivalChannelSpec,
  medium: Medium,
  regionIds: readonly RegionId[],
  number = 0,
): RivalChannel {
  const schedule: RivalShow[] = [];
  for (const genre of spec.schedule) {
    schedule.push(generateRivalShow(rng, rival.personality, genre, schedule.map((s) => s.name), rivalStrength(draft)));
  }
  // Unrelated to the company, and picked from its name rather than drawn, so no random numbers are used (issue #92).
  const name = spec.name ?? channelNameFor(`${rival.name}|${medium}|${number}`, medium);
  return {
    id: newId(draft, 'rc'),
    name,
    logo: { ...rival.logo, initials: spec.initials ?? channelInitials(name) },
    medium,
    regionIds: [...regionIds],
    schedule,
    reputation: Object.fromEntries(regionIds.map((r) => [r, RIVAL_START_REPUTATION])),
    // Spread out by the id counter, so no random numbers are used and seeded games stay the same.
    licenseExpiry: Object.fromEntries(regionIds.map((r, i) => [r, staggeredExpiry(draft.day, draft.nextId + i)])),
  };
}

/** A rival with its radio channels, and its TV channel if it has one from the start. */
export function generateRival(draft: GameState, rng: Rng, personality: Personality, name: string): Rival {
  const spec = PERSONALITIES[personality];
  const id = newId(draft, 'r');
  const logo = { shape: rng.pick(LOGO_SHAPES), color: rng.pick(LOGO_COLORS) };
  const owner = { name: spec.company ?? name, personality, logo };
  const channels = spec.channels.map((channel, i) =>
    generateRivalChannel(draft, rng, owner, channel, 'radio', spec.regions, spec.channels.length > 1 ? i + 1 : 0),
  );
  if (spec.tv.launchYear <= START_YEAR) channels.push(generateRivalChannel(draft, rng, owner, spec.tv, 'tv', spec.regions));
  return { id, name: owner.name, personality, channels };
}

/**
 * One rival per personality, with distinct names. A name is drawn even for a
 * rival with a fixed company name, so every seeded game stays the same.
 */
export function generateRivals(draft: GameState, rng: Rng, personalities = Object.keys(PERSONALITIES) as Personality[]): Rival[] {
  const used = new Set(draft.rivals.map((r) => r.name));
  return personalities.map((personality) => {
    const name = drawCompanyName(rng, used);
    used.add(name);
    return generateRival(draft, rng, personality, name);
  });
}
