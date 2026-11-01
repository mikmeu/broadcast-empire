// Name pools for generated people, companies, titles and sports (fictional country).

import type { GenreId } from './genres';

// Names are a prefix joined to a suffix (issue #92), from the designer's lists. A suffix carries its own space
// where it needs one ("Daily" + " Show"), so a pair is joined exactly as written. Each list has every entry once.

/** The receptionist's name (#155): a player's, with her agreement. The same in every game, not made up. */
export const RECEPTIONIST_NAME = 'Elien Brasser';

/** Given names for women. Names that are for anyone (Charlie, Morgan, Riley, Sam, Harley, Logan) are on both lists. */
export const GIVEN_NAMES_FEMALE: readonly string[] = [
  'Ella', 'Chloe', 'Louise', 'Amelie', 'Nicole', 'Sophia', 'Elise', 'Scarlett', 'Ellie', 'Abbie',
  'Grace', 'Georgia', 'Jessica', 'Erin', 'Charlie', 'Skye', 'Olivia', 'Libby', 'Emma', 'Katherine',
  'Jodie', 'Morgan', 'Faith', 'Isabelle', 'Lily', 'Maddison', 'Aaliyah', 'Cerys', 'Yasmin', 'Mollie',
  'Millie', 'Eleanor', 'Elizabeth', 'Maisie', 'Hannah', 'Sophie', 'Brooke', 'Matilda', 'Madeleine', 'Kate',
  'Zara', 'Hollie', 'Amelia', 'Tilly', 'Lydia', 'Kayleigh', 'Eva', 'Phoebe', 'Isobel', 'Megan',
  'Courtney', 'Ruby', 'Rachel', 'Rosie', 'Chelsea', 'Amber', 'Anna', 'Alice', 'Holly', 'Zoe',
  'Keira', 'Leah', 'Isabella', 'Logan', 'Bethany', 'Abby', 'Melissa', 'Gracie', 'Maya', 'Samantha',
  'Sienna', 'Tia', 'Alisha', 'Jennifer', 'Madison', 'Danielle', 'Harriet', 'Emily', 'Rebecca', 'Alicia',
  'Victoria', 'Evie', 'Freya', 'Laura', 'Mia', 'Eloise', 'Summer', 'Kiera', 'Francesca', 'Daisy',
  'Ava', 'Lucy', 'Sarah', 'Alexandra', 'Abigail', 'Sofia', 'Lilly', 'Tegan', 'Georgina', 'Niamh',
  'Molly', 'Imogen', 'Lara', 'Aimee', 'Charlotte', 'Caitlin', 'Shannon', 'Isabel', 'Katie', 'Paige',
  'Natasha', 'Lola', 'Jasmine', 'Jade', 'Poppy', 'Eve', 'Naomi', 'Lauren', 'Amy', 'Demi',
  'Riley', 'Sam', 'Harley',
];

/** Given names for men. */
export const GIVEN_NAMES_MALE: readonly string[] = [
  'Toby', 'Henry', 'George', 'Tyler', 'Mason', 'Jayden', 'Ewan', 'Dominic', 'Cameron', 'Jamie',
  'Alexander', 'Kian', 'Liam', 'Daniel', 'Matthew', 'Lucas', 'Charlie', 'Connor', 'Dylan', 'Jude',
  'Kai', 'Elliot', 'Aidan', 'Christopher', 'Anthony', 'Jonathan', 'Muhammad', 'Luca', 'Harvey', 'Gabriel',
  'Oscar', 'Joel', 'Max', 'Luke', 'Alfie', 'Declan', 'Thomas', 'Ethan', 'Riley', 'Rhys',
  'Harry', 'Leo', 'Aaron', 'Bradley', 'Oliver', 'Louis', 'Jake', 'Joshua', 'David', 'Charles',
  'Finley', 'Benjamin', 'Jacob', 'Mohammed', 'Isaac', 'Sean', 'Alex', 'Peter', 'Kieran', 'Josh',
  'Joe', 'Leon', 'Jay', 'Hayden', 'William', 'Noah', 'Owen', 'Michael', 'Harley', 'Morgan',
  'Joseph', 'Ryan', 'Archie', 'Samuel', 'Sebastian', 'Nicholas', 'Harrison', 'Ellis', 'Reece', 'Jordan',
  'Corey', 'Jack', 'Brandon', 'John', 'Taylor', 'Sam', 'Zachary', 'Spencer', 'Kyle', 'Mohammad',
  'Andrew', 'Zak', 'Edward', 'Callum', 'Logan', 'Finlay', 'Robert', 'Patrick', 'James', 'Nathan',
  'Louie', 'Adam', 'Ben', 'Evan', 'Scott', 'Billy', 'Tom', 'Lewis', 'Bailey', 'Freddie',
];

/** Last names are one of these, then one of the suffixes, written together ("Koala" + "box"). */
export const LAST_NAME_PREFIX: readonly string[] = [
  'Bikini', 'Wanna', 'Nar', 'Ham', 'Pig', 'Pun', 'Obi', 'Contra', 'In', 'Un', 'Giva', 'Dia', 'Video', 'Pen', 'Pro', 'Inter', 'Hyper',
  'Octo', 'Pan', 'Per', 'Trans', 'Skinny', 'Vart', 'Dog', 'Shed', 'Spot', 'Koala', 'New', 'Trash', 'Foto', 'Pola', 'Giga', 'Mega', 'Tera',
];
export const LAST_NAME_SUFFIX: readonly string[] = [
  'full', 'bottom', 'shed', 'wall', 'lit', 'fuk', 'bene', 'kakka', 'phile', 'like', 'foot', 'berry', 'love', 'house', 'glass', 'hose', 'rama', 'pants',
  'wan', 'box', 'en', 'data', 'pater', 'water', 'cast', 'state', 'vibe', 'block', 'stone', 'name', 'ara', 'time', 'fak', 'fok', 'light', 'vice',
  'load', 'point', 'fart', 'spot', 'plant', 'shrimp', 'air', 'horse', 'koala', 'jock', 'rite', 'bin', 'flute', 'ode', 'dress', 'angle', 'bite', 'case', 'loop',
];

/** Rival shows ("Daily" + " Show"). */
export const SHOW_PREFIX: readonly string[] = ['Daily', 'Music', 'Light', 'Today', 'News', 'Talk', 'Entertainment', 'Top', 'Tip', 'Open Mic'];
export const SHOW_SUFFIX: readonly string[] = [' Show', ' Live', ' Radio', 'radio', ' Now', ' On Air', 'FM', ' Edition', ' Air', ' Program', ' Talk', ' Today', ' News', ' Update'];

/** Rival channels: a prefix for both media, then the suffix of the medium. */
export const CHANNEL_PREFIX: readonly string[] = [
  'Free', '24', 'One', 'Two', 'X', 'Tiger', 'Planet', 'Color', 'North', 'West', 'East', 'Mid', 'Century', 'Good', 'Vibes', 'Peck', 'News', 'Love', 'Stars',
  'Sunshine', 'WW', 'Brain', 'Valley', 'River', 'Mountain', 'Tree', 'Blossom', 'Spice', 'Cow', 'fantasy', 'Past', 'North East', 'Town', 'Tower', 'Clock', 'Music', 'Time',
];
export const RADIO_CHANNEL_SUFFIX: readonly string[] = [
  ' Radio', 'radio', ' FM', ' Station', ' 105', ' 102', ' 98.7', '88.5', ' Music', '-music', ' 24/7', ' Live', ' West', ' 365', ' Hits', ' Central', ' Service', ' Network',
];
export const TV_CHANNEL_SUFFIX: readonly string[] = [' TV', 'TV', ' Central', ' Channel', ' Television', 'tv', ' Service', ' Network'];

/** Rival companies. */
export const COMPANY_PREFIX: readonly string[] = [
  'Picture', 'Wave', 'FM', 'Interactive', 'Media', 'Tele', 'R&R', 'LTR', 'Daily', 'You', 'Flix', 'News', 'Communication', 'Phono', 'Rad', 'Bottom', 'Coin', 'Greedy',
  'Horizon', 'Ground', 'Nicavero', 'Splash', 'Free', 'Culture', 'Liberal', 'Connect', 'Content', 'Value', 'Price', 'Snap', 'Instant', 'Digital', 'Social', 'Ocean',
  'Complete', 'Build', 'Lion', 'Infinity', 'Mind', 'Linked', 'Influence', 'Lighthouse',
];
export const COMPANY_SUFFIX: readonly string[] = [
  ' Media', ' Empire', ' Broadcasting', ' Conglomerate', 'media', ' One', ' Corp', 'cast', 'com', 'zzr', ' Group', ' International', 'land', 'loft', ' Interactive',
  ' Entertainment', ' Multimedia', ' Global', 'World', ' National', ' Worldwide', ' Networks', 'Network', ' Company', ' Channels', ' Studios', ' Limited', 'max', ' Planet',
];

/** Colors a channel logo can have: the game's palette (design/style.md). They are stored in saves, so they are data, not theme tokens. */
export const LOGO_COLORS = ['#6631d2', '#127554', '#ff7979', '#fbb03b', '#0b2a4f', '#ed72a9'];

/** Licensed titles on the content market are named from these pools. */
export const TITLE_NAMES: Partial<Record<GenreId, { first: readonly string[]; second: readonly string[] }>> = {
  movies: {
    first: ['The Last', 'Midnight', 'Silent', 'Golden', 'Red', 'Distant', 'Broken', 'Wild', 'The Long', 'Lonely', 'Crimson', 'Northern'],
    second: ['Horizon', 'Express', 'River', 'Summer', 'Heist', 'Frontier', 'Goodbye', 'Detective', 'Mountain', 'Harbour', 'Stranger', 'Road'],
  },
  series: {
    first: ['The', 'Station', 'Harbour', 'County', 'Precinct', 'Castle', 'Palace', 'Island'],
    second: ['Doctors', 'Detectives', 'Street', 'Hospital', 'Agents', 'Family', 'Lawyers', 'Patrol'],
  },
  documentary: {
    first: ['Wonders of', 'Secrets of', 'Life in', 'The Story of', 'Journey to', 'Inside'],
    second: ['the Ocean', 'the Desert', 'Ancient Rome', 'the Arctic', 'the Jungle', 'Space', 'the City', 'Flight'],
  },
  musicVideos: { first: ['Hit Clips', 'Video Pack', 'Pop Vision', 'Rock Clips'], second: ['Vol. 1', 'Vol. 2', 'Vol. 3', 'Gold', 'Summer', 'Winter'] },
  teleshopping: { first: ['Shopping', 'Bargain', 'Home'], second: ['Hour', 'Channel', 'Show'] },
  cartoons: {
    first: ['Captain', 'Little', 'Super', 'The Amazing', 'Professor', 'Mister', 'Space', 'Funny'],
    second: ['Bunny', 'Robots', 'Penguins', 'Moose', 'Dinosaurs', 'Ducks', 'Pirates', 'Monsters'],
  },
};

export const SPORTS_LEAGUES = [
  'National Football League',
  'Cup Football',
  'Grand Prix Racing',
  'Tennis Open',
  'Cycling Tour',
  'Ice Hockey League',
  'Athletics Championships',
  'Basketball League',
];

/** Who takes a studio on (0.20.0, #148): a kind of tenant, the medium of the studio, and the first year such a tenant exists. */
export const TENANTS: readonly { name: string; medium: 'radio' | 'tv'; from: number }[] = [
  { name: 'a jingle maker', medium: 'radio', from: 1950 },
  { name: 'an advertising agency', medium: 'radio', from: 1950 },
  { name: 'a record label', medium: 'radio', from: 1950 },
  { name: 'a drama society', medium: 'radio', from: 1950 },
  { name: 'a podcaster', medium: 'radio', from: 2005 },
  { name: 'a language school', medium: 'radio', from: 1980 },
  { name: 'an advertising agency', medium: 'tv', from: 1950 },
  { name: 'a film school', medium: 'tv', from: 1960 },
  { name: 'a commercials producer', medium: 'tv', from: 1950 },
  { name: 'a music video maker', medium: 'tv', from: 1981 },
  { name: 'a web video company', medium: 'tv', from: 2006 },
];

/** The designer's sponsors; each has a logo in src/assets/sponsors (see ui/SponsorLogo.tsx). */
export const SPONSOR_NAMES = [
  'Beerstar',
  'Citrus',
  'Foodst',
  'Ipsum & Ipsum',
  'Jupiter',
  'Manen',
  'Moon Capital',
  'Tahoma',
  'Voltamax Energy',
  'Dreamscape Holidays',
  'SafeSure Insurance',
  'Ferro Motors',
];
