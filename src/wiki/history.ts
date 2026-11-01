// The wiki's articles about Etheria's past and its ways of travelling: the
// history of the country, the railways, the harbour and the two airports. The
// facts are the designer's (lore.md). What happens after 1970 shows only once
// the game that is open has reached that year.

import { toCalendarDate } from '../sim/calendar';
import type { ArticleText, Block } from './types';

/**
 * Lore that has not happened yet at the start of a game: it shows once the open
 * game has reached that year, and never before one is open (nor in search).
 */
export const fromYear = (year: number, blocks: readonly Block[]): Block => ({
  asOf: (day) => (day !== null && toCalendarDate(day).year >= year ? blocks : []),
});

export const HISTORY_ARTICLES = {
  'etheria-history': {
    title: 'History of Etheria',
    category: 'lore',
    summary: 'From dozens of small states to one republic, and a love of committees.',
    facts: [
      ['Republic since', '1769'],
      ['Founded at', 'The Congress of Turing'],
      ['Kind of state', 'Federal republic'],
      ['Regions', 'Five, each semi-autonomous'],
    ],
    sections: [
      {
        body: [
          'The Republic of [[etheria]] is a federal republic in the heart of the Union. Since 1769 the country has had five semi-autonomous regions: [[coaxia]], [[amplify-hills]], [[skywave-beach]], [[transponder-valley]] and [[aerial-fields]]. Today it is known for a strong economy, a wide network of [[railways|railways, roads and airports]], questionable corporate influence ([[brands]]) and the national belief that every problem can be solved by forming a committee.',
        ],
      },
      {
        heading: 'Before the republic',
        body: [
          'Before 1769 the land was divided among dozens of kingdoms, duchies, counties and principalities, and one short-lived republic that is said to have fallen after its government spent six months debating the design of its flag.',
          'In the seventeenth and eighteenth centuries the region was plagued by border disputes, trade quarrels and the odd war over matters that historians now call “surprisingly minor”. Skywave and the other coastal states prospered through trade. The states of the interior often struggled to work together.',
        ],
      },
      {
        heading: 'The Congress of Turing',
        body: [
          'The republic came out of the Congress of Turing in 1769. The economy had stagnated and the neighbouring powers were pressing, so the rulers agreed to give up their own states and form a single federal republic. It was meant to bring stability, help trade and cut the number of customs posts a traveller met in one afternoon.',
          'The union was a success, though some former nobles went on calling themselves kings and dukes for decades. Some of their descendants are said to do so still.',
          'The five regions kept a lot of power, so most decisions can be argued at both the regional and the national level. Supporters call this a healthy balance. Critics call it a dependable way to turn a two-week project into a two-year project. The government of today is described under [[etheria]].',
        ],
      },
      {
        heading: 'The modern republic',
        body: [
          'The nineteenth century brought fast industry. [[railways|Railways]], factories, ports and later airports joined regions that had spent centuries treating one another as foreign countries. See [[maxwell-harbor]], [[coax-airport]] and [[newcast-airport]].',
          'In the twentieth century the economy kept growing, powerful national companies rose and the mass media appeared, from the radio of [[epb]] onwards. A habit grew with them: every big scandal leads to an inquiry, then a package of reforms, then a second scandal.',
          'Etheria is now one of the richest and most influential republics in the Union. Its people enjoy a high standard of living and good public services, and are able to complain about both at once. The game begins on 1 January 1970, the day of the [[broadcasting-act|law]] that opened the airwaves.',
        ],
      },
    ],
    seeAlso: ['etheria', 'railways', 'epb', 'broadcasting-act'],
  },

  railways: {
    title: 'Railways of Etheria',
    category: 'lore',
    summary: 'Over a century of companies, mergers and renamings, and three monopolies in a trench coat.',
    facts: [
      ['First line', '1839, Coax City to Turing'],
      ['Biggest hub', 'Nipkow Central'],
      ['Run by', 'Private companies and the state railway association'],
    ],
    sections: [
      {
        body: [
          'The first railway in [[etheria]] opened in 1839, between Coax City and Turing, run by the Coax City-Turing Transportation Foundation (CCTF). It began as a non-profit and was so successful that two years later it reached Barbara in the south and Apfel in the north. By then the line ran through [[amplify-hills]], where the stations are still busy: see Nipkow Central.',
        ],
      },
      {
        heading: 'Too many railways',
        body: [
          'Interrail Maxwell Corporation (I-Max) was founded in 1842 to join Maxwell and Bling. The Yaht-Bling Line (YBL) and the Bell-Tone-Ring Line (BTRL) soon followed. By the middle of the 1850s a patchwork of companies had linked almost every large settlement in the country.',
          'The railways had been built with far more enthusiasm than planning. Some companies underestimated the cost of upkeep. Others bought locomotives that struggled with mountains, deserts, corners or, in a few cases, moving at all.',
          'The first big casualty was the Nipkow North Railway (NNR), bankrupt in 1860. To keep [[transponder-valley]] from being cut off, the government set up the National Etherian Railway Association (NERA) and built another line between Bell and Maxwell. Passengers disliked it: it was much slower and left out the mountain views. In the end the government reopened the old line at a higher fare, which proves that people will pay extra for a view.',
        ],
      },
      {
        heading: 'I-Max and the Anti-Monopoly Act',
        body: [
          'While the state railway grew, the private ones suffered. In 1864 CCTF sued the government for “unfair competition” from NERA. It lost badly, and was left short of cash and open to a takeover by I-Max.',
          'I-Max became the leading operator. It bought up others and ran fast trains between the biggest cities, with fewer to the small towns. Passengers complained, shareholders cheered and profits rose. By 1869 I-Max held more than 85% of the railway market.',
          'Worried that a railway company might become stronger than the government, the senate and the house passed the Anti-Monopoly Act of 1869. It limits a company to 50% of the market in any industry. I-Max was split in 1870 into MaxNorth and MaxSouth.',
        ],
      },
      {
        heading: 'A new name every few years',
        body: [
          'The decades after were mergers, new names and doubtful business decisions. The best known is NipNewCo, which in 1901 renamed itself Etherian Eagle after a new CEO declared that eagles were “the future of transportation”. It was bankrupt in under a year. NERA ran its routes for a while with hired rolling stock and a great deal of optimism, until a lasting successor, Etherian Eastern, was founded in 1903.',
          'The twentieth century was spent changing names while staying much the same. MaxNorth became Skyponder Railways, briefly called itself NORTHERN, and went back when customers did not notice. MaxSouth took the more respectable name Southern Etherian Railway Company (SERC).',
          'By the 1950s many passengers suspected that the companies had stopped competing. They shared trains, engineers, timetables and sometimes managers. Critics called it “three monopolies wearing a trench coat”.',
          'In the 1960s inquiries found decades of corruption, favours and bad bookkeeping, in the railway companies and in NERA itself. Trust collapsed. Riots, strikes and scandals followed.',
          fromYear(1972, [
            'In 1972 NERA was rebuilt as the Etherian Transportation Foundation (ETF), with the task of taking the country’s buses and railways into public hands. The change was chaotic. Too few staff, too much doubt and many resignations made a train journey an adventure few passengers had chosen.',
          ]),
          fromYear(1977, [
            'By 1977 ETF ran every train in Etheria. To keep corruption out, the upkeep of track and stations went to a body of its own, the Etherian Transport Maintenance Foundation (ETMF).',
          ]),
          fromYear(1979, [
            'The last private operators lived on through bus services and station shops. In 1979 the old rivals Skyponder and SERC joined as TransEtheria, ending over a century of competition between railways and starting a new age of arguing about bus timetables.',
          ]),
        ],
      },
      {
        heading: 'For a broadcaster',
        body: [
          'None of this changes a rule of the game. The Anti-Monopoly Act is about the railways of 1869. It does not stop a channel from winning the biggest audience ([[market-leader]]).',
        ],
      },
    ],
    seeAlso: ['etheria-history', 'etheria', 'maxwell-harbor', 'amplify-hills', 'market-leader'],
  },

  'maxwell-harbor': {
    title: 'Maxwell International Harbor',
    category: 'lore',
    summary: 'The biggest seaport in Etheria, and the reason Maxwell is a city.',
    facts: [
      ['Where', 'Maxwell, Skywave Beach'],
      ['Building began', '1818'],
      ['First docks', '1822'],
      ['Landmark', 'The Titan Crane, 1938'],
      ['Harbor Authority Director', 'Marina Dockwell'],
    ],
    sections: [
      {
        body: [
          '**Maxwell International Harbor** is the largest seaport in [[etheria]] and one of the busiest in the Union. It lies on the coast at Maxwell, in [[skywave-beach]], and is the country’s main gateway for foreign trade, with millions of tons of cargo a year.',
          'Work began in 1818, when local merchants decided that loading goods on ships was much more efficient than carrying them across the country by horse. The first docks were done in 1822 and soon drew traders from all over the Union. In the century after, the harbour grew again and again, often because ships had become bigger than the engineers expected.',
        ],
      },
      {
        heading: 'Today',
        body: [
          'The harbour now has dozens of terminals for containers, bulk cargo, passenger ferries and fishing, and for various activities that customs officers prefer not to discuss in public. It is closely tied to the [[railways|railways]] and the roads, which makes it a vital centre of the economy. Historians give the harbour most of the credit for turning Maxwell from a modest coastal town into a large city.',
          'It has always had fierce competition from other ports in the Union. Its usual answer is bigger docks, taller cranes and bolder advertising. A local joke says every citizen of Maxwell works in the harbour, knows someone who does, or is waiting for something that is stuck in it.',
        ],
      },
      {
        heading: 'The Titan Crane',
        body: [
          'The best-known sight is the Titan Crane, a huge loading crane finished in 1938. It was meant for cargo, but it is now one of the most photographed structures in Etheria, and is on more postcards than several real tourist attractions.',
        ],
      },
      {
        heading: 'In its own words',
        body: ['“If it exists somewhere in the world, there’s a good chance it passed through Maxwell at least once.”', '— Marina Dockwell, Harbor Authority Director'],
      },
    ],
    seeAlso: ['skywave-beach', 'railways', 'etheria-history', 'coax-airport'],
  },

  'coax-airport': {
    title: 'Coax International Airport',
    category: 'lore',
    summary: 'The biggest airport in Etheria, and the home of its national airline.',
    facts: [
      ['Known as', 'CIA'],
      ['Where', 'Just outside Coax City'],
      ['Opened', '1937'],
      ['Airline', 'EtherAir'],
      ['Landmark', 'The Grand Terminal Hall, 1968'],
      ['Airport Director', 'Amelia Runway'],
    ],
    sections: [
      {
        body: [
          '**Coax International Airport** (CIA) is the largest airport in [[etheria]] and its main gateway to the rest of the Union and beyond. It lies just outside Coax City, in [[coaxia]], handles most of the country’s international passengers and is the main hub of the national airline, EtherAir.',
          'It opened in 1937, after officials decided that trains, ships and optimism alone could not carry a growing economy. It began with one runway, a control tower and a building that newspapers of the day called “adequate”. It has grown steadily ever since.',
        ],
      },
      {
        heading: 'Today',
        body: [
          'The airport flies to places all over the Union and has direct flights to several other continents. Its best-known feature is the Grand Terminal Hall, a vast glass building finished in 1968 that won several prizes for architecture and almost as many complaints about upkeep.',
          'Business travellers have often voted it the best airport in Etheria, mostly because it is the only one where you can change flights without running. Its unofficial motto, made up by passengers and not by the management, is: “At least you’re already in the right city.”',
        ],
      },
      {
        heading: 'In its own words',
        body: [
          '“When people think of Etheria, we want Coax International to be their first impression. Preferably before they start complaining about baggage claim.”',
          '— Amelia Runway, Airport Director',
        ],
      },
    ],
    seeAlso: ['coaxia', 'newcast-airport', 'maxwell-harbor', 'railways'],
  },

  'newcast-airport': {
    title: 'Newcast International Airport',
    category: 'lore',
    summary: 'The second airport of Etheria: cheap flights and questionable life choices.',
    facts: [
      ['Known as', 'NIA'],
      ['Where', 'Outside Newcast, Aerial Fields'],
      ['Opened', '1958, as a military airfield'],
      ['Known for', 'Low-cost carriers and holiday flights'],
      ['CEO of Newcast Airport Holdings', 'Barry Bargain'],
    ],
    sections: [
      {
        body: [
          '**Newcast International Airport** (NIA) is the second-largest airport in [[etheria]]. It is the leading hub for low-cost airlines, holiday flights and questionable life choices booked at 2 a.m. It lies outside Newcast, in [[aerial-fields]].',
          'It began in 1958 as a military airfield and went over to civilian use a few years later. When air travel boomed, it became the favourite of travellers on a budget and of airlines that wanted lower costs.',
        ],
      },
      {
        heading: 'Cheap flights',
        body: [
          'The airport offers some of the cheapest flights in the Union. Critics say the low prices sometimes cost comfort, convenience and arriving in the city on the ticket. By the end of the 1960s Newcast was nicknamed “The People’s Airport”, though the other airports preferred “The Discount Runway”.',
          'Its terminals value speed over luxury. You can usually get from the entrance to your gate in under ten minutes, if you can find your way through the maze of duty-free advertising.',
          'In 1967 it won the Union Aviation Award for “Highest Passenger Growth”. The year after, it was given the less coveted “Most Lost Luggage Per Square Metre”. Millions still choose it every year, which shows that people will put up with a lot of trouble for a cheaper ticket.',
        ],
      },
      {
        heading: 'In its own words',
        body: ['“Why pay more to arrive at the same destination?”', '— Barry Bargain, CEO of Newcast Airport Holdings'],
      },
    ],
    seeAlso: ['aerial-fields', 'coax-airport', 'maxwell-harbor', 'railways'],
  },
} satisfies Partial<Record<string, ArticleText>>;
