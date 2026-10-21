// Milestones (prompt.md section 2): there is no win condition, so these mark
// progress. What it takes to reach each one is checked in sim/milestones.ts;
// the thresholds are in MILESTONES in balance.ts.

export type MilestoneId =
  | 'onAir'
  | 'firstMonth'
  | 'firstProfit'
  | 'firstSponsor'
  | 'regionNumberOne'
  | 'radioLeader'
  | 'everyRegion'
  | 'twoRegions'
  | 'nationwide'
  | 'bigAudience'
  | 'tvLicense'
  | 'firstTv'
  | 'tvLeader'
  | 'fullNetwork'
  | 'householdName'
  | 'headhunter'
  | 'firstEvent'
  | 'prestigious'
  | 'awardWinner'
  | 'happyOffice'
  | 'aheadOfItsTime'
  | 'fullTechTree'
  | 'eventBroadcaster'
  | 'firstDividend'
  | 'dividendsSmall'
  | 'dividendsMedium'
  | 'dividendsLarge'
  | 'year1980'
  | 'year1990'
  | 'year2000'
  | 'year2010'
  | 'year2020'
  | 'year2030';

export interface Milestone {
  id: MilestoneId;
  name: string;
  /** What the player has to do, shown before and after it is reached. */
  description: string;
  /** Uncle Tabby's thanks in the e-mail for it, in the first person; the amount he wired is added after it. */
  thanks: string;
  /**
   * What Uncle Tabby sends when it is reached, on normal (MILESTONES.rewardScale
   * changes it by the difficulty). The dividend milestones bring nothing: the
   * dividends are the score, and they go to him.
   */
  reward: number;
}

/** In the order they are listed on the Milestones screen. */
export const MILESTONE_LIST: readonly Milestone[] = [
  { id: 'onAir', name: 'On the air', description: 'Broadcast your first day.', thanks: 'You are on the air. I told your aunt you would be, and she did not believe me. Thank you for proving me right.', reward: 5000 },
  { id: 'firstMonth', name: 'One month on the air', description: 'Keep broadcasting for a month.', thanks: 'A month already, and still going. Most people give up before the first invoice. Thank you for sticking with it.', reward: 10_000 },
  { id: 'firstProfit', name: 'First profitable month', description: 'End a month with more coming in than the company costs to run.', thanks: 'A month in the black. I framed the figures, and your aunt has seen them. Thank you for making an old man proud.', reward: 15_000 },
  { id: 'firstSponsor', name: 'A word from our sponsor', description: 'Sign your first sponsor contract.', thanks: 'Someone is paying you to be heard. That is how this business starts. Thank you, and mind the small print.', reward: 10_000 },
  { id: 'regionNumberOne', name: '#1 radio channel in a region', description: 'Have the most-listened radio channel in any region.', thanks: 'The best-loved channel in a region, and it is yours. The whole family has been listening. Thank you.', reward: 25_000 },
  { id: 'radioLeader', name: 'Radio market leader', description: 'Have more radio listeners than any rival company.', thanks: 'No rival has more listeners than you. I had to sit down when I read it. Thank you for the best news of my year.', reward: 50_000 },
  { id: 'everyRegion', name: 'Market leader in all regions', description: 'Be the biggest radio company in every region at once.', thanks: 'Every region listens to you first. I never dared hope for it. Thank you, truly.', reward: 250_000 },
  { id: 'twoRegions', name: 'On the air in two regions', description: 'Broadcast in a second region.', thanks: 'A second region, and the signal reaches further than my garden shed. Thank you for thinking bigger.', reward: 25_000 },
  { id: 'nationwide', name: 'All of Etheria', description: 'Have one channel on the air in all five regions.', thanks: 'All of Etheria can hear you. I drove around the country with the radio on to check. Thank you.', reward: 150_000 },
  { id: 'bigAudience', name: 'A million listeners', description: 'Reach a million radio listeners.', thanks: 'A million people are listening. I have counted the zeros twice. Thank you for making them listen.', reward: 75_000 },
  { id: 'tvLicense', name: 'A television license', description: 'Buy your first TV license.', thanks: 'A television license in your name. In my day we only dreamed of pictures. Thank you for taking the plunge.', reward: 50_000 },
  { id: 'firstTv', name: 'First TV channel', description: 'Put a TV channel on the air.', thanks: 'Your first picture is on the screen, and I watched it twice. Thank you for a proud evening.', reward: 50_000 },
  { id: 'tvLeader', name: 'TV market leader', description: 'Have more TV viewers than any rival company.', thanks: 'More viewers than any rival, and I saw it with my own eyes. Thank you.', reward: 150_000 },
  { id: 'fullNetwork', name: 'Full network', description: 'Run as many channels as you are allowed, all on the air.', thanks: 'Every channel you are allowed, all on the air. That is a network, not a hobby. Thank you for the honour.', reward: 250_000 },
  { id: 'householdName', name: 'A household name', description: 'Have a host everybody knows.', thanks: 'Your host is a name everybody knows. Even the milkman talked about them this morning. Thank you.', reward: 25_000 },
  { id: 'headhunter', name: 'Headhunter', description: 'Sign a host away from a rival.', thanks: 'You took a host from a rival. Bold, and a little cheeky, and I loved it. Thank you.', reward: 10_000 },
  { id: 'firstEvent', name: 'The show must go on', description: 'Stage a concert, gala or telethon of your own.', thanks: 'Your own show, with an audience and everything. I bought a ticket anyway. Thank you for a lovely night.', reward: 15_000 },
  { id: 'prestigious', name: 'Talk of the town', description: 'Earn 100 prestige from your events and awards.', thanks: 'People are talking about you in town. I did not even have to start the rumour. Thank you.', reward: 50_000 },
  { id: 'awardWinner', name: 'And the winner is…', description: 'Win a radio or TV award.', thanks: 'You won an award! It is on my mantelpiece in my mind. Thank you for making me so proud.', reward: 50_000 },
  { id: 'happyOffice', name: 'A great place to work', description: 'Keep a sizeable staff in high spirits.', thanks: 'A happy office is worth more than a full one. I can tell that you look after your people. Thank you.', reward: 25_000 },
  { id: 'aheadOfItsTime', name: 'Ahead of its time', description: 'Research a technology before its year.', thanks: 'You researched it before its time. The world will catch up with you. Thank you for leading the way.', reward: 25_000 },
  { id: 'fullTechTree', name: 'Nothing left to invent', description: 'Research every technology.', thanks: 'Nothing left to invent, you say. I would not have believed it of a man who still uses a pencil. Thank you.', reward: 250_000 },
  { id: 'eventBroadcaster', name: 'The whole country is watching', description: 'Hold the TV rights when a World Cup or the Olympics begins.', thanks: 'The whole country is watching your channel. Mind the cameras, I am waving. Thank you.', reward: 100_000 },
  { id: 'firstDividend', name: 'First dividend', description: 'Pay the owners their first dividend.', thanks: 'Your first dividend has reached the family. Thank you. Your aunt has already planned a holiday.', reward: 0 },
  { id: 'dividendsSmall', name: 'A good investment', description: 'Pay the owners €1 million in dividends.', thanks: 'A million to the owners. The family is grateful, and so am I. Thank you for a good investment.', reward: 0 },
  { id: 'dividendsMedium', name: 'Money machine', description: 'Pay the owners €10 million in dividends.', thanks: 'Ten million paid out. You are a money machine, and I mean it kindly. Thank you.', reward: 0 },
  { id: 'dividendsLarge', name: 'Broadcast empire', description: 'Pay the owners €100 million in dividends.', thanks: 'A hundred million. A broadcast empire, as I always said. Thank you from all of us.', reward: 0 },
  { id: 'year1980', name: 'Ten years on the air', description: 'Still be broadcasting on 1 January 1980.', thanks: 'Ten years on the air. Many have come and gone, and you are still here. Thank you.', reward: 100_000 },
  { id: 'year1990', name: 'Twenty years on the air', description: 'Still be broadcasting on 1 January 1990.', thanks: 'Twenty years on the air. I have grown old listening, and I would not change a day. Thank you.', reward: 150_000 },
  { id: 'year2000', name: 'Into the new millennium', description: 'Still be broadcasting on 1 January 2000.', thanks: 'A new millennium, and you are still on the air. Thank you for carrying us through.', reward: 200_000 },
  { id: 'year2010', name: 'Forty years on the air', description: 'Still be broadcasting on 1 January 2010.', thanks: 'Forty years on the air. I am too old to keep count, so thank you for keeping it for me.', reward: 250_000 },
  { id: 'year2020', name: 'Half a century', description: 'Still be broadcasting on 1 January 2020.', thanks: 'Half a century of broadcasting. I raise my teacup to you. Thank you.', reward: 250_000 },
  { id: 'year2030', name: 'Sixty years of broadcasting', description: 'Still be broadcasting on 1 January 2030.', thanks: 'Sixty years of broadcasting. I could not be prouder, and I have run out of ways to say it. Thank you.', reward: 250_000 },
];

export function getMilestone(id: MilestoneId): Milestone {
  const milestone = MILESTONE_LIST.find((m) => m.id === id);
  if (!milestone) throw new Error(`Unknown milestone ${id}`);
  return milestone;
}
