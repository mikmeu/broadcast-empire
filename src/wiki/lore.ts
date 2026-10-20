// The wiki's articles about the country the game is set in. The facts are the
// designer's (lore.md); the figures are the game's own.

import { RADIO_LICENSE_SLOTS, STARTING_MONEY } from '../config/balance';
import { OFFER, WELCOME } from '../config/guide';
import { SPONSOR_NAMES } from '../config/names';
import { PERSONALITIES } from '../config/rivals';
import { AUDIENCES, COUNTRY, REGIONS, type RegionId } from '../config/world';
import { getGenre } from '../config/genres';
import { licenseMonthly, licensePrice, licenseSlots, LIST_PRICES } from '../sim/licenses';
import { SITES } from '../office/sites';
import { relationOf, sponsorRate } from '../sim/sales';
import { count, euro, list, percent, type ArticleId, type ArticleText, type Block, type Section } from './types';

const audienceNames = (id: RegionId) => REGIONS.find((r) => r.id === id)!.mainAudiences.map((a) => AUDIENCES.find((x) => x.id === a)!.name);
const audiencesOf = (id: RegionId) => list(audienceNames(id).map((n) => n.toLowerCase()));
const regionName = (id: RegionId) => REGIONS.find((r) => r.id === id)!.name;

/** The senate's seats by region, from lore.md: 136 in all. */
export const SENATE_SEATS: Record<RegionId, number> = { capital: 50, north: 36, coast: 24, heartland: 16, highlands: 10 };
const SENATE_TOTAL = Object.values(SENATE_SEATS).reduce((sum, seats) => sum + seats, 0);

/** Each region's capital, where its governor and its house of representatives sit. Lore.md names none but Coax City; the rest are the game's. */
export const REGION_CAPITALS: Record<RegionId, string> = { capital: 'Coax City', north: 'Bell', coast: 'Maxwell', heartland: 'Newcast', highlands: 'Stroedel' };

/** Each region's football club in the National Football League and basketball team in the Basketball League (config/names.ts). */
export const REGION_TEAMS: Record<RegionId, { football: string; basketball: string }> = {
  capital: { football: 'Coax City FC', basketball: 'Turing Towers' },
  highlands: { football: 'Stroedel Miners', basketball: 'Nipkow Locomotives' },
  north: { football: 'Bell United', basketball: 'TTU Circuits' },
  coast: { football: 'Maxwell Mariners', basketball: 'Skywave Sharks' },
  heartland: { football: 'Newcast Athletic', basketball: 'Bigdata Alpacas' },
};

/** The box beside a region's article. */
function regionFacts(id: RegionId, divisions: readonly [string, string], places: string): readonly (readonly [string, string])[] {
  const region = REGIONS.find((r) => r.id === id)!;
  return [
    ['People in 1970', count(region.population1970)],
    ['Grows by', `${(region.growth * 100).toFixed(1)}% a year`],
    ['Main audiences', audienceNames(id).join(', ')],
    ['Capital', REGION_CAPITALS[id]],
    divisions,
    ['Places', places],
    ['Seats in the senate', `${SENATE_SEATS[id]} of ${SENATE_TOTAL}`],
    ['Radio license', `${euro(licensePrice('radio', id, LIST_PRICES))}, then ${euro(licenseMonthly('radio', id, LIST_PRICES))} a month`],
    ['Radio licenses', `${licenseSlots('radio', id, 0)} in 1970`],
  ];
}

const epb = PERSONALITIES.highbrow;

/** Each sponsor's article and its trade, by the name its offers carry (SPONSOR_NAMES). */
const SPONSORS = {
  Beerstar: ['beerstar', 'Beer, or nearly'],
  Citrus: ['citrus', 'Soft drinks'],
  Foodst: ['foodst', 'Restaurants'],
  'Ipsum & Ipsum': ['ipsum-ipsum', 'Law'],
  Jupiter: ['jupiter', 'Telephone and internet'],
  Manen: ['manen', 'Not known'],
  'Moon Capital': ['moon-capital', 'Investment'],
  Tahoma: ['tahoma', 'Clothing'],
} as const satisfies Record<string, readonly [ArticleId, string]>;
type SponsorName = keyof typeof SPONSORS;

export const SPONSOR_PAGES = Object.fromEntries(Object.entries(SPONSORS).map(([name, [id]]) => [name, id])) as Record<SponsorName, ArticleId>;

/** How well the company in the open game knows a sponsor, from its relations and contracts. */
export function sponsorRelation(name: string): Block {
  return {
    asOf: (_day, game) => {
      if (game === null) return ['Open a game to see how well you know them.'];
      if (game.relations[name] === undefined) return [`You have not worked with ${name} yet. A first contract starts at level 1, which pays ${percent(sponsorRate(1) - 1)} over the normal ad rate.`];
      const { level } = relationOf(game, name);
      const busy = game.contracts.some((c) => c.sponsor === name);
      return [`**Level ${level}:** ${name} pays ${percent(sponsorRate(level) - 1)} over the normal ad rate. ${busy ? 'Under contract now.' : 'No contract now.'}`];
    },
  };
}

/** A sponsor's article: its trade in the box of facts, what the lore says, its boss in their own words, and how well you know it. */
function sponsorArticle(
  name: SponsorName,
  text: { summary: string; facts: readonly (readonly [string, string])[]; lead: readonly Block[]; more?: readonly Section[]; quote?: readonly [string, string]; seeAlso?: readonly ArticleId[] },
): ArticleText {
  return {
    title: name,
    category: 'lore',
    summary: text.summary,
    facts: [['Trade', SPONSORS[name][1]], ...text.facts],
    sections: [
      { body: text.lead },
      ...(text.more ?? []),
      ...(text.quote ? [{ heading: 'In their own words', body: [`“${text.quote[0]}”`, `— ${text.quote[1]}`] }] : []),
      {
        heading: `Your company and ${name}`,
        body: ['Your sales staff get to know a sponsor while a contract with it runs, and a sponsor you know better pays more ([[sponsors]]).', sponsorRelation(name)],
      },
    ],
    seeAlso: [...(text.seeAlso ?? []), 'brands', 'sponsors'],
  };
}

export const LORE_ARTICLES = {
  etheria: {
    title: COUNTRY,
    category: 'lore',
    summary: 'The country the game is set in: five regions between the sea and the hills.',
    facts: [
      ['Regions', String(REGIONS.length)],
      ['People in 1970', count(REGIONS.reduce((sum, r) => sum + r.population1970, 0))],
      ['Capital', 'Coax City'],
      ['Seat of government', 'Turing'],
      ['Biggest city', 'Coax City'],
      ['Public broadcaster', 'EPB'],
    ],
    sections: [
      {
        body: [
          `**${COUNTRY}** is the country where the game takes place. Until 1970 its radio and television were made by one broadcaster, [[epb]]. Since the [[broadcasting-act|law of 1970]], anyone with a license may broadcast.`,
        ],
      },
      {
        heading: 'Geography',
        body: [
          'Etheria lies on the sea, which runs along its whole north coast and cuts in as a long bay on the east side. To the west and the south it borders other countries. One river runs from the Amplify Hills south-west into Byte Lake; another runs down the east of Transponder Valley to the bay.',
        ],
      },
      {
        heading: 'Regions',
        body: [
          {
            table: {
              head: ['Region', 'Where', 'People in 1970', 'Known for'],
              rows: [
                ['[[coaxia]]', 'South-west, inland', count(REGIONS.find((r) => r.id === 'capital')!.population1970), 'Coax City, the young and the ambitious'],
                ['[[transponder-valley]]', 'North-east, on the sea', count(REGIONS.find((r) => r.id === 'north')!.population1970), 'Factories and the technical university'],
                ['[[skywave-beach]]', 'North-west, on the coast', count(REGIONS.find((r) => r.id === 'coast')!.population1970), 'Beaches, hotels and offices'],
                ['[[aerial-fields]]', 'South-east, on the bay', count(REGIONS.find((r) => r.id === 'heartland')!.population1970), 'Farmland and four small cities'],
                ['[[amplify-hills]]', 'The middle', count(REGIONS.find((r) => r.id === 'highlands')!.population1970), 'Hills, villages and mines'],
              ],
            },
          },
          'Each region has its own mix of [[audiences]] and its own [[licenses]]. A company has its headquarters in one of them, chosen when the game starts; it may broadcast in all.',
        ],
      },
      {
        heading: 'Government',
        body: [
          'Coax City is the capital of Etheria, but the government sits in Turing, a town next to it in [[coaxia]]. The senate, the house of representatives and Turing House, the government building, are all there. The country has a President and a Vice-President, who choose their own ministers.',
          `The house of representatives has 185 seats and is elected directly. The senate has ${SENATE_TOTAL}, a fixed number for each region:`,
          {
            table: {
              head: ['Region', 'Seats in the senate'],
              rows: (Object.entries(SENATE_SEATS) as [RegionId, number][]).sort((a, b) => b[1] - a[1]).map(([id, seats]) => [regionName(id), String(seats)]),
            },
          },
          'The major parties are the Etheria Workers Force (EWF), Liberath’49 (LIB), the Green Society (TGS), the Righteous Etheria Brothers (REB) and Free Etheria (FE).',
          'Each region also has a governor and a house of representatives of its own, in its capital.',
        ],
      },
    ],
    seeAlso: ['coaxia', 'epb', 'broadcasting-act', 'audiences'],
  },

  coaxia: {
    title: 'Coaxia',
    category: 'lore',
    summary: 'The region of the capital: the most people, and the youngest.',
    facts: regionFacts('capital', ['Counties', 'Zuse, Turing, Bush'], 'Coax City; the cities Kate and Barbara; Byte Lake; Buch Wildlife Park'),
    picture: { file: 'coaxia.webp', caption: 'Coax City around the office: towers, flats and the railway.' },
    sections: [
      {
        body: [
          '**Coaxia** lies landlocked in the south-west corner of [[etheria]] and is named after its metropolis, Coax City, the capital of the country. Its only neighbour inside the country is [[amplify-hills]], to the north-east. It is by far the most crowded of the five regions, and where both young people and professionals move to.',
          'The river from the Amplify Hills ends here, in Byte Lake.',
        ],
      },
      {
        heading: 'The people',
        body: [
          `Coax City is a city of tall towers and busy streets. Young professionals come for the best-paid jobs in the country, and students for Coax City University (CCU), the largest university of Etheria and the best rated. Its Faculty of Media is known around the world for its media and communication studies. The main audiences are ${audiencesOf('capital')}.`,
        ],
      },
      {
        heading: 'Sport',
        body: [
          `**${REGION_TEAMS.capital.football}** plays football in the National Football League, in front of the biggest crowds in the country. The **${REGION_TEAMS.capital.basketball}** play basketball in the Basketball League, a short walk from the government buildings. Showing their games on television takes [[sports-rights]].`,
        ],
      },
      {
        heading: 'The capital',
        body: [
          `${REGION_CAPITALS.capital} is the capital of Coaxia and of the whole country. The governor of Coaxia and its house of representatives sit there. The government of the country does not: it sits in Turing next door, with the senate, the house of representatives and Turing House. Coaxia has ${SENATE_SEATS.capital} seats in the senate, the most of any region.`,
        ],
      },
      {
        heading: 'What to see',
        body: [
          'Reality Square, in the middle of Coax City, is the busiest square in the country: billboards and neon signs on every wall, and a shop window full of television sets that all show the same channel.',
          'Outside the city lie the cities Kate and Barbara, Byte Lake, and Buch Wildlife Park.',
        ],
      },
      {
        heading: 'For a broadcaster',
        body: [
          `With your headquarters here, this is what you see from the office. ${SITES.capital.about}`,
          `Coaxia has more people than any other region, and it grows fastest. Its audiences are ${list(audienceNames('capital').map((n) => n.toLowerCase()))}: music by day, and something for the professionals in the evening. Its licenses are the dearest in the country, and the only ones that pay for a full team on their own.`,
          'One of the four [[rivals]], the one that plays music for the young, starts elsewhere and leaves Coaxia open at first. It does not stay away forever.',
        ],
      },
    ],
    seeAlso: ['etheria', 'amplify-hills', 'licenses', 'first-weeks'],
  },

  'amplify-hills': {
    title: 'Amplify Hills',
    category: 'lore',
    summary: 'The middle of the country: much land, few people.',
    facts: regionFacts('highlands', ['Counties', 'Nipkow, Shoenberg, Korn, Ardenne, Hell'], 'The cities Stroedel and Apfel; the hills themselves'),
    picture: { file: 'amplify-hills.webp', caption: 'A town in the hills: houses with gardens, woods behind them and the lake in front.' },
    sections: [
      {
        body: [
          '**Amplify Hills** lies in the middle of [[etheria]], north-east of [[coaxia]]. It is the only region that touches all four others. It is a large stretch of land with the smallest population of the five.',
          'Being in the middle of the country, it is where a lot of people pass through every day, by train.',
        ],
      },
      {
        heading: 'The people',
        body: [
          `Families and seniors like to live here because of the nature. Some seniors have never seen any place outside their own small village. A couple of mines are still worked, and the miners and their families make up much of the towns around them. The main audiences are ${audiencesOf('highlands')}.`,
        ],
      },
      {
        heading: 'Sport',
        body: [
          `The **${REGION_TEAMS.highlands.football}** play football in the National Football League. The club was started by the men of the mines, and some of its players still go down them in the week. The **${REGION_TEAMS.highlands.basketball}** play basketball in the Basketball League, in a hall beside the railway yards. Showing their games on television takes [[sports-rights]].`,
        ],
      },
      {
        heading: 'The capital',
        body: [
          `${REGION_CAPITALS.highlands} is the capital of the Amplify Hills: the governor and the region’s house of representatives sit there. With ${SENATE_SEATS.highlands} seats, the region has the fewest in the senate.`,
        ],
      },
      {
        heading: 'What to see',
        body: [
          'Nipkow Central is one of the busiest train stations in the country, and the oldest. Most of the people who change trains there are in too much of a hurry to see how beautiful it is.',
          'From Nipkow you can take the train to [[transponder-valley]], one of the most beautiful train rides in the world: it leads you straight into the Amplify Hills. There are also the cities Stroedel and Apfel.',
        ],
      },
      {
        heading: 'For a broadcaster',
        body: [
          `With your headquarters here, this is what you see from the office. ${SITES.highlands.about}`,
          `The audiences are ${list(audienceNames('highlands').map((n) => n.toLowerCase()))}. The licenses are the cheapest in the country, and worth it only as an addition: the same shows for a few more people. Morning shows, drama and news suit it better than the charts.`,
        ],
      },
    ],
    seeAlso: ['etheria', 'coaxia', 'audiences', 'growing'],
  },

  'transponder-valley': {
    title: 'Transponder Valley',
    category: 'lore',
    summary: 'The industrial north-east: factories on one side, a university on the other.',
    facts: regionFacts('north', ['Counties', 'Meucci, Reis, Bell, Gray, Puskas, Edison'], 'The cities Bell, Tone and Ring; the Meucci Desert; Transponder Technical University'),
    picture: { file: 'transponder-valley.webp', caption: 'Factory country around the office: workshops, chimneys, tanks and containers.' },
    sections: [
      {
        body: [
          '**Transponder Valley** is in the north-east of [[etheria]], with the sea on two sides. Thousands of people work in its factories. It is known across the Union as the place that makes everything: the radio in your kitchen, the valves inside it, and the machines that make the valves.',
          'On the east side stand the massive factories. On the west side, near the [[amplify-hills]] and the Meucci Desert, is Transponder Technical University, where students and professionals work on tomorrow’s answers. The desert is shared with [[skywave-beach]].',
        ],
      },
      {
        heading: 'The people',
        body: [
          `The east side is workers’ country: whole towns that are up before the first shift and in bed early. The west side belongs to the university, its students and the professionals who work with them, and stays up late. The main audiences are ${audiencesOf('north')}.`,
        ],
      },
      {
        heading: 'Sport',
        body: [
          `**${REGION_TEAMS.north.football}** began as the club of the factories, and on a match day the factory gates close early. It plays in the National Football League. The **${REGION_TEAMS.north.basketball}** are the university’s team in the Basketball League; their supporters are mostly students, and loud. Showing their games on television takes [[sports-rights]].`,
        ],
      },
      {
        heading: 'The capital',
        body: [
          `${REGION_CAPITALS.north} is the capital of Transponder Valley: the governor and the region’s house of representatives sit there. The region has ${SENATE_SEATS.north} seats in the senate, second only to [[coaxia]].`,
        ],
      },
      {
        heading: 'What to see',
        body: [
          'Transponder Technical University is a big campus next to a big hill, on the west side of the valley. Beyond it lies the Meucci Desert. There are also the cities Tone and Ring.',
        ],
      },
      {
        heading: 'For a broadcaster',
        body: [
          `With your headquarters here, this is what you see from the office. ${SITES.north.about}`,
          `It is the second region by people, and it hardly grows. The audiences are ${list(audienceNames('north').map((n) => n.toLowerCase()))}: workers who listen in the morning and at lunch, and a university town that stays up late. Two rivals start here.`,
        ],
      },
    ],
    seeAlso: ['etheria', 'skywave-beach', 'audiences', 'schedule'],
  },

  'skywave-beach': {
    title: 'Skywave Beach',
    category: 'lore',
    summary: 'The busy north-west coast.',
    facts: regionFacts('coast', ['Districts', 'Hughes, Maxwell, Hertz, Trouton'], 'The cities Maxwell, Yaht and Bling; Maxwell International Harbor'),
    picture: { file: 'skywave-beach.webp', caption: 'The seaside: houses along the beach, and the city behind them.' },
    sections: [
      {
        body: [
          '**Skywave Beach** runs along the north coast in the north-west of [[etheria]]. It is where seniors come to relax, families live in large cities and professionals work in large offices. There are large hotel chains, and possibly sharks.',
          'It is divided into districts, not counties, and has the country’s international harbour, at Maxwell.',
        ],
      },
      {
        heading: 'The people',
        body: [
          `Seniors come here to relax by the sea, families live in its large cities and professionals work in its large offices. In summer the hotels fill up with people from the rest of the country, and from abroad. The main audiences are ${audiencesOf('coast')}.`,
        ],
      },
      {
        heading: 'Sport',
        body: [
          `The **${REGION_TEAMS.coast.football}** play football in the National Football League, in a ground that looks out over the harbour. The **${REGION_TEAMS.coast.basketball}** play basketball in the Basketball League, named after the sharks that may or may not be out there. Showing their games on television takes [[sports-rights]].`,
        ],
      },
      {
        heading: 'The capital',
        body: [
          `${REGION_CAPITALS.coast}, the harbour city, is the capital of Skywave Beach: the governor and the region’s house of representatives sit there. The region has ${SENATE_SEATS.coast} seats in the senate.`,
        ],
      },
      {
        heading: 'What to see',
        body: [
          'The most interesting place in Skywave Beach is the Mer Doché Hotel, by the beach. It was the first of many hotels founded by the newspaper magnate Meridiane Doché, and by far the most eccentric: it is built of large stones that look as if they came straight from ancient Greece, and looks almost out of a film. Only the biggest stars stay there.',
          'There are also the cities Yaht and Bling, and Maxwell International Harbor.',
        ],
      },
      {
        heading: 'For a broadcaster',
        body: [
          `With your headquarters here, this is what you see from the office. ${SITES.coast.about}`,
          `The audiences are ${list(audienceNames('coast').map((n) => n.toLowerCase()))}: the people advertisers pay most for. Classical music, news and talk do well; the charts less so.`,
        ],
      },
    ],
    seeAlso: ['etheria', 'transponder-valley', 'audiences', 'genres'],
  },

  'aerial-fields': {
    title: 'Aerial Fields',
    category: 'lore',
    summary: 'The rural south-east, on the bay.',
    facts: regionFacts('heartland', ['Counties', 'Lee, Cerf, Kahn, Taylor'], 'The cities Google, Buzz, Newcast and Bigdata; Newcast International Airport'),
    picture: { file: 'aerial-fields.webp', caption: 'Farm country: houses with gardens around the office, and fields all round.' },
    sections: [
      {
        body: [
          '**Aerial Fields** lies in the south-east of [[etheria]], on the bay. It is the rural part of the country and the smallest region on the map, though not the one with the fewest people. What it lacks in people it makes up for in cows, chickens, sheep and alpacas: you name it, they have it. It is the backbone of all things food in Etheria and the countries around it.',
          'It is best known for Aeia, a herb that grew in Etheria before any people moved in. It makes everything you cook with it taste better, and no food agency in the world has banned it. Yet.',
        ],
      },
      {
        heading: 'The people',
        body: [
          `Most people work the land, or in the dairies and mills that turn its harvest into food. Families live in the villages and the four small cities, and the teens dream of Coax City. The main audiences are ${audiencesOf('heartland')}.`,
        ],
      },
      {
        heading: 'Sport',
        body: [
          `**${REGION_TEAMS.heartland.football}** plays football in the National Football League. The **${REGION_TEAMS.heartland.basketball}** play basketball in the Basketball League, with an alpaca on their shirts and, on big days, a real one in the hall. Showing their games on television takes [[sports-rights]].`,
        ],
      },
      {
        heading: 'The capital',
        body: [
          `${REGION_CAPITALS.heartland}, the city of the airport, is the capital of Aerial Fields: the governor and the region’s house of representatives sit there. The region has ${SENATE_SEATS.heartland} seats in the senate.`,
        ],
      },
      {
        heading: 'What to see',
        body: [
          'In the middle of a village roundabout stands a statue of a very happy man, holding up crops of Aeia.',
          'There are also the cities Google, Buzz and Bigdata, and Newcast International Airport.',
        ],
      },
      {
        heading: 'For a broadcaster',
        body: [
          `With your headquarters here, this is what you see from the office. ${SITES.heartland.about}`,
          `The audiences are ${list(audienceNames('heartland').map((n) => n.toLowerCase()))}. It is small and grows slowest of all. The rival that plays music for the young starts here, so the teens of Aerial Fields already have a station.`,
        ],
      },
    ],
    seeAlso: ['etheria', 'rivals', 'audiences'],
  },

  epb: {
    title: 'EPB',
    category: 'lore',
    summary: 'The public broadcaster, and until 1970 the only one.',
    facts: [
      ['Radio', epb.channels.map((c) => c.name).join(', ')],
      ['Television', epb.tv.name ?? 'EPB-TV'],
      ['Broadcasts in', 'Every region'],
    ],
    sections: [
      {
        body: [
          '**EPB** is the public broadcaster of [[etheria]]. Before the [[broadcasting-act|law of 1970]] it made all the radio and television there was. It is in every game, in every region, from the first day.',
        ],
      },
      {
        heading: 'What it airs',
        body: [
          {
            table: {
              head: ['Channel', 'Schedule, morning to late night'],
              rows: [...epb.channels, epb.tv].map((c) => [c.name ?? '', c.schedule.map((g) => getGenre(g).name).join(' · ')]),
            },
          },
          'Its shows are well made, the best among the [[rivals]] when a game starts, and its hosts are not famous. It does not play the charts. That is the gap a new company starts in.',
          'EPB holds the first TV license in every region.',
        ],
      },
    ],
    seeAlso: ['rivals', 'broadcasting-act', 'licenses'],
  },

  'tabby-loid': {
    title: 'Tabby Loid',
    category: 'lore',
    summary: 'Newspaper publisher, your uncle, and the owner of your company.',
    facts: [
      ['Known as', 'Uncle Tabby'],
      ['Company', 'Loid Enterprises'],
      ['Trade', 'Newspapers'],
      ['Put up', `${euro(STARTING_MONEY.normal)} on normal`],
    ],
    sections: [
      {
        body: [
          `**Tabby Loid** is a newspaper giant of [[etheria]] and your uncle. He lobbied the government for years to let commercial parties make radio and television, and in 1970 he got his way ([[broadcasting-act]]). He is your first financier: the money a company starts with, ${euro(STARTING_MONEY.normal)} on normal, is his.`,
          'His newspapers belong to **Loid Enterprises**, his own company, and so does the money he put up. He does not run yours; you do. He takes his share once a year ([[dividends]]), and he lends you his business consultant, [[penny-cash]].',
          'He writes to you himself about milestones, the dividend and money trouble, from tabby@loid-enterprises.eth ([[inbox]]).',
        ],
      },
      {
        heading: 'In his own words',
        body: WELCOME.map((line) => `“${line.say}”`),
      },
    ],
    seeAlso: ['penny-cash', 'dividends', 'broadcasting-act'],
  },

  'penny-cash': {
    title: 'Penny Cash',
    category: 'lore',
    summary: 'Your uncle’s business consultant, and the game’s tutorial.',
    sections: [
      {
        body: [
          `**Penny Cash** is the very witty business consultant of [[tabby-loid]], on loan to you. At the start of a game she asks whether you want her: “${OFFER.say}”`,
          'If you do, she leads you through [[first-weeks|the first weeks]], one step at a time, with a ring around what to click. After that she only drops by with a word of advice the first time something new comes up, and when the company is in the red. Once the company has paid its way for a few months and can pay for it, she offers to walk you through a first TV channel the same way ([[television]]). If something urgent comes up on the way, she goes back to the same step afterwards. “Not now” is an answer; you can start it later in the Settings, with “Walk me through television”.',
          'She can be sent away with the close button of her window, and called back in the Settings ([[saving]]). She picks up wherever the company stands.',
        ],
      },
    ],
    seeAlso: ['first-weeks', 'tabby-loid', 'saving'],
  },

  'broadcasting-act': {
    title: 'The law of 1970',
    category: 'lore',
    summary: 'The law that opened radio and television to everyone.',
    sections: [
      {
        body: [
          'Until 1970, radio and television in [[etheria]] were made by the public broadcaster [[epb]] alone. After years of lobbying by the newspaper publisher [[tabby-loid]], the government gave in: from 1 January 1970, commercial parties may broadcast too. That is the day the game starts.',
        ],
      },
      {
        heading: 'What it says',
        body: [
          {
            list: [
              'To broadcast in a region, a channel needs a license for that region: one kind for radio, another for television ([[licenses]]).',
              `Licenses are limited. A region has ${RADIO_LICENSE_SLOTS.base} radio licenses and one more for every ${count(RADIO_LICENSE_SLOTS.peoplePerSlot)} people. Television licenses are issued one at a time, in years the broadcasting authority decides.`,
              'A license is for a term. When it ends, others may bid for it ([[auctions]]).',
              'A company that gives a license up has to wait before it gets another in that region.',
            ],
          },
          `The public broadcaster kept its channels, and the first television license in every region. Everyone else starts with what they can pay for: for you, that is what your uncle put up.`,
        ],
      },
    ],
    seeAlso: ['epb', 'tabby-loid', 'licenses', 'auctions'],
  },

  brands: {
    title: 'Brands of Etheria',
    category: 'lore',
    summary: 'The names behind the sponsor offers.',
    sections: [
      {
        body: [
          `The companies that sponsor shows in [[etheria]]. There are ${SPONSOR_NAMES.length} of them, and their logos are on the offers in the Sales window.`,
          {
            table: {
              head: ['Brand', 'Trade'],
              rows: SPONSOR_NAMES.map((name) => [`[[${SPONSORS[name as SponsorName][0]}]]`, SPONSORS[name as SponsorName][1]]),
            },
          },
          'Which brand makes an offer changes nothing about it at first: the rate, the audience it prefers and the minimum are what count ([[sponsors]]). A brand you have worked with before pays more, the better your company knows it.',
        ],
      },
    ],
    seeAlso: ['sponsors', 'etheria', ...Object.values(SPONSORS).map(([id]) => id)],
  },

  beerstar: sponsorArticle('Beerstar', {
    summary: 'The official beer of Etheria since 1607. By law, not a beer.',
    facts: [
      ['CEO', 'Zinky Bulk'],
      ['Founded', '1607'],
      ['Grown in', 'Amplify Hills'],
    ],
    lead: [
      '**Beerstar** has been the official beer of [[etheria]] since it was founded in 1607. What goes into it grows locally, in the [[amplify-hills]].',
      'Besides Beerstar Regular there is Beerstar Light, and Beerstar German, a mix with cola and orangeade.',
      'The government once took it to court to have the word “Beer” taken out of its name, since it is not actually beer. The case ended in a settlement nobody knows the sum of ([[ipsum-ipsum]]).',
    ],
    quote: ['I always say: we don’t just make beer, we make an experience. Also, by law we can’t call it beer.', 'Zinky Bulk, CEO of Beerstar'],
    seeAlso: ['amplify-hills', 'ipsum-ipsum'],
  }),

  citrus: sponsorArticle('Citrus', {
    summary: 'The drinks brand behind Citrus Fresh, a soda that tastes of lemon.',
    facts: [['Best known for', 'Citrus Fresh']],
    lead: [
      '**Citrus** is a drinks brand of [[etheria]], best known for Citrus Fresh, a soda that tastes of lemon.',
      'The slice in its logo is a lemon too, whatever the orange around it suggests. Citrus says little else about itself: it would rather you had a drink.',
    ],
  }),

  foodst: sponsorArticle('Foodst', {
    summary: 'A food chain of over 211 restaurants, from burgers to barbecue.',
    facts: [
      ['CEO', 'Jackie McDonall'],
      ['Restaurants', 'Over 211'],
    ],
    lead: [
      '**Foodst** is a food chain with over 211 restaurants across [[etheria]], ranging from burger bars (BurgerFoodst) to high-end barbecue (GrillFoodst).',
      'Most of its products are truly unique: the meat is always a mixture of several animals.',
    ],
    quote: ['Have you tried our new burger? I sure haven’t.', 'Jackie McDonall, CEO of Foodst'],
  }),

  'ipsum-ipsum': sponsorArticle('Ipsum & Ipsum', {
    summary: 'A law firm in Coax City, run by a brother and a sister.',
    facts: [
      ['Founders', 'Lareem and Dolores Ipsum'],
      ['Based in', 'Coax City'],
    ],
    lead: ['**Ipsum & Ipsum** is a law firm in Coax City ([[coaxia]]), set up by Lareem Ipsum and his sister Dolores Ipsum.'],
    more: [
      {
        heading: 'The Beerstar case',
        body: [
          'Their most famous lawsuit was The State of Etheria v. [[beerstar]]. The government wanted Beerstar to take the word “Beer” out of its name, because it is not actually beer. The two sides settled for a sum that was never made public, and the details are still unknown.',
        ],
      },
    ],
    quote: ['If there is a lawsuit somewhere, we want to win it. Doesn’t matter if it is a murder, tax evasion or just a plain robbery. Ipsum & Ipsum is the choice for you.', 'Lareem Ipsum, co-founder'],
    seeAlso: ['coaxia', 'beerstar'],
  }),

  jupiter: sponsorArticle('Jupiter', {
    summary: 'The big telephone and internet company, which also runs the government’s computers.',
    facts: [['CEO', 'Dotty Net']],
    lead: [
      '**Jupiter** is a major telecommunications company in [[etheria]]. It runs telephone networks and the internet, and builds computer systems and infrastructure for companies.',
      'Every system of the Etherian government runs on Jupiter’s computers as well. That sounds like a bad idea, so it probably is.',
    ],
    quote: ['We connect everyone with each other, and ask money for that. That right there is the most human thing ever.', 'Dotty Net, CEO of Jupiter'],
  }),

  manen: sponsorArticle('Manen', {
    summary: 'A brand everyone in Etheria knows the logo of, and nobody can say what it sells.',
    facts: [],
    lead: [
      '**Manen** sponsors shows in [[etheria]] like any other brand, and its green logo is everywhere. What it sells has never been written down anywhere.',
      'Ask at Manen and they will thank you for your interest. Its money is good, and that is all a broadcaster needs to know.',
    ],
  }),

  'moon-capital': sponsorArticle('Moon Capital', {
    summary: 'An investment firm with a share in almost everything.',
    facts: [['CEO', 'Simon Westerling Von Oosterlingen-Zuid']],
    lead: [
      '**Moon Capital** is an investment firm in [[etheria]] with a share in almost everything it is humanly possible to own.',
      'Rumour has it that it plans to buy the Moon one day. Its chief financial officer builds space rockets in his back garden as a hobby. That, and making everyone cringe each time he speaks on television.',
    ],
    quote: ['We like to own stuff. Who are you? Can we buy a piece of you?', 'Simon Westerling Von Oosterlingen-Zuid, CEO of Moon Capital'],
  }),

  tahoma: sponsorArticle('Tahoma', {
    summary: 'A clothing brand known abroad for its cheap, plain basics.',
    facts: [
      ['CEO', 'Rudolf Blend'],
      ['Made in', 'Transponder Valley'],
    ],
    lead: [
      '**Tahoma** is a clothing brand known well beyond [[etheria]], famous for its low-priced basics, made in the big factories of [[transponder-valley]].',
      'It is an award-winning brand: it won the prize for “dullest bland on earth”.',
    ],
    quote: ['At Tahoma, being your best normal self is your best self.', 'Rudolf Blend, CEO of Tahoma'],
    seeAlso: ['transponder-valley'],
  }),
} satisfies Partial<Record<ArticleId, ArticleText>>;
