// Name pools for generated people, companies, titles and sports (fictional country).

import type { GenreId } from './genres';

export const FIRST_NAMES = [
  'Ada', 'Bram', 'Carla', 'Dex', 'Elena', 'Felix', 'Greta', 'Hugo', 'Iris', 'Jonas',
  'Kira', 'Lars', 'Mila', 'Nico', 'Olga', 'Pim', 'Rosa', 'Sven', 'Tess', 'Udo',
  'Vera', 'Wim', 'Yara', 'Zeno', 'Anouk', 'Bas', 'Cleo', 'Dirk', 'Eva', 'Frank',
  'Gwen', 'Henk', 'Inge', 'Joost', 'Lotte', 'Marco', 'Nina', 'Otto', 'Petra', 'Ruben',
];

export const LAST_NAMES = [
  'Albers', 'Brink', 'Castell', 'Dorn', 'Engel', 'Falk', 'Gerrits', 'Holm', 'Ibsen', 'Jansen',
  'Kessler', 'Lind', 'Moreau', 'Nolan', 'Ostrova', 'Prins', 'Quist', 'Roth', 'Sandberg', 'Tiller',
  'Ulven', 'Vos', 'Wagner', 'Zeller', 'Abbing', 'Bakker', 'Corsten', 'Delmar', 'Eriks', 'Fontaine',
  'Grau', 'Haas', 'Kade', 'Lorenz', 'Marsh', 'Novak', 'Orsini', 'Pauls', 'Reyes', 'Stern',
];

export const RIVAL_NAMES = [
  'Meridian', 'Northstar', 'Beacon', 'Continental', 'Atlas', 'Crown', 'Horizon', 'Sterling',
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

/** The designer's eight sponsors; each has a logo in src/assets/sponsors (see ui/SponsorLogo.tsx). */
export const SPONSOR_NAMES = ['Beerstar', 'Citrus', 'Foodst', 'Ipsum & Ipsum', 'Jupiter', 'Manen', 'Moon Capital', 'Tahoma'];
