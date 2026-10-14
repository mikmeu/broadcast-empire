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
}

/** In the order they are listed on the Milestones screen. */
export const MILESTONE_LIST: readonly Milestone[] = [
  { id: 'onAir', name: 'On the air', description: 'Broadcast your first day.' },
  { id: 'firstMonth', name: 'One month on the air', description: 'Keep broadcasting for a month.' },
  { id: 'firstProfit', name: 'First profitable month', description: 'End a month with more coming in than the company costs to run.' },
  { id: 'firstSponsor', name: 'A word from our sponsor', description: 'Sign your first sponsor contract.' },
  { id: 'regionNumberOne', name: '#1 radio channel in a region', description: 'Have the most-listened radio channel in any region.' },
  { id: 'radioLeader', name: 'Radio market leader', description: 'Have more radio listeners than any rival company.' },
  { id: 'everyRegion', name: 'Market leader in all regions', description: 'Be the biggest radio company in every region at once.' },
  { id: 'twoRegions', name: 'On the air in two regions', description: 'Broadcast in a second region.' },
  { id: 'nationwide', name: 'All of Etheria', description: 'Have one channel on the air in all five regions.' },
  { id: 'bigAudience', name: 'A million listeners', description: 'Reach a million radio listeners.' },
  { id: 'tvLicense', name: 'A television license', description: 'Buy your first TV license.' },
  { id: 'firstTv', name: 'First TV channel', description: 'Put a TV channel on the air.' },
  { id: 'tvLeader', name: 'TV market leader', description: 'Have more TV viewers than any rival company.' },
  { id: 'fullNetwork', name: 'Full network', description: 'Run as many channels as you are allowed, all on the air.' },
  { id: 'householdName', name: 'A household name', description: 'Have a host everybody knows.' },
  { id: 'headhunter', name: 'Headhunter', description: 'Sign a host away from a rival.' },
  { id: 'firstEvent', name: 'The show must go on', description: 'Stage a concert, gala or telethon of your own.' },
  { id: 'prestigious', name: 'Talk of the town', description: 'Earn 100 prestige from your events.' },
  { id: 'happyOffice', name: 'A great place to work', description: 'Keep a sizeable staff in high spirits.' },
  { id: 'aheadOfItsTime', name: 'Ahead of its time', description: 'Research a technology before its year.' },
  { id: 'fullTechTree', name: 'Nothing left to invent', description: 'Research every technology.' },
  { id: 'eventBroadcaster', name: 'The whole country is watching', description: 'Hold the TV rights when a World Cup or the Olympics begins.' },
  { id: 'firstDividend', name: 'First dividend', description: 'Pay the owners their first dividend.' },
  { id: 'dividendsSmall', name: 'A good investment', description: 'Pay the owners €1 million in dividends.' },
  { id: 'dividendsMedium', name: 'Money machine', description: 'Pay the owners €10 million in dividends.' },
  { id: 'dividendsLarge', name: 'Broadcast empire', description: 'Pay the owners €100 million in dividends.' },
  { id: 'year1980', name: 'Ten years on the air', description: 'Still be broadcasting on 1 January 1980.' },
  { id: 'year1990', name: 'Twenty years on the air', description: 'Still be broadcasting on 1 January 1990.' },
  { id: 'year2000', name: 'Into the new millennium', description: 'Still be broadcasting on 1 January 2000.' },
  { id: 'year2010', name: 'Forty years on the air', description: 'Still be broadcasting on 1 January 2010.' },
  { id: 'year2020', name: 'Half a century', description: 'Still be broadcasting on 1 January 2020.' },
  { id: 'year2030', name: 'Sixty years of broadcasting', description: 'Still be broadcasting on 1 January 2030.' },
];

export function getMilestone(id: MilestoneId): Milestone {
  const milestone = MILESTONE_LIST.find((m) => m.id === id);
  if (!milestone) throw new Error(`Unknown milestone ${id}`);
  return milestone;
}
