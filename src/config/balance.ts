// All balance and tuning numbers live here (see prompt.md, "How to use this document").

import type { SportsEventKind } from './events';
import type { GenreId } from './genres';
import type { Medium, RegionId } from './world';

// --- Time ---

/** Real-time milliseconds per in-game day at 1× speed. */
export const MS_PER_DAY = 4000;

/** Available game speeds. 0 = paused. */
export const SPEEDS = [0, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/** Never simulate more than this many days in one animation frame (e.g. after the tab was hidden). */
export const MAX_DAYS_PER_FRAME = 4;

export const START_YEAR = 1970;
/** Audience shares move from their 1970 to their 2030 level over this many years. */
export const AUDIENCE_SHIFT_YEARS = 60;
/**
 * A region's main audiences count this much more than their national share and
 * the others this much less; the mix is then scaled back to 100%. So a main
 * audience is twice as common in its regions as where it isn't one.
 */
export const REGIONAL_AUDIENCES = { main: 1.5, other: 0.75 };
export const DAYS_PER_YEAR = 365.25;

// --- Phase limits ---

/** Regions in play. */
export const ACTIVE_REGIONS: readonly RegionId[] = ['capital', 'north', 'coast', 'heartland', 'highlands'];
export const MAX_PLAYER_CHANNELS = 6;

// --- Money ---

export const STARTING_MONEY = 150_000;
/**
 * The region the company's headquarters are in: people there know the name, so
 * a channel that starts broadcasting there begins with some reputation (0–1)
 * instead of none. Rivals start a channel at RIVAL_START_REPUTATION.
 */
export const HOME_REGION = { startReputation: 0.15 };
export const RENT_PER_TILE = 40;
/** What building a room costs, once, per tile of its floor; a room that is made larger pays it for the tiles it gains. */
export const BUILD_COST_PER_TILE = 50;
/**
 * What furniture is worth when it is sold, as a share of its price. For
 * `graceDays` after it was placed it gives its whole price back, so a piece
 * bought by mistake costs nothing. After that it is second-hand: worth
 * `used`, falling in a straight line to `floor` over `years`.
 */
export const FURNITURE_WORTH = { graceDays: 7, used: 0.75, floor: 0.25, years: 5 };

/**
 * License prices scale with the region's population; the Capital (basePopulation)
 * pays the base price. A TV license costs eight times as much as one for radio, and six times as much a month.
 */
export const LICENSE: Record<Medium, { basePrice: number; baseMonthly: number; minPrice: number; minMonthly: number }> = {
  radio: { basePrice: 20_000, baseMonthly: 2_000, minPrice: 5_000, minMonthly: 500 },
  tv: { basePrice: 160_000, baseMonthly: 12_000, minPrice: 40_000, minMonthly: 3_200 },
};
export const LICENSE_BASE_POPULATION = 2_500_000;
/** Radio licenses per region = base + floor(population / peoplePerSlot), so they grow with the population. */
export const RADIO_LICENSE_SLOTS = { base: 3, peoplePerSlot: 500_000 };
/**
 * TV licenses are issued by the broadcasting authority: one per listed year. The
 * public broadcaster holds the first one in every region; the second Capital
 * license is free at the start.
 */
export const TV_LICENSE_YEARS: Record<RegionId, readonly number[]> = {
  capital: [1970, 1970, 1974, 1979, 1987, 1996],
  north: [1970, 1972, 1977, 1990],
  coast: [1970, 1973, 1981, 1999],
  heartland: [1970, 1976, 1993],
  highlands: [1970, 1979],
};

/** Licenses issued after the start are auctioned for a week (sealed bids). */
export const AUCTION = {
  days: 7,
  /** A rival that wants a license bids reserve × (1 + aggression), with aggression drawn from this range. */
  aggression: { radio: { min: 0.1, max: 0.7 }, tv: { min: 0.2, max: 1.2 } } as Record<Medium, { min: number; max: number }>,
};

/** Ad revenue per 1000 listeners or viewers (baseline spot ads, no sponsor). */
export const CPM: Record<Medium, number> = { radio: 1.9, tv: 3 };
export const REVAMP_COST = 3_000;
/** Months of salary paid when firing someone. */
export const SEVERANCE_MONTHS = 1;
/** Month-ends below €0 in a row before the company goes bankrupt. */
export const BANKRUPTCY_MONTHS = 3;
/** What Uncle Tabby pays in, once, when the bank would otherwise close the company down. */
export const BAILOUT = { amount: 50_000 };

// --- Staff ---

/** Most shows someone in production can work on. */
export const MAX_SHOWS_PER_PERSON = 2;
/** Production staff beyond what a genre needs: each one makes the show a little better, however good they are, up to `max` of them. */
export const EXTRA_PRODUCER = { bonus: 0.05, max: 2 };
/** A host presents one show, which is one slot a day: nobody is on the air morning and night. */
export const MAX_SHOWS_PER_HOST = 1;
/** A host's skill counts at this rate outside their specialties. */
export const OFF_SPECIALTY_SKILL = 0.7;
/** Candidates per role each month; `host` are radio hosts, plus TV_HOST_CANDIDATES TV hosts. */
export const CANDIDATE_POOL = { host: 5, production: 8, channelManager: 2, sales: 4, marketing: 4, researcher: 3, manager: 3, cleaner: 2, technician: 2, maintenance: 2 };
export const TV_HOST_CANDIDATES = 3;
/** The five shows Penny has a new company make (config/guide.ts). The radio hosts of a new game's first hiring pool have one of these each as a specialty, so that her plan can always be followed. */
export const OPENING_SHOWS: readonly GenreId[] = ['morningShow', 'top40', 'top40', 'top40', 'rock'];
export const SKILL_RANGE = { min: 15, max: 85 };

export const SALARY = {
  production: { min: 800, max: 2_500 },
  channelManager: { min: 2_000, max: 4_000 },
  sales: { min: 900, max: 2_700 },
  marketing: { min: 900, max: 2_700 },
  researcher: { min: 1_000, max: 3_000 },
  manager: { min: 2_500, max: 4_500 },
  cleaner: { min: 500, max: 1_000 },
  technician: { min: 800, max: 1_800 },
  maintenance: { min: 700, max: 1_500 },
  /**
   * Host salary = min + skill share + fame share, capped at max. A host is
   * paid for one show a day (MAX_SHOWS_PER_HOST), so five hosts for a full
   * day cost about what three cost when a host presented two shows.
   */
  host: { min: 600, skill: 2_100, fame: 1_500, max: 5_000 },
};

/** A department manager boosts the effective skill of up to `teamSize` team members. */
export const MANAGER = { maxBonus: 0.2, teamSize: 8 };

/** Working days earn XP; level n → n + 1 takes perLevel × n XP and adds a few skill points. */
export const XP = {
  perDay: 1,
  perLevel: 150,
  skillGain: { min: 2, max: 4 },
  maxSkill: 100,
  /** Every level-up comes with at least this raise, so long-serving staff get expensive. */
  raisePerLevel: 0.06,
};

/**
 * A course someone is sent on. A stand-in does their work meanwhile, less well;
 * the price is what the stand-in and the course cost, in months of the salary
 * of whoever goes. The head of their department arranges it, one at a time.
 */
export const TRAINING = {
  days: 30,
  salaryMonths: 2,
  skillGain: { min: 5, max: 8 },
  /** The stand-in's skill, as a share of the skill of the one who is away. */
  standIn: 0.75,
};

// --- Sales (sponsor contracts) ---

export const SALES = {
  /** New offers each Monday ≈ total effective sales skill / 100. */
  maxOpenOffers: 6,
  preferredAudienceChance: 0.5,
  preferredAudienceBonus: 1.25,
  /** Minimum listeners = a current show's listeners × a factor in this range. */
  minListeners: { min: 0.6, max: 1.1 },
  durationWeeks: { min: 8, max: 26 },
  offerLifetimeDays: 14,
  /** Penalty = this many weeks of the contract's minimum revenue. */
  penaltyWeeks: 2,
};

/**
 * How well the company knows a sponsor: a level per sponsor, which the sales
 * staff work on while a contract with that sponsor runs. A sponsor pays the
 * normal ad rate plus a share that goes by its level: 20% at level 1, 70% at
 * level 6.
 */
export const RELATIONS = {
  levels: 6,
  firstBonus: 0.2,
  bonusPerLevel: 0.1,
  /** Points from level n to n + 1: this × n. The sales staff earn their effective skill / 100 in points a day, shared among the sponsors under contract. */
  pointsPerLevel: 30,
  /** With a sponsor on every show there are no offers to chase: the whole team works on the sponsors it has, at this rate. */
  fullTime: 2,
  /** The chance that an offer comes from a sponsor the company has worked with before. */
  returnChance: 0.5,
  /** Levels a sponsor drops when a contract with it ends in a penalty. */
  lostOnPenalty: 1,
};

// --- Marketing ---

export const MARKETING = {
  /** Highest promotion one campaign can reach (on top of 1 in the appeal formula). */
  maxPromotion: 0.5,
  /** Weekly budget for full strength; strength grows with the square root of the budget. */
  fullBudget: 10_000,
  budgets: [1_000, 2_500, 5_000, 10_000],
  durations: [4, 8, 12],
  /** "All audiences" campaigns reach each audience at this strength. */
  allAudiences: 0.6,
  /** Daily rate at which promotion moves toward its target, and fades afterwards. */
  buildRate: 0.1,
  fadeRate: 0.03,
};

// --- Content market (licensed TV titles) and sports rights ---

export const CONTENT = {
  /** New titles on the market each month, per genre. */
  titlesPerMonth: { movies: 10, series: 8, documentary: 5, musicVideos: 4, teleshopping: 2 } as Partial<Record<GenreId, number>>,
  /** Airings included in a title. */
  airings: {
    movies: [5, 10],
    series: [12, 26],
    documentary: [4, 8],
    musicVideos: [20, 40],
    teleshopping: [20, 40],
  } as Partial<Record<GenreId, readonly [number, number]>>,
  /** Price per airing at quality 1; scales with quality^1.5. */
  pricePerAiring: { movies: 2_700, series: 1_300, documentary: 800, musicVideos: 300, teleshopping: 0 } as Partial<Record<GenreId, number>>,
  quality: { min: 0.35, max: 0.95 },
  /** Teleshopping pays a fixed fee per airing instead of ad revenue, and its quality is capped. */
  teleshopping: { maxQuality: 0.3, feePerAiring: { min: 800, max: 2_000 } },
  /** A title's freshness is multiplied by this each time it airs, and recovers daily off air. */
  freshnessPerAiring: 0.85,
  freshnessRecovery: 0.02,
  minFreshness: 0.3,
};

/** Produced TV shows cost this much per episode (sets, costumes, crew) on each day they air. */
export const EPISODE_COST: Partial<Record<GenreId, number>> = {
  kids: 300,
  talkShow: 500,
  gameShow: 700,
  soap: 800,
  sitcom: 1_000,
  tvNews: 900,
  tvSports: 600,
  reality: 800,
};

/** Sports broadcast rights, bought by the season on the content market. */
export const SPORTS_RIGHTS = {
  offersPerMonth: 2,
  months: [6, 12] as readonly number[],
  /** Multiplies a sports show's appeal while the rights are held: it shows the games. */
  prestige: { min: 0.8, max: 1.25 },
  /** The same without any rights: the show can only talk about sport. */
  talkOnly: 0.6,
  /** Price per month of rights at prestige 1; scales with prestige². */
  pricePerMonth: 12_000,
};

// --- R&D and equipment tiers (techs are in config/tech.ts) ---

export const RESEARCH = {
  /** A tech can be researched this many years before its historical year… */
  maxYearsEarly: 5,
  /** …at cost × (1 + earlyCostPerYear × years early). */
  earlyCostPerYear: 0.3,
};

export const TIERS = {
  /** Equipment price = base × (1 + costPerTier × (tier − 1)). */
  costPerTier: 0.5,
  /** Output of staff by the tier of their workstation (typewriter, electric, PC, laptop). */
  officeOutput: [1, 1.1, 1.25, 1.35] as readonly number[],
  /**
   * StudioLevel = (average equipment tier / tier current for the year) ^ exponent,
   * capped: old equipment hurts, equipment ahead of its time helps a little.
   */
  studioLevelExponent: 0.5,
  studioLevelCap: 1.2,
};

/** Rival show quality grows by this much per year since 1970, up to the maximum multiplier. */
export const RIVAL_ERA = { perYear: 0.012, max: 1.6 };

// --- Living office: cleanliness, equipment condition, building issues and morale ---

/** Support staff do their daily work × (skillBase + skill / 100), so skill 50 does exactly the listed amount. */
export const SUPPORT = { skillBase: 0.5 };

/** Rooms are 0–100 clean and get dirtier with use. */
export const CLEANLINESS = {
  /** Points lost per day for each person with a desk in an office… */
  perWorker: 0.1,
  /** …each scheduled show made in a studio… */
  perShow: 0.2,
  /** …and each member of staff a canteen serves. */
  perDiner: 0.02,
  /** At or above this a room is clean enough: no effect on work or morale. */
  cleanEnough: 80,
  /** Work and show quality in a filthy room (cleanliness 0); rises to 1 at cleanEnough. */
  minFactor: 0.7,
  /** Points one cleaner restores per day. */
  cleanerPerDay: 3,
  /** The player is warned when a room drops below this. */
  warnBelow: 50,
};

/** Workstations and studio equipment are in 0–100 condition; at 0 they are broken. */
export const WEAR = {
  perDay: 0.2,
  /** Points one technician repairs per day. */
  technicianPerDay: 10,
  /** A studio with a broken item works at this share of its level. */
  brokenStudioLevel: 0.5,
};

/**
 * A studio whose mixing desk or control desk stands in a control room next
 * door: the sound and the light of the control room stay out of the show.
 */
export const CONTROL_ROOM = {
  /** Multiplier on the studio's level. */
  studioLevel: 1.05,
};

/** The lighting or heating fails now and then; it stays broken until maintenance staff fix it. */
export const ISSUES = {
  dailyChancePerRoom: 0.004,
  /** Days of work for one maintenance worker to fix one. */
  work: 3,
};

/** Staff morale is 0–100 and drifts toward a target set by their workplace. */
/**
 * Things that make the office nicer. Each comfort piece (a planter, a couch,
 * a TV screen, a radio) adds a little to the morale people drift toward: in a
 * workroom for those who work there, in a canteen for everyone it has a seat
 * for. Toilets on a floor do the same for everyone who works on that floor.
 */
export const COMFORT = {
  /** Morale points per comfort piece. */
  perPiece: 1,
  /** Pieces that count per room; more are only for looks. */
  maxPieces: 4,
  /** Morale points for working on a floor with complete toilets. */
  toilets: 2,
};

export const MORALE = {
  /** Morale in a clean office without a canteen; at this level work is unaffected. */
  neutral: 60,
  /** Lost in a filthy room (scaled by how dirty it is). */
  dirtPenalty: 30,
  /** Lost while the lighting or heating is broken in their room. */
  issuePenalty: 20,
  /** Gained when a clean canteen has a seat for everyone. */
  canteenBonus: 40,
  /** Share of the gap to the target closed each day. */
  rate: 0.05,
  /** Work and show quality at morale 0, and at morale 100. */
  minFactor: 0.8,
  maxFactor: 1.1,
};

// --- Dividends ---

/**
 * Each 1 January the owners take `payout` of the cash above a reserve of
 * `reserveMonths` of running costs (salaries, rent, license fees). Money that
 * isn't reinvested leaves the company, and the total paid is the company's score.
 */
export const DIVIDEND = { payout: 0.3, reserveMonths: 12 };

// --- Loans ---

export const LOAN = {
  /** Up to this share of company value. */
  maxShare: 0.5,
  monthlyRate: 0.01,
  terms: [24, 48],
  minAmount: 10_000,
  /** Company value counts this many months of average revenue (last 3 months). */
  revenueMonths: 6,
};

/** Company value at which the second floor becomes available to rent. */
export const FLOOR_UNLOCK_VALUE: Record<number, number> = { 2: 500_000, 3: 1_500_000 };

// --- Ratings model (prompt.md section 7) ---

export const QUALITY_WEIGHTS = { host: 0.4, production: 0.3, studio: 0.3 };
export const FAME_APPEAL = 0.5;
/** Exponent k in the share formula. */
export const SHARE_EXPONENT = 2;
/** Appeal of "doing something else / switched off". */
export const BASELINE_APPEAL = 0.3;

/**
 * A show loses this much freshness every day it airs, down to FRESHNESS_MIN.
 * After a year on the air it is just under half as fresh as it was.
 */
export const FRESHNESS_DECAY = 0.0014;
export const FRESHNESS_MIN = 0.4;

/** What a channel manager airs in an empty slot. */
export const RERUN = { quality: 0.2, fit: 0.5 };

export const REPUTATION_RATE = 0.01;

/** Appeal bonus for shows in a channel's specialization (3+ slots of one genre group). */
export const SPECIALIZATION = { minSlots: 3, bonus: 1.1 };

/** Host fame moves toward 100 × L / (L + FAME_HALF_LISTENERS), where L is their best show's listeners. */
export const FAME_HALF_LISTENERS = 250_000;
export const FAME_GROWTH_RATE = 0.01;
export const FAME_DECAY_RATE = 0.002;

// --- Rivals (personalities are in config/rivals.ts) ---

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
/** Multiplies every rival show's quality; chosen when a game starts. */
export const RIVAL_DIFFICULTY: Record<Difficulty, number> = { easy: 0.6, normal: 0.7, hard: 0.8 };
/** Rival shows can get this good at most. */
export const RIVAL_QUALITY_CAP = 1.1;
export const RIVAL_START_REPUTATION = 0.3;
/** Monthly chance that a rival expands into another region. */
export const RIVAL_EXPANSION_CHANCE = 0.05;
/** Rivals don't expand before this year, so a new company has time to find its feet. */
export const RIVAL_EXPANSION_FROM_YEAR = 1971;
/** Rivals only expand where at least this many licenses are free, so the player is never locked out. */
export const RIVAL_MIN_FREE_SLOTS = 2;
/** Rival TV channels start with this reputation in a region they win. */
export const RIVAL_TV_START_REPUTATION = 0.2;

// --- Events (the calendar is in config/events.ts) ---

export const EVENTS = {
  /**
   * Appeal of sports shows during a World Cup or the Olympics: on radio for
   * everyone, on TV for whoever holds the event's broadcast rights.
   */
  sportsAppeal: 1.5,
  /** Appeal of news shows during an election campaign. */
  electionNewsAppeal: 1.3,
  /** Ad rates during a recession. */
  recessionAdRate: 0.8,
  /** An event's TV rights go to auction this many days before it starts (for AUCTION.days days). */
  auctionLeadDays: 60,
  /** Reserve price in 1970; it rises by `reserveGrowth` a year. */
  reserve: { worldCup: 80_000, olympics: 50_000 } as Record<SportsEventKind, number>,
  reserveGrowth: 0.03,
  /** Each rival with a TV channel bids with this chance, at reserve × (1 + aggression). */
  rivalInterest: 0.7,
  aggression: { min: 0.1, max: 1.5 },
  /** A rival that wins the rights airs the event in this slot (evening), at this quality before RIVAL_DIFFICULTY and the era. */
  rivalSlot: 3,
  rivalCoverageQuality: 0.9,
};

// --- The player's own events ---

export type OwnEventKind = 'concert' | 'gala' | 'telethon';

/**
 * Events the player stages on a channel. Cost and prestige are per region the
 * channel broadcasts in; reputation (0–1) and the host's fame (0–100) get a
 * one-off lift that fades again as they drift back to what the channel earns.
 */
export const OWN_EVENTS: Record<OwnEventKind, { name: string; costPerRegion: number; reputation: number; fame: number; prestigePerRegion: number }> = {
  concert: { name: 'Concert', costPerRegion: 30_000, reputation: 0.05, fame: 5, prestigePerRegion: 1 },
  gala: { name: 'Gala', costPerRegion: 100_000, reputation: 0.1, fame: 10, prestigePerRegion: 4 },
  telethon: { name: 'Telethon', costPerRegion: 300_000, reputation: 0.18, fame: 18, prestigePerRegion: 15 },
};
/** A channel can stage one event per this many days, and an event can't lift reputation above the cap. */
export const OWN_EVENT_LIMITS = { cooldownDays: 365, maxReputation: 1.5 };

// --- License renewal rounds ---

export const RENEWAL = {
  /** A license runs this long, then goes back to auction. */
  termYears: 8,
  /** Licenses that exist when a game starts expire after between these many years, so they don't all come up at once. */
  firstTermYears: { min: 5, max: 8 },
  /** The holder is warned this many days ahead, and the auction runs for the last `auctionDays`. */
  warnDays: 365,
  auctionDays: 30,
  /** Reserve = this many years of what the license earns in ads (never below the list price). */
  reserveYears: 0.25,
  /** A challenger bids between these many years of what the license earns. */
  challengeYears: { min: 0.3, max: 0.7 },
  /** The holder's bid counts for this much more. */
  holderAdvantage: 0.25,
  /** A company that gives a license up, or loses one, can't buy one for that medium in that region for this long. */
  barYears: 5,
};

// --- Host poaching ---

export const POACH = {
  /** Rivals go after hosts at least this famous… */
  minFame: 35,
  /** …with this chance each month, one offer at a time. */
  monthlyChance: 0.12,
  /**
   * They offer the going rate for the host's skill and fame × a premium in this
   * range, and only bother if that beats the host's current salary by minRaise.
   */
  premium: { min: 1.2, max: 1.5 },
  minRaise: 0.05,
  /** Days the player has to match the offer. */
  answerDays: 14,
  /** A rival show's quality when it gains one of the player's hosts, and when it loses its host to the player. */
  rivalGain: 1.1,
  rivalLoss: 0.9,
  /** A poached rival host is paid the normal salary × this premium, plus this many months of it as a signing fee. */
  salaryPremium: 1.25,
  signingMonths: 12,
  /** The player can sign one rival host per this many days. */
  cooldownDays: 90,
  /** Skill range of rival hosts (from their show's quality). */
  skill: { min: 40, max: 95 },
};

// --- Milestones (the list is in config/milestones.ts) ---

export const MILESTONES = {
  /** Days on the air for "One month on the air". */
  firstMonthDays: 30,
  /** Radio listeners for "A million listeners". */
  listeners: 1_000_000,
  /** Host fame for "A household name". */
  hostFame: 80,
  /** Staff and average morale for "A great place to work". */
  happyStaff: 20,
  happyMorale: 90,
  /** Prestige for "Talk of the town". */
  prestige: 100,
  /** Dividends paid for the three dividend milestones. */
  dividends: [1_000_000, 10_000_000, 100_000_000] as const,
};

// --- History ---

export const MAX_HEADLINES = 12;
export const MAX_MESSAGES = 50;
export const MAX_WEEKLY_REPORTS = 12;
