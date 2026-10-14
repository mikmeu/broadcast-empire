// The wiki's articles about the country the game is set in. The facts are the
// designer's (lore.md); the figures are the game's own.

import { RADIO_LICENSE_SLOTS, STARTING_MONEY } from '../config/balance';
import { OFFER, WELCOME } from '../config/guide';
import { SPONSOR_NAMES } from '../config/names';
import { PERSONALITIES } from '../config/rivals';
import { AUDIENCES, COUNTRY, REGIONS, type RegionId } from '../config/world';
import { getGenre } from '../config/genres';
import { licenseMonthly, licensePrice, licenseSlots } from '../sim/licenses';
import { SITES } from '../office/sites';
import { count, euro, list, type ArticleId, type ArticleText } from './types';

const audienceNames = (id: RegionId) => REGIONS.find((r) => r.id === id)!.mainAudiences.map((a) => AUDIENCES.find((x) => x.id === a)!.name);

/** The box beside a region's article. */
function regionFacts(id: RegionId, divisions: readonly [string, string], places: string): readonly (readonly [string, string])[] {
  const region = REGIONS.find((r) => r.id === id)!;
  return [
    ['People in 1970', count(region.population1970)],
    ['Grows by', `${(region.growth * 100).toFixed(1)}% a year`],
    ['Main audiences', audienceNames(id).join(', ')],
    divisions,
    ['Places', places],
    ['Radio license', `${euro(licensePrice('radio', id, 0))}, then ${euro(licenseMonthly('radio', id, 0))} a month`],
    ['Radio licenses', `${licenseSlots('radio', id, 0)} in 1970`],
  ];
}

const epb = PERSONALITIES.highbrow;

export const LORE_ARTICLES = {
  etheria: {
    title: COUNTRY,
    category: 'lore',
    summary: 'The country the game is set in: five regions between the sea and the hills.',
    facts: [
      ['Regions', String(REGIONS.length)],
      ['People in 1970', count(REGIONS.reduce((sum, r) => sum + r.population1970, 0))],
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
    ],
    seeAlso: ['coaxia', 'epb', 'broadcasting-act', 'audiences'],
  },

  coaxia: {
    title: 'Coaxia',
    category: 'lore',
    summary: 'The region of the capital: the most people, and the youngest.',
    facts: regionFacts('capital', ['Counties', 'Zuse, Turing, Bush'], 'Coax City; the cities Kate and Barbara; Byte Lake; Buch Wildlife Park'),
    sections: [
      {
        body: [
          '**Coaxia** lies landlocked in the south-west corner of [[etheria]] and is named after its metropolis, Coax City. Its only neighbor inside the country is [[amplify-hills]], to the north-east. It is where both young people and professionals move to.',
          'The river from the Amplify Hills ends here, in Byte Lake.',
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
    sections: [
      {
        body: [
          '**Amplify Hills** lies in the middle of [[etheria]], north-east of [[coaxia]]. It is the only region that touches all four others. It is a large stretch of land with the smallest population of the five.',
          'Families and seniors like to live here because of the nature. Some seniors have never seen any place outside their own small village. A couple of mines are still worked.',
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
    sections: [
      {
        body: [
          '**Transponder Valley** is in the north-east of [[etheria]], with the sea on two sides. Thousands of people work in its factories. It is known across the Union as the place that makes everything.',
          'On the east side stand the massive factories. On the west side, near the [[amplify-hills]] and the Meucci Desert, is Transponder Technical University, where students and professionals work on tomorrow’s answers. The desert is shared with [[skywave-beach]].',
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
    sections: [
      {
        body: [
          '**Skywave Beach** runs along the north coast in the north-west of [[etheria]]. It is where seniors come to relax, families live in large cities and professionals work in large offices. There are large hotel chains, and possibly sharks.',
          'It is divided into districts, not counties, and has the country’s international harbor, at Maxwell.',
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
    sections: [
      {
        body: ['**Aerial Fields** lies in the south-east of [[etheria]], on the bay. It is the rural part of the country and the smallest region on the map, though not the one with the fewest people.'],
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
      ['Trade', 'Newspapers'],
      ['Put up', euro(STARTING_MONEY)],
    ],
    sections: [
      {
        body: [
          `**Tabby Loid** is a newspaper giant of [[etheria]] and your uncle. He lobbied the government for years to let commercial parties make radio and television, and in 1970 he got his way ([[broadcasting-act]]). He is your first financier: the ${euro(STARTING_MONEY)} a company starts with is his.`,
          'He does not run the company; you do. He takes his share once a year ([[dividends]]), and he lends you his business consultant, [[penny-cash]].',
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
          'If you do, she leads you through [[first-weeks|the first weeks]], one step at a time, with a ring around what to click. After that she only drops by with a word of advice the first time something new comes up, and when the company is in the red. Once the company can pay for it she offers to walk you through a first TV channel the same way ([[television]]); “Not now” is an answer, and she does not ask twice.',
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
          `The public broadcaster kept its channels, and the first television license in every region. Everyone else starts with what they can pay for: for you, that is the ${euro(STARTING_MONEY)} your uncle put up.`,
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
          `The companies that sponsor shows in [[etheria]]: ${list(SPONSOR_NAMES.map((name) => `**${name}**`))}. Their logos are on the offers in the Sales window.`,
          'Which brand makes an offer changes nothing about it: the rate, the audience it prefers and the minimum are what count ([[sponsors]]).',
        ],
      },
    ],
    seeAlso: ['sponsors', 'etheria'],
  },
} satisfies Partial<Record<ArticleId, ArticleText>>;
