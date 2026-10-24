// The words of the minutes of a meeting (0.20.0, #151). Each list is a few ways
// to say the same thing; sim/minutes.ts picks one by a hash, so a meeting always
// reads the same. Plain, short, British spelling; the leader writes to “you”.

/** The point of business, by what the team does. {n} is a number, {name} a show, {s} is “s” when {n} is not 1. */
export const BUSINESS = {
  production: {
    some: ['Item 1: {n} show{s} on air. We agreed to keep it that way.', 'Item 1: the schedule. {n} show{s} on air, and nobody wants to touch it.'],
    none: ['Item 1: nothing of ours is on air yet. We agreed this is a pity.', 'Item 1: the schedule is empty. We agreed to fill it.'],
  },
  sales: {
    some: ['Item 1: {n} sponsor offer{s} waiting for your answer. We agreed you will want to see them.', 'Item 1: sponsors. {n} offer{s} on the table, waiting for you.'],
    none: ['Item 1: no sponsor offers waiting. We agreed to ring round.', 'Item 1: the offers tray is empty. We agreed to look busy.'],
  },
  marketing: {
    some: ['Item 1: {n} campaign{s} running. We agreed that is plenty to watch.', 'Item 1: {n} campaign{s} out there. We agreed to watch the figures.'],
    none: ['Item 1: no campaign is running. We agreed the posters are not going to print themselves.', 'Item 1: nothing is being promoted. We agreed that is a waste of us.'],
  },
  research: {
    some: ['Item 1: {n} tech{s} researched so far, and {points} points in hand. We agreed to spend them.', 'Item 1: research. {n} tech{s} done, {points} points waiting to be spent.'],
    none: ['Item 1: nothing is researched yet, and {points} points are in hand. We agreed to pick something.', 'Item 1: the shelf of techs is bare. {points} points are in hand.'],
  },
  channel: {
    some: ['Item 1: the best show of the week was “{name}”. We agreed to do more of that.', 'Item 1: “{name}” did best this week. We agreed not to let it go to our heads.'],
    none: ['Item 1: no ratings for the week yet. We agreed to wait for them.', 'Item 1: the week’s ratings are not in. We agreed to be patient.'],
  },
};

/** “Any other business” that can come up in any meeting. */
export const ANY_OTHER_BUSINESS = [
  'Any other business: the biscuits. There were not enough.',
  'Any other business: somebody has taken the good pen.',
  'Any other business: the clock in the room is five minutes fast. We left it.',
  'Any other business: none. A first.',
  'Any other business: the coffee. We agreed it could be better.',
];

/** “Any other business” that comes up only when it is true. */
export const ANY_OTHER_BUSINESS_IF = {
  flipChart: ['Any other business: somebody drew on the flip chart, and it was not a graph.', 'Any other business: the flip chart is a great help. Please buy more pens.'],
  dirt: ['Any other business: the room needs a clean. We could write our names in the dust.', 'Any other business: the meeting room is filthy. We said so, politely.'],
  noCook: ['Any other business: we have no cook. We asked for one, loudly.', 'Any other business: lunch. Without a cook it is sandwiches again.'],
};

/** How it ended, by the lift the room gave: in full, less because there were too few seats. */
export const MOOD = {
  good: ['We left in good spirits.', 'We left in a good mood.'],
  crowded: ['We left a little flat: not everyone had a seat.', 'It was a squash. Some of us stood. Spirits were so-so.'],
};

/** The leader’s own touch, by their morale: low, middle (nothing said) and high. */
export const LEADER = {
  low: ['I kept it short. I have a headache.', 'I kept it short. I was not feeling it.'],
  high: ['I enjoyed that one.', 'I chaired it with a smile.'],
};
