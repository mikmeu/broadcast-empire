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
  /**
   * What Uncle Tabby sends when it is reached, on normal (MILESTONES.rewardScale
   * changes it by the difficulty). The dividend milestones bring nothing: the
   * dividends are the score, and they go to him.
   */
  reward: number;
}

/** In the order they are listed on the Milestones screen. */
export const MILESTONE_LIST: readonly Milestone[] = [
  { id: 'onAir', name: 'On the air', description: 'Broadcast your first day.', reward: 5000 },
  { id: 'firstMonth', name: 'One month on the air', description: 'Keep broadcasting for a month.', reward: 10_000 },
  { id: 'firstProfit', name: 'First profitable month', description: 'End a month with more coming in than the company costs to run.', reward: 15_000 },
  { id: 'firstSponsor', name: 'A word from our sponsor', description: 'Sign your first sponsor contract.', reward: 10_000 },
  { id: 'regionNumberOne', name: '#1 radio channel in a region', description: 'Have the most-listened radio channel in any region.', reward: 25_000 },
  { id: 'radioLeader', name: 'Radio market leader', description: 'Have more radio listeners than any rival company.', reward: 50_000 },
  { id: 'everyRegion', name: 'Market leader in all regions', description: 'Be the biggest radio company in every region at once.', reward: 250_000 },
  { id: 'twoRegions', name: 'On the air in two regions', description: 'Broadcast in a second region.', reward: 25_000 },
  { id: 'nationwide', name: 'All of Etheria', description: 'Have one channel on the air in all five regions.', reward: 150_000 },
  { id: 'bigAudience', name: 'A million listeners', description: 'Reach a million radio listeners.', reward: 75_000 },
  { id: 'tvLicense', name: 'A television license', description: 'Buy your first TV license.', reward: 50_000 },
  { id: 'firstTv', name: 'First TV channel', description: 'Put a TV channel on the air.', reward: 50_000 },
  { id: 'tvLeader', name: 'TV market leader', description: 'Have more TV viewers than any rival company.', reward: 150_000 },
  { id: 'fullNetwork', name: 'Full network', description: 'Run as many channels as you are allowed, all on the air.', reward: 250_000 },
  { id: 'householdName', name: 'A household name', description: 'Have a host everybody knows.', reward: 25_000 },
  { id: 'headhunter', name: 'Headhunter', description: 'Sign a host away from a rival.', reward: 10_000 },
  { id: 'firstEvent', name: 'The show must go on', description: 'Stage a concert, gala or telethon of your own.', reward: 15_000 },
  { id: 'prestigious', name: 'Talk of the town', description: 'Earn 100 prestige from your events and awards.', reward: 50_000 },
  { id: 'awardWinner', name: 'And the winner is…', description: 'Win a radio or TV award.', reward: 50_000 },
  { id: 'happyOffice', name: 'A great place to work', description: 'Keep a sizeable staff in high spirits.', reward: 25_000 },
  { id: 'aheadOfItsTime', name: 'Ahead of its time', description: 'Research a technology before its year.', reward: 25_000 },
  { id: 'fullTechTree', name: 'Nothing left to invent', description: 'Research every technology.', reward: 250_000 },
  { id: 'eventBroadcaster', name: 'The whole country is watching', description: 'Hold the TV rights when a World Cup or the Olympics begins.', reward: 100_000 },
  { id: 'firstDividend', name: 'First dividend', description: 'Pay the owners their first dividend.', reward: 0 },
  { id: 'dividendsSmall', name: 'A good investment', description: 'Pay the owners €1 million in dividends.', reward: 0 },
  { id: 'dividendsMedium', name: 'Money machine', description: 'Pay the owners €10 million in dividends.', reward: 0 },
  { id: 'dividendsLarge', name: 'Broadcast empire', description: 'Pay the owners €100 million in dividends.', reward: 0 },
  { id: 'year1980', name: 'Ten years on the air', description: 'Still be broadcasting on 1 January 1980.', reward: 100_000 },
  { id: 'year1990', name: 'Twenty years on the air', description: 'Still be broadcasting on 1 January 1990.', reward: 150_000 },
  { id: 'year2000', name: 'Into the new millennium', description: 'Still be broadcasting on 1 January 2000.', reward: 200_000 },
  { id: 'year2010', name: 'Forty years on the air', description: 'Still be broadcasting on 1 January 2010.', reward: 250_000 },
  { id: 'year2020', name: 'Half a century', description: 'Still be broadcasting on 1 January 2020.', reward: 250_000 },
  { id: 'year2030', name: 'Sixty years of broadcasting', description: 'Still be broadcasting on 1 January 2030.', reward: 250_000 },
];

export function getMilestone(id: MilestoneId): Milestone {
  const milestone = MILESTONE_LIST.find((m) => m.id === id);
  if (!milestone) throw new Error(`Unknown milestone ${id}`);
  return milestone;
}
