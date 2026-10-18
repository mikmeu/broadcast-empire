import { ACTIVE_REGIONS, START_YEAR, type Difficulty } from '../config/balance';
import { startingMoney } from './difficulty';
import { cleanLook, defaultLook, isLook, type Look } from '../config/looks';
import { buildingFor } from '../config/office';
import type { RegionId } from '../config/world';
import { refreshMarket } from './content';
import { generateCandidates, generateRivals } from './generate';
import { initialIssued } from './licenses';
import { Rng } from './rng';
import { emptyLedger, type GameState } from './state';

/** What the player decides when a game starts, besides the difficulty. */
export interface Setup {
  playerName: string;
  companyName: string;
  headquarters: RegionId;
  /** The character the player made for themselves. Left out, they get one by their name. */
  look?: Look;
}

/** For games that start without the form: tests, and saves from before the form existed. */
export const DEFAULT_SETUP: Setup = { playerName: 'The founder', companyName: 'Your company', headquarters: 'capital' };

/** The longest a name can be, in characters. */
export const NAME_LENGTH = 32;

/** A name as it is kept: without spaces around it or runs of them inside it, and not too long. */
export const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, NAME_LENGTH).trim();

/** Why a game can't start with this setup, or null if it can. */
export function setupError(setup: Setup): string | null {
  if (!cleanName(setup.playerName)) return 'Fill in your name.';
  if (!cleanName(setup.companyName)) return 'Give your company a name.';
  if (!ACTIVE_REGIONS.includes(setup.headquarters)) return 'Pick a region for your headquarters.';
  if (setup.look !== undefined && !isLook(setup.look)) return 'Choose a character.';
  return null;
}

export function createInitialState(seed: number, difficulty: Difficulty = 'normal', setup: Setup = DEFAULT_SETUP): GameState {
  const error = setupError(setup);
  if (error) throw new Error(error);
  const state: GameState = {
    day: 0,
    seed,
    rngState: seed >>> 0,
    difficulty,
    playerName: cleanName(setup.playerName),
    look: setup.look ? cleanLook(setup.look) : defaultLook(cleanName(setup.playerName)),
    companyName: cleanName(setup.companyName),
    headquarters: setup.headquarters,
    building: buildingFor(setup.headquarters).id,
    nextId: 1,
    money: startingMoney(difficulty),
    dividendsPaid: 0,
    prestige: 0,
    listeners: 0,
    viewers: 0,
    researchPoints: 0,
    techs: [],
    reputation: 0,
    rooms: [],
    employees: [],
    candidates: [],
    licenses: [],
    channels: [],
    shows: [],
    rivals: [],
    offers: [],
    contracts: [],
    campaigns: [],
    promotion: {},
    loan: null,
    floorsUnlocked: 1,
    licensesIssued: initialIssued(0),
    auctions: [],
    licenseBars: [],
    library: [],
    market: { titles: [], rights: [] },
    relations: {},
    sportsRights: [],
    rightsAuctions: [],
    eventRights: [],
    poachOffers: [],
    lastPoachDay: null,
    headlines: [],
    milestones: [],
    unlocked: [],
    lastDay: null,
    weekAgo: {},
    week: [],
    ledger: emptyLedger(),
    weeklyReports: [],
    monthlyReports: [],
    messages: [],
    nextMessageId: 1,
    negativeMonths: 0,
    bailedOut: false,
    bankrupt: false,
    // Every new game starts with Uncle Tabby's welcome and Penny's offer.
    guide: { stage: 'welcome', seen: [], quiet: 0 },
    meetings: {},
    channelMeetings: {},
    unrest: {},
    offAir: {},
    grace: {},
  };

  const rng = new Rng(state.rngState);
  state.candidates = generateCandidates(state, rng, START_YEAR, true);
  state.rivals = generateRivals(state, rng);
  refreshMarket(state, rng);
  state.rngState = rng.state;
  return state;
}
