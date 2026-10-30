// Breaking news (0.20.0, #21): the stories the world can break. All are made up and none names a real person or
// country. A story with a year range is the news of its time and is told once per game; one without can come again,
// in another place. Serious stories are told plainly; light ones may be funny. A major story is bigger news than a minor
// one (see BREAKING in balance.ts). The headline may hold {place} (a neighbouring country), {kingdom} (a neighbour
// that has a king or queen), {landmark} and {name} (a famous person with a made-up name; see sim/breakingNews.ts).

export interface StorySpec {
  id: string;
  /** The first and last year it can break in; none for a story that fits any time. */
  from?: number;
  to?: number;
  major: boolean;
  /** Light stories may be funny; serious ones never are. */
  light: boolean;
  headline: string;
}

/** The countries the west and south of Etheria border on (not in lore.md, which is Mike's). */
export const NEIGHBOURS: readonly string[] = ['Valvenia', 'Ohmark', 'Tuneland', 'Baudia'];

/** The neighbours that are monarchies, for a royal wedding. */
export const KINGDOMS: readonly string[] = ['the Kingdom of Valvenia', 'the Grand Duchy of Ohmark'];

/** The landmarks of the regions (lore.md), for a fire. */
export const LANDMARKS: readonly string[] = ['Reality Square', 'Nipkow Central Station', 'Transponder Technical University', 'the Mer Doché Hotel', 'the statue of the happy man in the Aeia fields'];

const s = (id: string, years: [number, number] | null, size: 'major' | 'minor', tone: 'serious' | 'light', headline: string): StorySpec => ({
  id,
  ...(years && { from: years[0], to: years[1] }),
  major: size === 'major',
  light: tone === 'light',
  headline,
});

export const BREAKING_STORIES: readonly StorySpec[] = [
  // The 1970s
  s('antiWarProtest', [1970, 1975], 'minor', 'serious', 'Thousands march against the war overseas: students and flower-wearers fill the squares.'),
  s('secretTapes', [1972, 1979], 'major', 'serious', 'Secret tapes from the minister’s office are leaked: a political scandal reaches the top.'),
  s('firstSerialKiller', [1973, 1979], 'major', 'serious', 'Police hunt a killer who has struck in three counties: people lock their doors at night.'),
  // The 1980s
  s('spaceShuttle', [1981, 1989], 'major', 'light', 'A space plane lifts off and lands again: the first shuttle flight is a success.'),
  s('gameConsole', [1980, 1989], 'minor', 'light', 'Pac-Muncher, a yellow circle that eats dots, sells out in every shop: the arcades are full.'),
  s('musicVideos', [1981, 1989], 'minor', 'light', 'A channel plays nothing but music videos, all day long: parents are not sure.'),
  s('twistyCube', [1980, 1989], 'minor', 'light', 'The Twisty Cube has the whole country twisting: millions are stuck on a toy with six colours.'),
  // The 1990s
  s('internetDebut', [1991, 1999], 'major', 'light', 'The internet comes to the living room: a letter can now cross the world in a second.'),
  s('unionCollapse', [1990, 1993], 'major', 'serious', 'The great eastern union breaks up: new countries appear on the map overnight.'),
  s('emissionsTreaty', [1992, 1999], 'minor', 'serious', 'Nations sign a treaty to cut emissions: the first deal to slow the warming of the world.'),
  // The 2000s
  s('millenniumBug', [1999, 2000], 'major', 'light', 'Will the clocks stop at midnight? The millennium bug has banks and airports checking their computers.'),
  s('spaceStation', [2000, 2002], 'minor', 'light', 'The first crew moves into the space station: the home with the best view in the world.'),
  s('terrorAttack', [2001, 2009], 'major', 'serious', 'Terrorist attacks shock the world: the news is on every screen and every radio.'),
  s('iPip', [2001, 2007], 'minor', 'light', 'The iPip, a pocket player that holds a thousand songs, goes on sale: queues round the block.'),
  s('socialMedia', [2004, 2009], 'minor', 'light', 'A new website lets friends share their lives online: social media has arrived.'),
  s('streamingFirst', [2005, 2009], 'minor', 'light', 'Films and series on demand, over the internet: streaming is here.'),
  s('financialCrisis', [2007, 2009], 'major', 'serious', 'Banks fail one after another: a financial crisis spreads around the world.'),
  s('medicalBreakthrough', [2000, 2009], 'major', 'serious', 'Doctors announce a breakthrough: a new treatment holds back a deadly virus.'),
  s('plutoDemoted', [2006, 2006], 'minor', 'light', 'Pluto is no longer a planet: astronomers vote it out, and schoolbooks must be redrawn.'),
  // The 2010s
  s('firstSmartphone', [2010, 2015], 'major', 'light', 'A phone with no buttons and a touch screen goes on sale: the smartphone is here.'),
  s('hottestRecord', [2010, 2019], 'minor', 'serious', 'The hottest and driest summer on record: rivers run low and farmers pray for rain.'),
  s('climateTeen', [2018, 2019], 'minor', 'serious', 'A teenager’s school strike for the climate spreads to cities across the world.'),
  s('caveRescue', [2010, 2019], 'major', 'serious', 'Twelve children and their coach are rescued from a flooded cave: the world held its breath.'),
  // The 2020s
  s('pandemic', [2020, 2029], 'major', 'serious', 'A new virus spreads around the world: borders close, schools shut and people stay home.'),
  s('aiFounded', [2020, 2029], 'minor', 'light', 'A machine that writes like a person: artificial intelligence goes to work.'),
  // At any time
  s('actorDies', null, 'major', 'serious', 'The film world mourns {name}, the actor a whole generation grew up watching, who has died.'),
  s('singerDies', null, 'major', 'serious', '{name}, the singer whose songs everyone knows, has died: radio stations play nothing else.'),
  s('spaceDiscovery', null, 'minor', 'light', 'Astronomers find a new planet circling a star close to home: nobody has packed yet.'),
  s('independence', null, 'minor', 'serious', 'A region of {place} declares its independence: there is dancing in the capital.'),
  s('assassinationAttempt', null, 'major', 'serious', 'An attempt on the life of a leader in {place} has failed: the country is shaken.'),
  s('outbreak', null, 'minor', 'serious', 'An outbreak of fever in {place}: doctors tell people to wash their hands.'),
  s('earthquake', null, 'major', 'serious', 'An earthquake in {place} brings buildings down: rescuers search the ruins.'),
  s('tornado', null, 'minor', 'serious', 'A tornado cuts through the fields of the east: roofs fly and barns are gone.'),
  s('volcano', null, 'major', 'serious', 'A volcano in {place} erupts: ash closes the airports.'),
  s('royalWedding', null, 'minor', 'light', 'A royal wedding in {kingdom}: crowds line the streets for the bride and groom.'),
  s('landmarkFire', null, 'major', 'serious', '{landmark} is on fire: firefighters fight the flames through the night.'),
  s('mineCollapse', null, 'major', 'serious', 'A mine in the Amplify Hills has collapsed: rescuers dig for the miners.'),
  s('floods', null, 'minor', 'serious', 'Heavy rain floods the coast: the roads are shut and the bay is brown.'),
  s('snowInJuly', null, 'minor', 'light', 'Snow in the Meucci Desert: camels are said to be furious.'),
  s('eclipse', null, 'minor', 'light', 'The sun goes dark at noon: an eclipse crosses the country, and the birds go to bed.'),
  s('comet', null, 'minor', 'light', 'A comet lights up the night sky: if you see it, you will not see it again for a lifetime.'),
  s('cowMayor', null, 'minor', 'light', 'A village elects a cow as mayor: the cow has not yet made a statement.'),
  s('giantPumpkin', null, 'minor', 'light', 'A farmer in the Aerial Fields grows the largest pumpkin on record: it is bigger than his car.'),
  s('catOnMast', null, 'minor', 'light', 'A cat has been stuck on a transmitter mast for three days: the whole country is watching.'),
  s('treasureInLake', null, 'minor', 'light', 'Divers find a chest of old coins in Byte Lake: the lake says it was never told.'),
  s('lostPainting', null, 'minor', 'light', 'A lost painting is found in an attic: the family used it to cover a hole in the wall.'),
  s('footballTransfer', null, 'minor', 'light', 'A famous striker moves to a rival club for a record sum: the fans are split, and so is his shirt.'),
  s('worldRecord', null, 'minor', 'light', 'A baker in Newcast bakes the longest loaf in the world: it needed three ovens and a train.'),
  s('strikeBakers', null, 'minor', 'serious', 'The bakers go on strike: there is no bread in the shops of the capital this morning.'),
  s('newSpecies', null, 'minor', 'light', 'A new kind of frog is found in Buch Wildlife Park: it is the size of a coin and very loud.'),
  s('storm', null, 'major', 'serious', 'A great storm sweeps the north coast: ferries are stopped and trees are down.'),
  s('oldestWoman', null, 'minor', 'light', 'The oldest person in Etheria turns 110: her secret is a daily spoonful of Aeia.'),
  s('bridgeOpens', null, 'minor', 'light', 'The longest bridge in the country opens: the first car across was the mayor’s, and it broke down.'),
  s('trainStuck', null, 'minor', 'serious', 'A train is stuck in the snow near the Amplify Hills: a thousand passengers wait for help.'),
  s('bankRobbery', null, 'minor', 'serious', 'Armed robbers hit a bank in the city: the police have closed the centre.'),
  s('lostPenguin', null, 'minor', 'light', 'A penguin is found on the beach at Skywave: nobody knows where it came from, or why it is wearing a scarf.'),
];

/** The breaking stories that go with the elections and the sports events of the calendar (sim/events.ts). */
export const ELECTION_STORIES = {
  fall: 'The government of {president} falls: a snap election is called.',
  pollingDay: 'Polling day: the country votes, and the first count is in.',
};

/** One drama in each World Cup and Olympics. */
export const SPORTS_DRAMAS = {
  worldCup: 'A goal in the last minute decides a World Cup match: the whole country is on its feet.',
  olympics: 'A world record falls at the Olympics: the stadium is on its feet.',
} as const;
