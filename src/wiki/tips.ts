// The wiki's advice: how to do well, without spelling the game out.

import { BANKRUPTCY_MONTHS, DIVIDEND, FRESHNESS_DECAY, MAX_SHOWS_PER_PERSON, RENEWAL, REVAMP_COST, SPECIALIZATION } from '../config/balance';
import { euro, percent, type ArticleId, type ArticleText } from './types';

export const TIP_ARTICLES = {
  'a-good-first-year': {
    title: 'A good first year',
    category: 'tips',
    summary: 'What to do once the first month is in the black.',
    sections: [
      {
        body: ['[[first-weeks]] gets a company on the air and into the black. This is about the rest of the year. None of it is a rule; all of it has worked.'],
      },
      {
        heading: 'In order of what it pays',
        body: [
          'Not all of this is open on the first day: more regions come after a month on the air, sales with the first profitable month, and research with a second region ([[milestones]]).',
          {
            steps: [
              '**A second region.** The same shows and the same people reach more listeners for the price of a license. Nothing else you can buy in the first year pays back as fast. Buy the biggest region you can afford; see [[licenses]].',
              '**Someone in sales.** One good salesperson brings sponsor offers every week, and a sponsor on your morning show is the best contract there is. See [[sponsors]].',
              `**Revamps.** A show wears out slowly: after a year on the air it draws about ${percent(365 * FRESHNESS_DECAY)} less than when it was new. At ${euro(REVAMP_COST)} a revamp of a show with a real audience pays for itself, once it has lost a fifth or so. See [[freshness]].`,
              '**A technician** before the first piece breaks, and **maintenance** when the first fault comes. See [[upkeep]].',
              '**A canteen** once there are ten people or so. Morale lifts every show a little. See [[morale]].',
              '**A researcher** by the end of the year, so that your studios are ready when the rivals’ are. See [[research]].',
            ],
          },
        ],
      },
      {
        heading: 'Shows',
        body: [
          {
            list: [
              'Look at who is tuned in when ([[schedule]]) and who lives where ([[audiences]]). A show for seniors late at night plays to an empty room.',
              'Give each show the host who is best at its genre. Skill outside a host’s genres counts for much less ([[hosts]]).',
              `With ${SPECIALIZATION.minSlots} shows of one group the channel earns a bonus on those shows ([[channels]]).`,
              'The Ratings page shows which audience each show really draws. Believe it over your plans.',
            ],
          },
        ],
      },
      { heading: 'Money', body: [{ tip: `Keep a few months of running costs in the bank. Being rich in December only means a bigger [[dividends|dividend]] in January, but being broke for ${BANKRUPTCY_MONTHS} months is the end.` }] },
    ],
    seeAlso: ['first-weeks', 'growing', 'ways-to-lose-money'],
  },

  growing: {
    title: 'Growing',
    category: 'tips',
    summary: 'From one station to a network.',
    sections: [
      {
        heading: 'Wider before deeper',
        body: [
          'A channel’s costs are its people, its rooms and its fees. Its income grows with every region it is in. So the first channel should go to every region it can before the second channel is started: each new license costs only the license.',
          'A new region starts with no [[reputation]] and earns little for the first months. That is normal. It rises as long as your shows are better than what was there.',
        ],
      },
      {
        heading: 'A second channel',
        body: [
          `A second channel needs its own manager, its own shows and mostly its own people, since a host presents one show a day and nobody in production works on more than ${MAX_SHOWS_PER_PERSON}. Make it different from the first: other genres for other [[audiences]]. Two channels after the same listeners in the same slot take them from each other.`,
          'The studio can be shared, as long as the two channels don’t use it in the same slot ([[studios]]).',
        ],
      },
      {
        heading: 'Television',
        body: [
          'Television is the big step, and the expensive one ([[television]]). A way in that does not bet the company:',
          {
            steps: [
              'Have a radio company that makes good money first, and cash for the license with a year of costs to spare.',
              'Start in the region with the most people you can get a license for.',
              'Fill the day with bought titles from the [[content-market]], which need only a library.',
              'Make one or two shows of your own for the evening, when everyone watches.',
              'Add regions as they come up for [[auctions|auction]].',
            ],
          },
        ],
      },
      {
        heading: 'Keeping what you have',
        body: [
          {
            list: [
              `Every license comes up for renewal after ${RENEWAL.termYears} years ([[auctions]]). A license that earns well is worth a serious bid; losing it means losing the region for years.`,
              'Match the offers for hosts who carry a big show ([[poaching]]). Let the others go.',
              'Research ahead of the years ([[research]]), and upgrade the studios when a new version arrives.',
              'Check the [[history|calendar]]: a World Cup is a reason to have a sports show, an election a reason to have the news.',
            ],
          },
        ],
      },
      {
        heading: 'The two scores',
        body: [
          `[[dividends]] grow with the cash you hold on 1 January above ${DIVIDEND.reserveMonths} months of costs. [[prestige]] is bought with events. A company that reinvests everything grows fastest and pays its owners nothing; where to stop is yours to decide.`,
        ],
      },
    ],
    seeAlso: ['a-good-first-year', 'television', 'licenses', 'rivals'],
  },

  'ways-to-lose-money': {
    title: 'Ten ways to lose money',
    category: 'tips',
    summary: 'The common mistakes, and what they cost.',
    sections: [
      {
        body: [
          {
            steps: [
              '**Empty slots.** A rerun earns almost nothing. See [[schedule]].',
              '**Cheap staff.** A show half as good draws a quarter of the audience, for most of the salary. See [[ratings]].',
              '**People without a desk.** They are paid and do nothing, and a channel whose manager has no desk in a management office is off the air. The Staff window marks them. See [[staff]] and [[managers]].',
              '**Too few producers on a show.** Production quality drops in proportion. See [[shows]].',
              '**A small region first.** One license outside [[coaxia]] does not carry a full team.',
              '**The wrong show at the wrong hour.** See [[schedule]] and [[audiences]].',
              '**Stale shows.** They fade so slowly that nobody notices. See [[freshness]].',
              '**A sponsor on a weak show.** Miss the minimum and you pay. See [[sponsors]].',
              '**Old studios.** Rivals move on with the years. See [[research]].',
              '**Television too early.** The license alone can sink a company. See [[television]].',
            ],
          },
          { tip: 'When a month ends in the red and you don’t know why, open Finance and compare the report with the month before, line by line. The line that moved is the answer.' },
        ],
      },
    ],
    seeAlso: ['a-good-first-year', 'loans', 'money'],
  },
} satisfies Partial<Record<ArticleId, ArticleText>>;
