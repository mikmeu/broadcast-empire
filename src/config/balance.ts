// All balance and tuning numbers live here (see prompt.md, "How to use this document").

import type { SportsEventKind } from './events';
import type { GenreId } from './genres';
import type { Medium, RegionId } from './world';

// --- Time ---

/** Real-time milliseconds per in-game day at 1× speed: 16 seconds since 0.16.0 (it was 4), so 1970 to 2030 takes about 97 hours. */
export const MS_PER_DAY = 16_000;

/**
 * How long a day lasted when the town and the street were laid out (0.16.0:
 * it was 4 seconds then). The buses, the taxis and the walks to the door keep
 * the pace in real seconds that they had, whatever a day lasts now: their
 * durations are written in hours of that clock (see `townHours` in office/traffic.ts).
 */
export const TOWN_MS_PER_DAY = 4_000;

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

/** What Uncle Tabby puts up for a new company, by the difficulty chosen. */
export const STARTING_MONEY: Record<Difficulty, number> = { easy: 250_000, normal: 150_000, hard: 125_000 };
/**
 * What things cost, by the difficulty: rent, salaries, license prices and fees,
 * and titles and sports rights on the content market are multiplied by this.
 */
export const DIFFICULTY_COSTS: Record<Difficulty, number> = { easy: 0.75, normal: 1, hard: 1.05 };
/**
 * The region the company's headquarters are in: people there know the name, so
 * a channel that starts broadcasting there begins with some reputation (0–1)
 * instead of none. Rivals start a channel at RIVAL_START_REPUTATION.
 */
export const HOME_REGION = { startReputation: 0.15 };
export const RENT_PER_TILE = 30;
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
 * pays the base price. A TV license costs eight times as much as one for radio, and four times as much a month.
 */
export const LICENSE: Record<Medium, { basePrice: number; baseMonthly: number; minPrice: number; minMonthly: number }> = {
  radio: { basePrice: 20_000, baseMonthly: 2_000, minPrice: 5_000, minMonthly: 500 },
  tv: { basePrice: 160_000, baseMonthly: 8_000, minPrice: 40_000, minMonthly: 2_150 },
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
  capital: [1970, 1970, 1972, 1974, 1979, 1987, 1996],
  north: [1970, 1971, 1972, 1977, 1990],
  coast: [1970, 1971, 1973, 1981, 1999],
  heartland: [1970, 1972, 1976, 1993],
  highlands: [1970, 1972, 1979],
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
/** Writers in the hiring pool each month (0.14.0): drawn after everyone else, so the rest of a seeded pool stays as it was. */
export const WRITER_CANDIDATES = 3;
/**
 * Writers (0.14.0). A writer works on up to `showsEach` shows. A show the
 * writers lead (a sitcom, reality TV) takes their work where a host's skill
 * would count; on a show they only help, writing as good as it gets adds `bonus`.
 */
export const WRITERS = { showsEach: 2, bonus: 0.1 };
/** Video editors in the hiring pool each month (0.14.0), drawn with the writers. */
export const EDITOR_CANDIDATES = 3;
/** Video editors (0.14.0): one edits up to `showsEach` produced TV shows, and the best editing makes a show `bonus` better. */
export const EDITORS = { showsEach: 2, bonus: 0.1 };
/** Audio engineers, cooks and post room clerks in the hiring pool each month (0.15.0), drawn after the editors. */
export const ENGINEER_CANDIDATES = 2;
export const COOK_CANDIDATES = 2;
export const CLERK_CANDIDATES = 2;
/** Talent managers in the hiring pool each month (0.18.0), drawn after the clerks. */
export const TALENT_MANAGER_CANDIDATES = 1;
/** Recruiters in the hiring pool each month (0.17.0), drawn after the talent managers. */
export const RECRUITER_CANDIDATES = 2;
/**
 * Recruiters (0.17.0), at a workstation in an office. Each one at a desk
 * brings `extraEach` more candidates into the monthly pool (fewer for a weak
 * or unhappy one, as cooks and clerks work), up to `max` recruiters; each
 * extra candidate's skill is drawn twice and the better draw kept. On day
 * `replaceDays` of a host's notice a recruiter finds someone in their place:
 * a host of the same medium and specialties, within `skillSpread` of their skill.
 */
export const RECRUITING = { extraEach: 4, max: 2, replaceDays: 7, skillSpread: 10 };
/** Lawyers in the hiring pool each month (0.19.0), drawn last of all. */
export const LAWYER_CANDIDATES = 2;
/** Call agents in the hiring pool each month (0.20.0), drawn after the lawyers. */
export const CALL_AGENT_CANDIDATES = 2;
/** Journalists in the hiring pool each month (0.20.0), drawn after the call agents. */
export const JOURNALIST_CANDIDATES = 2;
/**
 * Lawsuits (0.19.0). Each month a show on the air in a genre that can be sued (`lawsuitSource` in config/genres.ts)
 * is sued with chance `chance` of its source, times `tone` for how bold it is. A case is heard `courtDays` after it
 * is filed. The claim is `perRegion` for every region the channel reaches, in 1970 money, rising by `growth` a year.
 * Lost, the company pays the claim, `costs` of it more in legal costs, and the channel loses `reputation`;
 * won, only the legal costs. `loss` is the chance of losing, less `lawyerCut` for each lawyer at a desk (up to
 * `lawyers` of them count; a weak or unhappy one cuts less), and never below `minLoss`. Before the court day
 * the company can settle for `settle` of the claim: `alone` without a lawyer, `lawyer` with one.
 * A show's `appeal` multiplier comes with its tone, in the genres that can be sued.
 */
export const LEGAL = {
  chance: { libel: 0.015, injury: 0.02 },
  tone: { careful: 0.5, normal: 1, bold: 2.5 },
  appeal: { careful: 0.95, normal: 1, bold: 1.08 },
  perRegion: { libel: 15_000, injury: 25_000 },
  growth: 0.03,
  courtDays: 60,
  loss: 0.6,
  lawyerCut: 0.15,
  lawyers: 2,
  minLoss: 0.1,
  costs: 0.1,
  reputation: 0.03,
  settle: { alone: 0.5, lawyer: 0.35 },
};
/**
 * The broadcasting authority (0.19.0). Three rules: no film for adults (`adultShare` of the films on the market)
 * outside the late-night slot, no more than `teleshoppingSlots` slots of teleshopping a day on a channel, and news in
 * `newsShare` of the slots a license has aired this term. A breach of the first two opens a complaint the same day;
 * the news rule is checked every 1 January. A complaint is decided `decideDays` later, and is upheld with
 * `upheld`, less LEGAL.lawyerCut for each lawyer at a desk (never below LEGAL.minLoss). The fine is `fine.min`
 * or `fine.adDays` days of the channel's ad income, whichever is more, doubled for a repeat of the rule within
 * `repeatDays`. At renewal the holder's advantage falls by `upheldCut` for each upheld complaint this term, and
 * by `newsCut` if the news share was missed; never below nothing.
 */
export const REGULATOR = {
  adultShare: 0.3,
  teleshoppingSlots: 1,
  newsShare: 0.2,
  decideDays: 14,
  upheld: 0.9,
  fine: { min: 5_000, adDays: 10 },
  repeatDays: 365,
  upheldCut: 0.05,
  newsCut: 0.1,
  /** A license must have aired this many slots in the term before its news share is judged. */
  newsMinSlots: 150,
  /** Decided complaints are kept in the books this long. */
  keepDays: 365,
};
/**
 * Audio engineers (0.15.0). Each looks after `showsEach` produced radio
 * shows, those with the most listeners first; the best engineering makes a
 * show lose `slower` less of its freshness each day it airs.
 */
export const ENGINEERS = { showsEach: 3, slower: 0.5 };
/** Music schedulers in the hiring pool each month (0.18.0), drawn after the recruiters. */
export const SCHEDULER_CANDIDATES = 2;
/** Guards in the hiring pool each month (0.18.0), drawn after the music schedulers. */
export const GUARD_CANDIDATES = 2;
/**
 * Music schedulers (0.18.0). Each looks after `channelsEach` radio channels that specialise in music, the one
 * with the most listeners first; the best scheduling makes that channel's music shows `bonus` more appealing.
 */
export const SCHEDULERS = { channelsEach: 1, bonus: 0.05 };
/**
 * A dressing room (0.14.0): every make-up table there gets `hostsPerTable`
 * TV hosts ready, and a host who is made up makes their show `bonus` better.
 */
export const DRESSING = { hostsPerTable: 2, bonus: 0.05 };
/**
 * The talent programme (0.14.0): a year away for a host of at most `maxSkill`,
 * for `salaryMonths` of their salary, in which they present nothing; they come
 * back `skillGain` points better. A talent manager at their desk in a workshop
 * arranges it (a channel manager did until 0.18.0), one host at a time.
 */
export const TALENT = { days: 365, maxSkill: 40, salaryMonths: 6, skillGain: { min: 20, max: 30 } };
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
  writer: { min: 900, max: 2_700 },
  editor: { min: 900, max: 2_700 },
  engineer: { min: 900, max: 2_500 },
  scheduler: { min: 900, max: 2_500 },
  cook: { min: 700, max: 1_600 },
  clerk: { min: 500, max: 1_100 },
  guard: { min: 500, max: 1_000 },
  talentManager: { min: 1_800, max: 3_200 },
  recruiter: { min: 1_000, max: 2_600 },
  lawyer: { min: 1_800, max: 4_000 },
  callAgent: { min: 400, max: 800 },
  journalist: { min: 900, max: 2_500 },
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

/**
 * A course in the house (0.18.0): with a talent manager at the trainer's desk
 * of a workshop that has all it needs, they arrange it instead of the head of
 * the department. It costs `salaryMonths` (the stand-in; there is no course
 * fee), and as many go at once as there are training seats, `seatsPerPiece`
 * to a seat, from any job. Whoever finds every seat taken can still go outside.
 */
export const WORKSHOP = { salaryMonths: 1, seatsPerPiece: 1 };

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

/**
 * A show sold to a rival channel (0.20.0, #148): it airs in one of their slots and you get `share` of the ad money the slot
 * earns, each day. Ending the deal early costs the money still to come, times `buyOut`.
 */
export const SHOW_SALES = {
  share: 0.4,
  months: 12,
  buyOut: 1.25,
};

/** A studio let to a tenant (0.20.0, #148): `rentTimes` its rent a month, for `months`; ending it early costs the rent still to come, times `buyOut`. At most `max` at once. */
export const STUDIO_LETS = {
  rentTimes: { radio: 2, tv: 3 } as Record<'radio' | 'tv', number>,
  months: 12,
  buyOut: 1.25,
  max: 2,
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

/** Social media accounts (0.18.0, #22): slow, cheap and lasting, next to the campaigns. */
export const SOCIAL = {
  /** Highest promotion a full following adds (it shares the MARKETING.maxPromotion cap with campaigns). */
  maxPromotion: 0.2,
  /** Weekly fee for one account, the same on every difficulty. */
  weeklyCost: 1_000,
  /** Daily rate at which the following moves towards what the marketer can build, and fades without one. */
  buildRate: 0.01,
  fadeRate: 0.005,
  /** How far a following reaches each audience. */
  reach: { teens: 1, students: 1, professionals: 0.6, workers: 0.5, families: 0.5, seniors: 0.2 },
};

// --- Content market (licensed TV titles) and sports rights ---

export const CONTENT = {
  /** New titles on the market each month, per genre. */
  titlesPerMonth: { movies: 10, series: 8, documentary: 5, musicVideos: 4, teleshopping: 2, cartoons: 4 } as Partial<Record<GenreId, number>>,
  /** Airings included in a title. */
  airings: {
    movies: [10, 20],
    series: [24, 52],
    documentary: [8, 16],
    musicVideos: [20, 40],
    teleshopping: [20, 40],
    cartoons: [26, 52],
  } as Partial<Record<GenreId, readonly [number, number]>>,
  /**
   * Price per airing at quality 1; scales with quality^1.5. A title is paid an
   * airing at a time, on the days it airs.
   */
  pricePerAiring: { movies: 1_250, series: 600, documentary: 400, musicVideos: 300, teleshopping: 0, cartoons: 350 } as Partial<Record<GenreId, number>>,
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

// --- The streaming service (0.18.0; sim/streaming.ts) ---

/** A service of streaming that a rival opens on 1 January of a fixed year, like the calendar of the world. */
export interface RivalService {
  name: string;
  /** The headline on the day it opens. */
  news: string;
  opens: number;
  /** Its appeal against yours (see `streamingAppeal`) in the year it opens… */
  appeal: number;
  /** …and what it gains every year after that. */
  growth: number;
}

export const STREAMING = {
  /** What it takes to open a service: server racks in the libraries, and shows and titles to offer. */
  minRacks: 2,
  minCatalogue: 10,
  /** Subscribers one server rack serves, by its tier (it holds its titles as well). */
  subscribersPerRack: [2_500, 8_000] as readonly number[],
  /** The monthly price, in euros, that the player sets, in steps of `step`; a new service starts at `start`. */
  price: { min: 2, max: 20, start: 8, step: 0.5 },
  /** The price people find fair: `base` in `fromYear`, and `perYear` more every year after. */
  fairPrice: { base: 8, fromYear: 2012, perYear: 0.2 },
  /** Every euro above the fair price takes this share off the service's appeal (down to `floor`); every euro below adds this much. */
  dearer: 0.12,
  cheaper: 0.05,
  floor: 0.05,
  /** The share of the people in the country who pay for streaming at all: from the first year to the last, evenly, and the last after that. */
  market: { from: { year: 2012, share: 0.0008 }, to: { year: 2030, share: 0.0045 } },
  /** A catalogue's size counts in full up to this many shows and titles; beyond it, each one adds `beyond` as much, up to `maxSize` in all. */
  fullCatalogue: 60,
  beyond: 0.25,
  maxSize: 1.5,
  /** The appeal of not paying for any service, against which the services share their market (like BASELINE_APPEAL for a slot). */
  baseline: 0.2,
  /** Subscribers move this share of the way to the target each day. */
  drift: 0.05,
  /** What a subscriber costs a month: servers, traffic, support. */
  costPerSubscriber: 0.6,
  /** A title on the service costs its price for one airing every month (the airing is not used up). */
  titleMonths: 1,
  /**
   * Your own TV channels lose viewers to your service: this many times the share of the country's people who
   * subscribe to it (6 is 0.6% of the viewers for every one in a thousand people). Few people pay for streaming
   * (`market`), but they are the ones who watched most.
   */
  takesFromTv: 6,
  /** The service's subscribers are full when the racks are; the warning comes again only once there is this much room. */
  roomAgain: 0.9,
  rivals: [
    { name: 'EPB+', news: 'EPB opens EPB+: the public broadcaster’s programmes on demand, for a monthly price.', opens: 2014, appeal: 0.25, growth: 0 },
    { name: 'Nimbus', news: 'Nimbus, the streaming giant from abroad, comes to Etheria with films and series from all over the world.', opens: 2017, appeal: 0.35, growth: 0.03 },
  ] as readonly RivalService[],
};

// --- R&D and equipment tiers (techs are in config/tech.ts) ---

export const RESEARCH = {
  /** A tech can be researched this many years before its historical year… */
  maxYearsEarly: 5,
  /** …at cost × (1 + earlyCostPerYear × years early). */
  earlyCostPerYear: 0.3,
  /** Opening the 1980s, to research a tech of the decade before its years: this many points… */
  decadeCost: 500,
  /** …and each decade after costs this many times the one before. */
  decadeCostGrowth: 2,
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
 * Control rooms. A radio studio whose mixing desk stands in a control room next
 * door works a little better: the sound and the light of the control room stay
 * out of the show. A TV studio has a control room of its own (0.16.0), where a
 * technician works the control desk and the audio mixer while its shows are on
 * the schedule: that takes `crew` of a technician's day, which is then not
 * spent on repairs. A studio nobody runs the desks of works at `unmanned` of
 * its level.
 */
export const CONTROL_ROOM = {
  /** Multiplier on a radio studio's level. */
  studioLevel: 1.05,
  /** Share of a technician's day that one control room in use takes. */
  crew: 0.5,
  /** A TV studio's level while nobody works its control room. */
  unmanned: 0.75,
};

/**
 * The master control room (0.16.0). Every channel goes out through it, with a
 * technician at its desk for `crew` of their day.
 */
export const MASTER_CONTROL = { crew: 0.5 };

/**
 * Days a game from before 0.16.0 gets to put right what the new rules ask for:
 * a CEO's office and a reception desk before anything goes on the air, a
 * master control room for every channel, a control room for every TV studio.
 * A big game needs a quarter: it has to build the rooms before it can lay
 * them out (#110). The post room of 0.17.0 shares the days.
 */
export const GRACE = { days: 90 };

/** A channel or a show that has been off the air for `days` days in a row gets a warning, once, until it is back (0.16.0). */
export const OFF_AIR_WARNING = { days: 7 };

/**
 * What the pieces for an office do (0.16.0); one piece of a kind counts per
 * room. A production calendar makes the production staff in its office get
 * `calendar` more done and a sales chart the sales staff `salesChart`; a
 * printer in any office takes `printer` off the cost of every campaign; a bin
 * slows the dirt of its room by `bin` and a dishwasher a canteen's by
 * `dishwasher`; a flip chart in a meeting room makes its meetings lift morale
 * `flipChart` more; a recording booth makes the shows of its room's audio
 * engineer `recordingBooth` better; record shelves in a radio studio make the
 * music shows made there `recordShelves` better (0.18.0).
 */
export const DECOR = { calendar: 0.05, salesChart: 0.05, printer: 0.1, bin: 0.2, dishwasher: 0.5, flipChart: 0.25, recordingBooth: 0.05, recordShelves: 0.05 };

/**
 * Music royalties (0.18.0): a radio show that plays records pays `share` of
 * what each of its slots earns, sponsor money included, every day, times the
 * difficulty's cost factor. The genres that pay are `genres`; the morning show
 * is mostly talk, and music videos on TV pay for their music in their price.
 * At 6% the sensible test player's first January ran €154 short of its costs,
 * and Penny's "Into the black" slipped to March (version010.test.ts): 4% kept it,
 * and Mike asked for it lower still. Merged with the streaming service, 3% still
 * tipped the Capital radio guard (phase5a.test.ts, seed 1, ten years): each
 * point of share is about €30k there, so it is 1.5%.
 */
export const ROYALTIES = { share: 0.015, genres: ['top40', 'rock', 'classical'] as readonly string[] };

/**
 * Phone lines (0.20.0). Call agents at call desks in a call centre each answer `each` calls a day (× SUPPORT,
 * like a clerk). Listeners phone in to the radio shows of `callInGenres`, `callIn` calls a day each; a show whose
 * calls are answered is `callInBonus` times as appealing (in proportion to the share answered). These are free,
 * and need no research. With "Premium-rate lines" (premiumLines) viewers of a game show or reality show vote:
 * `share` of the viewers call, each call paying `price`. Calls are taken in that order: call-ins, votes, mail.
 * Only the votes answered pay. A day on which more than `overload` of the votes go unanswered, the authority may
 * get a complaint of the rule "votes", with chance `scandalChance`. Mail orders: the agents left over take
 * orders for the merchandise, which sells `lift` more for every `each` calls of spare capacity, up to `max`.
 */
export const CALLS = { each: 300, callIn: 100, callInBonus: 1.08, callInGenres: ['talk', 'sportsCommentary', 'morningShow'] as readonly GenreId[] };
export const VOTES = { share: 0.002, price: 0.5, overload: 0.5, scandalChance: 0.02, genres: ['gameShow', 'reality'] as readonly GenreId[] };
export const MAIL = { lift: 0.05, max: 0.25 };

/**
 * News vans (0.20.0). A van costs `price` once and is sent out on a shift: the day (the morning, lunch and afternoon
 * slots, by index in SLOTS) or the evening (the evening and late-night slots). With a journalist at a desk to crew it,
 * it goes out on every day it has something to report, and each radio and TV news show on the air in its shift
 * is `lift` times as appealing (`uplinkLift` with "Satellite uplink": the dish sends live), scaled by the
 * journalist's skill and morale as call agents are (at most `maxCrew`). Sports shows gain only on a day with a
 * sports event on, or in an election campaign. Each trip costs `trip`, paid on days the van goes out.
 */
export const NEWS_VAN = {
  price: 30_000,
  trip: 250,
  lift: 1.1,
  uplinkLift: 1.15,
  maxCrew: 1.25,
  shifts: { day: [0, 1, 2], evening: [3, 4] } as Readonly<Record<'day' | 'evening', readonly number[]>>,
  newsGenres: ['news', 'tvNews'] as readonly GenreId[],
  sportsGenres: ['sportsCommentary', 'tvSports'] as readonly GenreId[],
};

/**
 * Merchandise (0.20.0): a licensing deal run by Sales. A show the station makes
 * itself earns a share of what its slot earned, on top of it, times how well
 * made it is and how many fans it has; it is paid only while a sales employee
 * sits at a desk. Every TV show sells tapes and every radio show shirts, mugs
 * and bags; kids shows (toys) and sitcoms sell more. A bought title sells
 * nothing: the rights are not yours. Not scaled by difficulty, as ad income is not.
 */
export const MERCH = {
  /** Of a slot's revenue, at full fans and quality 1: by genre, else by medium. */
  share: { kids: 0.2, sitcom: 0.12, soap: 0.08 } as Readonly<Record<string, number>>,
  mediumShare: { tv: 0.05, radio: 0.04 } as Readonly<Record<string, number>>,
  /** Nothing sells below this quality; from there the share rises evenly to full at 1. */
  minQuality: 0.4,
  /** A day on air moves the fans this part of the way to the quality; a day off air loses `fade`. */
  grow: 1 / 120,
  fade: 1 / 240,
  /** Fans an award brings the show. */
  awardFans: { nomination: 0.1, win: 0.25 },
};

/**
 * Records in the library (0.18.0): a music show needs a collection of its
 * genre's records on the shelves, bought once from the record market on the
 * Content screen. A collection takes `libraryUnits` places, one shelf, and
 * never runs out. There is no starter collection: the first station builds a
 * library too.
 */
export const RECORDS = { libraryUnits: 20, price: { top40: 6_000, rock: 6_000, classical: 8_000 } as Record<string, number> };

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
  /** Gained when a clean canteen serves everyone (40 before 0.15.0: the cook, meetings and the post make up the rest). */
  canteenBonus: 20,
  /** Share of the gap to the target closed each day. */
  rate: 0.05,
  /** Work and show quality at morale 0, and at morale 100. */
  minFactor: 0.8,
  maxFactor: 1.1,
};

/**
 * A cook (0.15.0) works at a stove in a canteen that has all it needs, and
 * cooks hot meals for `mealsEach` staff a day (× SUPPORT: skill 50 cooks
 * exactly that many). Everyone the canteen serves a hot meal gains `morale`.
 */
export const COOKS = { mealsEach: 30, morale: 8 };

/**
 * A post room (0.15.0): a clerk at a sorting case there sorts the post of
 * `staffEach` staff (× SUPPORT). Letters lift the morale of everyone whose
 * post is sorted by `morale`, and while fan mail reaches the hosts their fame
 * grows `fameGrowth` times as fast.
 */
export const POST = { staffEach: 40, morale: 4, fameGrowth: 1.5 };

/**
 * Fans (0.18.0). A host of fame `minFame` or more is a target. A guard at a
 * security desk looks after `hostsEach` targets (× SUPPORT), the most famous
 * first. A target nobody looks after has `penalty` less morale to aim for, and
 * each day a fan gets in with chance `incidentChance`, which costs the host
 * `incidentMorale` morale at once.
 */
export const SECURITY = { minFame: 50, hostsEach: 4, penalty: 6, incidentChance: 0.01, incidentMorale: 15 };

/**
 * Team meetings in a meeting room (0.15.0). A manager calls one for their
 * department, a channel manager for the production staff of their channel
 * (0.17.0; the hosts have none since). It lifts the team's morale by
 * `morale` for `lasts` days, in part when the room has fewer seats than the
 * team has people (see SEATS_PER_MEETING_TABLE); while it sits, the team gets
 * `workOnTheDay` of its work done that day. A team meets once every `every`
 * days at most, and a meeting room holds one meeting a day.
 */
export const MEETINGS = { morale: 8, lasts: 30, every: 30, workOnTheDay: 0.5 };

/**
 * Strikes (0.15.0). A team whose average morale stays under `below` for
 * `warnAfter` days threatens to strike; if it is still under `below`
 * `strikeAfter` days later, it walks out for `days` days. Morale back at
 * `recover` or more calls it off. Paying a bonus of `bonusMonths` of each
 * striker's salary ends a strike at once. Either way a strike that ends
 * leaves the team `moraleAfter` points happier: they were heard.
 */
export const STRIKES = { below: 35, recover: 40, warnAfter: 14, strikeAfter: 14, days: 7, bonusMonths: 0.5, moraleAfter: 15 };

/**
 * What staff say (0.20.0, #154): a part of someone's morale counts as a thought
 * from `threshold` points either way; `max` thoughts show at most; with nothing
 * else to say, morale from `happy` up or under `unhappy` is said on its own.
 */
export const THOUGHTS = { threshold: 5, max: 3, happy: 70, unhappy: 45 };

// --- Age, leave, sickness, retirement and death (0.20.0, #174) ---

/**
 * The life of your people. Staff are 18 to 26 when they come in the first two
 * game years, up to 55 after (mostly young). Between `leave.from` and
 * `leave.to` a person has `leave.children` children on average: a mother is away
 * `leave.womanDays` (16 weeks, paid by the state, so not by you), a father
 * `leave.manDays` (2 weeks), told `leave.womanNotice` and `leave.manNotice` days
 * ahead. Sickness comes `sick.perYear` times a year at neutral morale, `sick.lowMorale` times
 * as often from the morale of a strike (STRIKES.below) down, `sick.older` times
 * as often from `sick.olderFrom`; a spell lasts `sick.days`, one in `sick.longOneIn` lasts `sick.longDays`.
 * They retire at `retireAt`, told `retireNotice` days ahead. The yearly chance of dying is `death`
 * from the age on the left. A temp works at TRAINING.standIn of the skill of
 * the one they replace and costs `temp.agency` times their salary.
 */
export const LIFE = {
  startAges: { min: 18, max: 26 },
  /** The oldest anyone in the pool is after `youngYears` game years. */
  laterMaxAge: 55,
  youngYears: 2,
  leave: { from: 25, to: 35, children: 1.5, womanDays: 112, manDays: 14, womanNotice: 60, manNotice: 14 },
  sick: { perYear: 1, lowMorale: 2, older: 1.5, olderFrom: 55, days: { min: 2, max: 10 }, longOneIn: 20, longDays: { min: 30, max: 90 } },
  retireAt: 65,
  retireNotice: 60,
  death: [
    { from: 0, perYear: 0.0005 },
    { from: 40, perYear: 0.0015 },
    { from: 55, perYear: 0.005 },
  ],
  temp: { agency: 1.25 },
  /** A host this famous (or more) who dies makes the news. */
  famousHost: 40,
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

/** Company level (config/levels.ts) at which each floor above the ground floor becomes available to build on. */
export const FLOOR_LEVEL: Record<number, number> = { 2: 4, 3: 6, 4: 8, 5: 10, 6: 12 };

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
/** A studio audience lifts the quality of these shows by `perBlock` for each block of audience seating in their studio, up to `maxBlocks` (0.13.0). */
export const STUDIO_AUDIENCE = { genres: ['sitcom', 'kids', 'gameShow'] as readonly GenreId[], perBlock: 0.05, maxBlocks: 2 };

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

/**
 * Breaking news (0.20.0, #21): a story that breaks on a few days a year, and at some moments of the elections and sports
 * events. A major story runs `majorDays` days and lifts every news show (the player's, the rivals' and the ones sold)
 * by `majorLift`, a minor one `minorDays` and `minorLift`. A news show with a crewed van gets `vanLift` more (scaled by
 * the crew, as the van's own lift is). The player can break in on a channel once per story, into one slot that is not a
 * news show: the slot is `breakInLift` times as appealing (`breakInVanLift` more with a crewed van in its shift), keeps
 * `adsKept` of its ads, counts as a day missed for its sponsor and, afterwards, lifts the channel's reputation.
 * A random story comes on a day with chance `chance`, at least `gapDays` after the last one.
 */
export const BREAKING = {
  chance: 1 / 60,
  gapDays: 20,
  majorDays: 3,
  minorDays: 2,
  majorLift: 1.4,
  minorLift: 1.15,
  vanLift: 1.25,
  breakInLift: { major: 1.3, minor: 1.1 },
  breakInVanLift: 1.15,
  adsKept: 0.6,
  reputation: { major: 0.02, minor: 0.01 },
  /** Stories are kept this many days after they end, for the paper and the wiki. */
  keepDays: 60,
  /** A drama in a World Cup or the Olympics breaks this many days after it starts. */
  sportsDramaDay: 8,
};

// --- The player's own events ---

export type OwnEventKind = 'concert' | 'gala' | 'telethon';

/**
 * Events the player stages on a channel. Cost and prestige are per region the
 * channel broadcasts in; reputation (0–1) and the host's fame (0–100) get a
 * one-off lift that fades again as they drift back to what the channel earns.
 */
/**
 * What prestige does: hosts would rather work for a company people talk about.
 * Rivals court your hosts less often, and hosts in the hiring pool ask less.
 * Both grow in proportion with prestige, to their full size at `full`.
 */
export const PRESTIGE = { full: 200, poachCut: 0.6, hostDiscount: 0.1 };

export const OWN_EVENTS: Record<OwnEventKind, { name: string; costPerRegion: number; reputation: number; fame: number; prestigePerRegion: number }> = {
  concert: { name: 'Concert', costPerRegion: 30_000, reputation: 0.05, fame: 5, prestigePerRegion: 1 },
  gala: { name: 'Gala', costPerRegion: 100_000, reputation: 0.1, fame: 10, prestigePerRegion: 4 },
  telethon: { name: 'Telethon', costPerRegion: 300_000, reputation: 0.18, fame: 18, prestigePerRegion: 15 },
};
/** A channel can stage one event per this many days, and an event can't lift reputation above the cap. */
export const OWN_EVENT_LIMITS = { cooldownDays: 365, maxReputation: 1.5 };

// --- Theme weeks (0.20.0) ---

export type ThemeWeekKind = 'hitList' | 'game' | 'special';

/**
 * A radio channel books a theme week: for seven days (Monday to Sunday) the shows it names draw `lift` times the
 * listeners, and the channel's reputation in each region goes up by `reputation`, then drifts back as usual.
 * The cost is per region, as for events. A channel gets `perYear` theme weeks a calendar year, booked up to
 * `monthsAhead` months ahead; the rivals' radio channels run as many, announced `noticeDays` ahead.
 */
export const THEME_WEEKS: Record<ThemeWeekKind, { name: string; lift: number; costPerRegion: number; reputation: number; shows: string }> = {
  hitList: { name: 'Hit list', lift: 1.25, costPerRegion: 8_000, reputation: 0.03, shows: 'Music shows' },
  game: { name: 'Listener game', lift: 1.15, costPerRegion: 12_000, reputation: 0.02, shows: 'every show' },
  special: { name: 'Event special', lift: 1.3, costPerRegion: 10_000, reputation: 0.03, shows: 'News & Talk shows in an election campaign, Sports shows in a World Cup or Olympics' },
};
export const THEME_WEEK_LIMITS = { perYear: 2, monthsAhead: 12, days: 7, noticeDays: 7 };

// --- Radio and TV awards (0.18.0) ---

/**
 * Every `everyYears` from `firstYear` the country holds a radio and TV awards
 * night: the nominations come out on the 1st of `nominationMonth`, the
 * winners on the 1st of `nightMonth`. Four awards (best show and best host,
 * of radio and of TV), with `nominees` up for each. A show's score is its
 * average audience over the weekly reports × (`qualityBase` + quality); a
 * host's is their best show's × (`fameBase` + fame / 100). On the night the
 * jury's taste multiplies each score by 1 ± up to `luck`.
 *
 * A nomination of the player's brings prestige, and the host fame; a win
 * brings more, `reputation` (0–1) in every region of the channel, and a
 * `morale` lift for whoever made it. A host who wins asks for the going rate
 * at their new fame: turned down, or left unanswered for `answerDays`, their
 * morale drops by `refusedMorale`. A rival's host gains the same fame.
 */
export const AWARDS = {
  firstYear: 1975,
  everyYears: 5,
  nominationMonth: 10,
  nightMonth: 11,
  nominees: 4,
  qualityBase: 0.5,
  fameBase: 0.5,
  luck: 0.15,
  prestige: { nomination: 5, win: 20 },
  fame: { nomination: 5, win: 15 },
  reputation: 0.05,
  morale: 15,
  answerDays: 14,
  refusedMorale: 40,
};

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
  /** A host who goes works out this many days first, presenting as before (0.14.0). */
  noticeDays: 30,
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
  /** What Uncle Tabby sends for a level (XP.levelPay) is multiplied by this. */
  rewardScale: { easy: 1.5, normal: 1, hard: 0.5 } as Record<Difficulty, number>,
};

// --- Company levels (0.20.0; the levels are in config/levels.ts) ---

export const COMPANY_XP = {
  /** Company XP in total at which levels 1 to 10 are reached (index 0 is level 1). */
  totals: [30, 40, 70, 110, 170, 250, 350, 480, 640, 850] as readonly number[],
  /** Past level 10 each step is this much bigger than the one before. */
  growth: 1.25,
  /** XP for a month that ends in the black (after the first profit, which is a milestone of its own). */
  blackMonth: 5,
  /** XP for each award the company wins. */
  award: 20,
  /** One XP for each this much paid out in dividends. */
  perDividend: 100_000,
  /** What Uncle Tabby sends for reaching a level is this times the level, on normal. */
  levelPay: 20_000,
};

// --- History ---

export const MAX_HEADLINES = 12;
/** The e-mails the inbox keeps (0.17.0): the newest, which is years of play. */
export const MAX_MESSAGES = 300;
export const MAX_WEEKLY_REPORTS = 12;
