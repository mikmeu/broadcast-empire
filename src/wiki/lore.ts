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
import { fromYear } from './history';
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
  Manen: ['manen', 'Consumer goods'],
  'Moon Capital': ['moon-capital', 'Investment'],
  Tahoma: ['tahoma', 'Clothing'],
  'Voltamax Energy': ['voltamax-energy', 'Electricity'],
  'Dreamscape Holidays': ['dreamscape-holidays', 'Holidays and travel'],
  'SafeSure Insurance': ['safesure-insurance', 'Insurance'],
  'Ferro Motors': ['ferro-motors', 'Cars and lorries'],
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
      ['Republic since', '1769'],
      ['People in 1970', count(REGIONS.reduce((sum, r) => sum + r.population1970, 0))],
      ['Capital', 'Coax City'],
      ['Seat of government', 'Turing'],
      ['Biggest city', 'Coax City'],
      ['Public broadcaster', 'EPB'],
    ],
    sections: [
      {
        body: [
          `**${COUNTRY}** is the country where the game takes place, a federal republic since 1769 ([[etheria-history]]). Until 1970 its radio and television were made by one broadcaster, [[epb]]. Since the [[broadcasting-act|law of 1970]], anyone with a license may broadcast.`,
        ],
      },
      {
        heading: 'Geography',
        body: [
          'Etheria lies on the sea, which runs along its whole north coast and cuts in as a long bay on the east side. To the west and the south it borders other countries. One river runs from the Amplify Hills south-west into Byte Lake; another runs down the east of Transponder Valley to the bay.',
        ],
      },
      {
        heading: 'Neighbours',
        body: [
          'Three countries lie around Etheria.',
          '**Casette** lies to the west and borders Skywave Beach, the Amplify Hills and Coaxia. It is one of the oldest monarchies in the Union, known for its long traditions, its rainy weather and its calm while its neighbours reorganise themselves every few decades.',
          '**Sants-de-Inez** lies to the south, between [[coaxia]] and [[aerial-fields]]. It is a duchy, small but among the richest in the Union, and a centre of banking and finance. Its fuel taxes are low, so many Etherians pay it suspiciously frequent “cultural visits”.',
          '**Dramedy**, a federal republic, lies to the east, across the bay. It is Etheria’s largest neighbour and trading partner, famed for its engineering, its factories and its efficient administration. Its people plan everything in advance, which still puzzles Etherians, who prefer to solve problems after they happen.',
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
          'Coax City is the capital of Etheria, but the government sits in Turing, a town next to it in [[coaxia]]. The senate, the house of representatives and Turing House, the government building, are all there. The country has a President and a Vice-President, who choose their own ministers. The leader of the biggest party in the house becomes President, and the leader of the second biggest Vice-President. The leader of the biggest party in the senate is the Senate Speaker.',
          `The house of representatives has 185 seats and is elected directly. A party needs at least 250,000 votes to take part in it, and the seats are shared among the parties that do. The senate has ${SENATE_TOTAL}, a fixed number for each region:`,
          {
            table: {
              head: ['Region', 'Seats in the senate'],
              rows: (Object.entries(SENATE_SEATS) as [RegionId, number][]).sort((a, b) => b[1] - a[1]).map(([id, seats]) => [regionName(id), String(seats)]),
            },
          },
          'The major parties are the Etheria Workers Force (EWF), Liberath’49 (LIB), the Green Society (TGS), the Righteous Etheria Brothers (REB) and Free Etheria (FE).',
          'Each region also has a governor and a house of representatives of its own, in its capital. The senate is elected every four years, like the house, but two years apart from it. The general election that picks a president is described under [[history]].',
        ],
      },
      {
        heading: 'Transport',
        body: [
          'The country is joined by [[railways]], on which Nipkow Central in the [[amplify-hills]] is the busiest station. Ships come in at [[maxwell-harbor]]. Two airports serve the rest of the Union: [[coax-airport]], the biggest, and [[newcast-airport]], the cheapest.',
        ],
      },
    ],
    seeAlso: ['etheria-history', 'coaxia', 'epb', 'broadcasting-act', 'audiences'],
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
          'Outside the city lie the cities Kate and Barbara, Byte Lake, and Buch Wildlife Park, and [[coax-airport]], the biggest airport in the country. The first railway in Etheria ran from here to Turing ([[railways]]).',
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
    seeAlso: ['etheria', 'amplify-hills', 'coax-airport', 'licenses', 'first-weeks'],
  },

  'amplify-hills': {
    title: 'Amplify Hills',
    category: 'lore',
    summary: 'The middle of the country: much land, few people.',
    facts: regionFacts('highlands', ['Counties', 'Nipkow, Shoenberg, Korn, Ardenne, Hell'], 'The cities Stroedel and Apfel; the hills themselves'),
    picture: { file: 'amplify-hills.webp', caption: 'A town in the hills: houses with gardens, a stream and the hills behind them.' },
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
          'Nipkow Central is one of the busiest train stations in the country, and the oldest ([[railways]]). Most of the people who change trains there are in too much of a hurry to see how beautiful it is.',
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
    seeAlso: ['etheria', 'coaxia', 'railways', 'audiences', 'growing'],
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
    seeAlso: ['etheria', 'skywave-beach', 'railways', 'audiences', 'schedule'],
  },

  'skywave-beach': {
    title: 'Skywave Beach',
    category: 'lore',
    summary: 'The busy north-west coast.',
    facts: regionFacts('coast', ['Districts', 'Hughes, Maxwell, Hertz, Trouton'], 'The cities Maxwell, Yaht and Bling; Maxwell International Harbor'),
    picture: { file: 'skywave-beach.webp', caption: 'The seaside: the beach and the sea, a road along the front and the city behind it.' },
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
          'There are also the cities Yaht and Bling, and [[maxwell-harbor]], with its Titan Crane.',
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
    seeAlso: ['etheria', 'transponder-valley', 'maxwell-harbor', 'audiences', 'genres'],
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
          'There are also the cities Google, Buzz and Bigdata, and [[newcast-airport]], the cheapest way out of the country.',
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
    seeAlso: ['etheria', 'newcast-airport', 'rivals', 'audiences'],
  },

  epb: {
    title: 'EPB',
    category: 'lore',
    summary: 'The public broadcaster, and until 1970 the only one.',
    facts: [
      ['Full name', 'Etherian Public Broadcasting Foundation'],
      ['Founded', '1925, by the government'],
      ['Based in', 'Turing'],
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
        heading: 'History',
        body: [
          'The government set up the Etherian Public Broadcasting Foundation in 1925, as the country’s first radio service. It came in a time of economic trouble, after one of the worst market crashes in Etherian history. Officials saw radio as a new way to inform the public, to build national unity and, above all, to prevent more panic. Commercial radio was banned from the start: the airwaves were too important to leave to private interests or to people with “unverified opinions”.',
          'At first it broadcast from Turing, the seat of government, for only two hours a day: government announcements, news, weather and, whenever nothing newsworthy happened, some classical music. It never had an official name, so listeners called it Turing Radio Set, and by 1927 the broadcasters did too.',
          'As more homes got a radio, the signal from Turing struggled to cross the [[amplify-hills]] and reach the growing towns of [[transponder-valley]]. The government set up a small relay in Bell, called Bell Radio. It was meant to make programmes of its own, but two radio services cost too much, and Bell Radio soon only repeated recordings from Turing. The organisation dropped local names and became Etherian Public Broadcasting.',
          'In 1935 it launched a second national network. The old one became Radio 1, for news, current affairs, sport and education. The new one, Radio 2, played music and light entertainment. Historians say this is when Etherians first learned to complain about “what’s on the other channel”.',
          'In the 1940s EPB built more transmitters and became one of the most trusted sources of information. In national emergencies both stations carried the same broadcast. In calmer times, listeners could enjoy uninterrupted debates on farm policy.',
          'In 1951 EPB made the first experimental television broadcasts in Etheria, under the name EPB-TV. Few people owned a set, and many met television at demonstrations in town squares, government buildings and shop windows. Reports say a good part of the first viewers wondered why radio suddenly needed furniture. After this success the broadcaster used the name EPB for all its radio and television.',
          'In 1970 the government allowed commercial broadcasting ([[broadcasting-act]]). For the first time EPB had competition from private radio and television. Supporters welcomed the choice. Critics feared that broadcasters would put ratings before public service. EPB’s management dismissed this, saying that citizens would always prefer educational programmes, balanced journalism and three-hour documentaries on rural irrigation.',
          'Events would soon prove otherwise.',
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
      ['Born', '1932, Transponder Valley'],
      ['Companies', 'Loid Enterprises, Loid Capital'],
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
        heading: 'The newspapers',
        body: [
          'Tabby was born in 1932 in the hills of [[transponder-valley]]. His father Anton started the Transponder Gazette, a regional paper that grew into the biggest in [[etheria]]. In 1943 it merged with the Coax Courant, the second largest, in [[coaxia]]. Together they became Etheria Daily, which still exists.',
          'Tabby began as a paper boy and was a manager at 21. Loid Enterprises bought more newspapers and magazines, and he became head of its newspaper division. After the untimely death of his father in 1956, he became its CEO and sole shareholder.',
        ],
      },
      {
        heading: 'SEA-AM',
        body: [
          'In 1961 Tabby started Loid Capital, which invested in small media companies. One of them was SEA-AM, a radio station that broadcast from international waters, because commercial broadcasting was still illegal. A few months later the government banned commercial stations from the airwaves of Etheria, and SEA-AM was taken off the air.',
        ],
      },
      {
        heading: 'The law of 1970',
        body: [
          'After SEA-AM, Tabby led the fight against the ban. In September 1969 he gave an emotional speech to the Senate and the House, and 67% of the votes were in favour of lifting the ban. The first commercial licenses were awarded on 1 January 1970 ([[broadcasting-act]]).',
        ],
      },
      {
        heading: 'In his own words',
        body: WELCOME.map((line) => `“${line.say}”`),
      },
    ],
    seeAlso: ['penny-cash', 'dividends', 'broadcasting-act', 'transponder-valley'],
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
          'Until 1970, radio and television in [[etheria]] were made by the public broadcaster [[epb]] alone. After years of lobbying, and a speech by the newspaper publisher [[tabby-loid]] in both houses in September 1969, the government gave in: from 1 January 1970, commercial parties may broadcast too. That is the day the game starts.',
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
              'The broadcasting authority writes rules for what may be aired, hears complaints and fines whoever breaks them ([[broadcasting-authority]]).',
            ],
          },
          `The public broadcaster kept its channels, and the first television license in every region. Everyone else starts with what they can pay for: for you, that is what your uncle put up.`,
        ],
      },
    ],
    seeAlso: ['epb', 'tabby-loid', 'licenses', 'auctions', 'broadcasting-authority'],
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
      ['Based in', 'Brassport'],
      ['Grown in', 'Amplify Hills'],
    ],
    lead: [
      '**Beerstar** is one of the oldest companies in [[etheria]] and has been its official beer since it was founded in 1607. Its head office is in Brassport, and much of what goes into it grows in the fields of the [[amplify-hills]].',
      'It is often called a brewery, but it has spent much of its modern history in court over whether its main product is legally beer. The company keeps out of the argument and calls Beerstar “a refreshing lifestyle beverage”.',
      'Besides Beerstar Regular there is Beerstar Light, and Beerstar German, a mix with cola and orangeade whose class beverage experts still dispute. Seasonal editions include Beerstar Winter, Beerstar Tropical and Beerstar Limited Collector’s Barrel Reserve Premium Gold Signature Edition.',
      'Beerstar is one of the biggest sponsors of sport, music festivals and public celebrations in Etheria. Critics note that many of these events seem to exist mainly to advertise Beerstar.',
      fromYear(1984, ['Its slogan, “Taste History”, dates from 1984 and has not changed, in spite of several attempts by historians to distance themselves from the brand.']),
      'The government once took it to court to have the word “Beer” taken out of its name, since it is not actually beer. The case ended in a settlement nobody knows the sum of ([[ipsum-ipsum]]).',
    ],
    quote: ['I always say: we don’t just make a drink, we make an experience. Also, by law, we’re not allowed to call it beer.', 'Zinky Bulk, CEO of Beerstar'],
    seeAlso: ['amplify-hills', 'ipsum-ipsum'],
  }),

  citrus: sponsorArticle('Citrus', {
    summary: 'The market leader in soft drinks, behind Citrus Fresh.',
    facts: [
      ['CEO', 'Samantha Sour'],
      ['Based in', 'Coax City'],
      ['Best known for', 'Citrus Fresh'],
    ],
    lead: [
      '**Citrus** is a drinks company in Coax City ([[coaxia]]) and the market leader in soft drinks in [[etheria]]. Its main product, Citrus Fresh, is one of the most widely drunk drinks in the country.',
      'It began as a lemon processing company and grew known for loud advertising, bright yellow branding and a remarkable ability to add sugar to nearly anything. It also sells Citrus Max, Citrus Zero, Citrus Ultra, Citrus Extra Ultra and Citrus Kidz, which holds about three times the recommended daily amount of excitement.',
      'It has won prizes for advertising and drawn public health criticism. Millions of Etherians drink its products every day, and nutrition experts name it as a major cause of the nation’s weight. Citrus disputes this and tells people to “exercise their freedom of choice”.',
      'It spends more on advertising than any other drinks company. Market analysts reckon that the average citizen sees a Citrus advertisement twelve times before breakfast.',
    ],
    quote: ['We’re the creators of the sweetest and sourest drink in the world. And it’s definitely made from real lemons.', 'Samantha Sour, CEO of Citrus'],
    seeAlso: ['coaxia'],
  }),

  foodst: sponsorArticle('Foodst', {
    summary: 'A food chain of over 211 restaurants, from burgers to barbecue.',
    facts: [
      ['CEO', 'Jackie McDonall'],
      ['Restaurants', 'Over 211'],
    ],
    lead: [
      '**Foodst** is the largest restaurant operator in [[etheria]], with over 211 places under several brands. It serves an estimated two million meals a week and calls itself “the future of food”. Customers and food critics still argue about whether that future is wanted.',
      'Its chains include BurgerFoodst, GrillFoodst, PancakeFoodst, LateNightFoodst and AirportFoodst, which is known for charging high prices for disappointment.',
      'Foodst is famous for its experimental menus. Many products hold blends of ingredients whose make-up is a closely guarded trade secret.',
      fromYear(2018, ['A campaign in 2018 promoted a burger with meat from seven different animal species. It won several awards and set off an inquiry by more than one government agency.']),
      'Despite the regular rows, Foodst is one of the most trusted restaurant brands in the country, mostly because most of the alternatives belong to Foodst too.',
    ],
    quote: ['Have you tried our new burger? I sure haven’t.', 'Jackie McDonall, CEO of Foodst'],
  }),

  'ipsum-ipsum': sponsorArticle('Ipsum & Ipsum', {
    summary: 'A law firm in Coax City, run by a brother and a sister.',
    facts: [
      ['Founders', 'Lareem and Dolores Ipsum'],
      ['Based in', 'Coax City'],
    ],
    lead: [
      '**Ipsum & Ipsum** is one of the largest law firms in [[etheria]]. It was set up in Coax City ([[coaxia]]) by the brother and sister Lareem and Dolores Ipsum, and works on lawsuits, company law, disputes with regulators, intellectual property and situations that have turned much worse than expected.',
      fromYear(1990, ['It made its name in the 1990s with a string of famous court victories for big companies, government agencies, celebrities, criminals and, at least once, an escaped zoo animal.']),
      'Its head office takes up a whole city block, with more lawyers per square metre than any other building in the country.',
    ],
    more: [
      {
        heading: 'The Beerstar case',
        body: [
          'Their most famous lawsuit was The State of Etheria v. [[beerstar]]. The government wanted Beerstar to take the word “Beer” out of its name, because it is not actually beer. The case lasted nearly three years and got more coverage than several national elections. It ended in a secret settlement. The details are still unknown, but legal scholars agree that the only clear winner was the billing department of Ipsum & Ipsum.',
        ],
      },
    ],
    quote: ['If there’s a lawsuit somewhere, we want to win it. Whether it’s murder, tax evasion, or someone claiming their neighbour stole a garden gnome. Ipsum & Ipsum is the choice for you.', 'Lareem Ipsum, co-founder'],
    seeAlso: ['coaxia', 'beerstar'],
  }),

  jupiter: sponsorArticle('Jupiter', {
    summary: 'The big telephone and internet company, which also runs the government’s computers.',
    facts: [['CEO', 'Dotty Net']],
    lead: [
      '**Jupiter** is the largest telecommunications and information technology company in [[etheria]]. It began as a regional telephone operator. It now runs telephone and internet networks, and builds computer systems and infrastructure for companies.',
      fromYear(2000, ['It also sells mobile networks, cloud hosting, cybersecurity, data centres and technical support that may eventually answer the phone.']),
      'It runs critical systems for banks, businesses, schools and government agencies, so every system of the Etherian government runs on Jupiter’s computers. Analysts worry that so much depends on one company. Jupiter says that centralising makes things more efficient. Its critics say it makes outages more exciting. That sounds like a bad idea, so it probably is.',
      fromYear(2017, ['In the Great Network Failure of 2017 almost every government website was out of reach for six hours. Jupiter called it a “temporary cloud-based networking event”.']),
    ],
    quote: ['We connect people with each other and charge money for it. That’s probably the most human thing ever.', 'Dotty Net, CEO of Jupiter'],
  }),

  manen: sponsorArticle('Manen', {
    summary: 'A consumer goods conglomerate that you probably own something of.',
    facts: [['CEO', 'Mike Manen']],
    lead: [
      '**Manen** is a consumer goods conglomerate and one of the largest manufacturers in [[etheria]]. It makes thousands of products under hundreds of brands: cosmetics, household cleaners, food, pet supplies, electronics accessories, toiletries and the odd things found near supermarket checkouts.',
      'It began as a soap maker and grew through decades of takeovers and mergers. Many customers buy several Manen products every day without knowing it. Economists joke that competing against Manen is the first step to becoming part of Manen.',
      'It keeps trying to buy its rivals, though regulators have blocked several bids as unfair to competition.',
      fromYear(2021, ['Documents leaked in 2021 are said to file these decisions under “Temporary Obstacles”.']),
      'Experts reckon that if every bid had gone through, about 83% of what consumers spend would flow to the company. Manen strongly disputes this and says the true number would be much higher.',
    ],
    quote: ['You probably own something made by us. And if you don’t, we’ll probably acquire the company that made it.', 'Mike Manen, CEO of Manen'],
  }),

  'moon-capital': sponsorArticle('Moon Capital', {
    summary: 'An investment firm with a share in almost everything.',
    facts: [['CEO', 'Simon Westerling von Oosterlingen-Zuid']],
    lead: [
      '**Moon Capital** is an international investment firm and holding company, with interests in finance, media, industry, telecommunications, farming, aerospace, shops and some industries that have not been invented yet.',
      'It is one of the most powerful financial firms in [[etheria]], with a share in hundreds of companies. Analysts reckon it makes money, indirectly, whenever an Etherian buys groceries, watches television, drinks a soda, uses a phone or breathes in a way that pays.',
      'It denies having too much say in the market, and some of the denials are printed by media it partly owns.',
      'Rumour has it that it plans to buy the exclusive commercial rights to the Moon, which executives have called “interesting”. Its chief financial officer has two hobbies: building experimental rockets and embarrassing colleagues in television interviews.',
    ],
    quote: ['We like owning things. Who are you, exactly? And how much would a small percentage of you cost?', 'Simon Westerling von Oosterlingen-Zuid, CEO of Moon Capital'],
  }),

  tahoma: sponsorArticle('Tahoma', {
    summary: 'A clothing brand known abroad for its cheap, plain basics.',
    facts: [
      ['CEO', 'Adam Blend'],
      ['Made in', 'Transponder Valley'],
    ],
    lead: [
      '**Tahoma** is a fashion retailer known well beyond [[etheria]] for low-priced basics. It has hundreds of shops in the country and sells to dozens of others. Its goods are made in the big factories of [[transponder-valley]], where millions of identical T-shirts come off the line each year.',
      'Its range is plain shirts, plain jeans, plain jackets and seasonal versions that experts call “almost exactly the same”. Tahoma makes a virtue of being normal: while rivals chase trends, it makes clothes that nobody will ever comment on.',
      'It won the Dullest Brand on Earth prize six years running. Its marketing department is said to have celebrated with a remarkably average office party.',
    ],
    quote: ['At Tahoma, being your best normal self is your best self.', 'Adam Blend, CEO of Tahoma'],
    seeAlso: ['transponder-valley'],
  }),

  'voltamax-energy': sponsorArticle('Voltamax Energy', {
    summary: 'The largest electricity provider in Etheria, and one of its most profitable.',
    facts: [
      ['CEO', 'Sheldon Sparks'],
      ['Founded', '1968'],
    ],
    lead: [
      '**Voltamax Energy** is the largest electricity provider in [[etheria]]. It powers homes, factories, government buildings and an alarming number of giant lit billboards.',
      'It was founded in 1968, in the years of industrial growth. Its power comes from wind farms, solar fields, dams, gas plants and whatever was making those strange noises outside Coax City ([[coaxia]]).',
      'It likes to talk about sustainability, though environmental groups find its idea of “green energy” unusually flexible. It has won several awards for innovation, among them the National Grid Excellence Award and the much less prestigious “Least Catastrophic Blackout of the Year”.',
      fromYear(2014, ['After the nationwide outage of 2014 it assured customers that lessons had been learned and that future outages would be significantly more organised.']),
    ],
    quote: ['Electricity doesn’t grow on trees. We checked. Believe me, we’d save a fortune if it did.', 'Sheldon Sparks, CEO of Voltamax Energy'],
    seeAlso: ['coaxia'],
  }),

  'dreamscape-holidays': sponsorArticle('Dreamscape Holidays', {
    summary: 'The largest travel company in Etheria, with airlines, hotels and many gift shops.',
    facts: [
      ['CEO', 'Candice Voyager'],
      ['Countries', 'Over forty'],
    ],
    lead: [
      '**Dreamscape Holidays** is the largest tourism and travel company in [[etheria]]. It runs airlines, hotels, cruise lines, package holidays, travel insurance and an impressive number of gift shops.',
      'It calls itself “the gateway to unforgettable experiences”, though surveys say many travellers remember the delays best. Its companies work in over forty countries and carry millions of passengers a year. Its destinations include the Golden Shores, the Frostbelt Mountains and several islands that may or may not belong to Dreamscape.',
      'Its all-inclusive packages are popular for their special prices: nearly everything is included except what customers expected to be included. An internal report called customer satisfaction “technically positive”.',
    ],
    quote: ['Travel broadens the mind. Waiting three hours for luggage builds character.', 'Candice Voyager, CEO of Dreamscape Holidays'],
  }),

  'safesure-insurance': sponsorArticle('SafeSure Insurance', {
    summary: 'One of the largest insurers in Etheria, for nearly everything but section 48.',
    facts: [
      ['CEO', 'Bernard Policy'],
      ['Founded', '1953'],
      ['Products', 'Over 3,000'],
    ],
    lead: [
      '**SafeSure Insurance** is one of the largest insurers in [[etheria]]. It sells life, health, vehicle, pet, property, travel and miscellaneous insurance, over 3,000 products in all.',
      'It was founded in 1953 and helps people prepare for unlikely disasters, while quietly hoping they stay unlikely. It keeps one of the biggest collections of actuarial data in the country, and analysts say it can give a risk score to almost any activity, competitive knitting included.',
      'Its advertisements remind you that accidents can happen anywhere. Leaked marketing papers call fear an “underutilised growth market”. Customers whose claims were approved rate it highly.',
    ],
    quote: ['At SafeSure, we’re here for you when the unexpected happens. Except for the unexpected things specifically excluded in section 48.', 'Bernard Policy, CEO of SafeSure Insurance'],
  }),

  'ferro-motors': sponsorArticle('Ferro Motors', {
    summary: 'The largest car maker in Etheria, and maker of the Ferro Falcon.',
    facts: [
      ['CEO', 'Axel Ferro'],
      ['Founded', '1928'],
      ['Best known for', 'The Ferro Falcon'],
    ],
    lead: [
      '**Ferro Motors** is the largest car maker in [[etheria]]. Founded in 1928, it builds cars, lorries, buses, farm machinery and now and then a vehicle that looks designed by a committee with conflicting aims.',
      'It began as a steelworks and entered the car trade in the boom of the 1930s. It employs tens of thousands of people and runs some of the largest factories in [[transponder-valley]]. In uncertain times its output is read as a sign of the nation’s economic health.',
      'Its best seller, the Ferro Falcon, is cheap, simple and keeps running despite obvious faults. It was once voted “Most Likely Car To Still Exist In Twenty Years”, and the company displays the award proudly. Critics say Ferro puts quantity before quality. Ferro says reliability means the vehicle eventually reaches its destination.',
    ],
    quote: ['A Ferro should last a lifetime. Whether that’s the car’s lifetime or yours depends on maintenance.', 'Axel Ferro, CEO of Ferro Motors'],
    seeAlso: ['transponder-valley'],
  }),
} satisfies Partial<Record<ArticleId, ArticleText>>;
