// The tutorial's script: everything Uncle Tabby and Penny Cash say (lore.md).
//
// A line has an id, which is also the name of its voice-over recording, a
// title, what is said (`say`, shown as written and read aloud word for word),
// and for a step the clicks that get it done (`how`, shown only). Nothing that
// is said names the player, the company or a number from balance.ts, so a
// recording stays true whatever the game is. sim/guide.ts decides which line is
// due; `npm run voice-over` writes design/voice-over.md from this file.

export type Speaker = 'tabby' | 'penny';

/** The two who present the awards night (0.20.0). They are not part of the tutorial: `Speaker` is still Uncle Tabby and Penny Cash. */
export type Presenter = 'lotta' | 'sonny';

/** The window, and for the broadcasting window the section, that a line is about. */
export type GuideDestination = 'floor' | 'catalog' | 'staff' | 'sales' | 'marketing' | 'research' | 'finance' | 'milestones' | 'licenses' | 'broadcast:channels' | 'broadcast:schedule' | 'broadcast:content' | 'broadcast:ratings' | 'broadcast:streaming' | 'broadcast:planner' | 'broadcast:vans';

export interface Line<Who extends string = Speaker> {
  id: string;
  speaker: Who;
  title: string;
  say: string;
  /** Step by step, for a line that asks the player to do something. */
  how?: readonly string[];
  /** Opened by the Show me button. */
  to?: GuideDestination;
  /** What the button that takes the line away says, for a line that is only talk. */
  reply?: string;
  /** For a hint that offers to walk the player through something: what the button that says no says. The offer is not made again (see `postpone` in sim/guide.ts). */
  later?: string;
  /** For a hint: when it is said, in words. sim/guide.ts has the rule itself. */
  when?: string;
  /** The wiki article (src/wiki) with more about it. */
  wiki?: string;
}

export const SPEAKERS: Record<Speaker, { name: string; role: string }> = {
  tabby: { name: 'Uncle Tabby', role: 'Tabby Loid, newspaper publisher, your uncle and your first financier' },
  penny: { name: 'Penny Cash', role: 'Your uncle’s business consultant, on loan to you' },
};

export const PRESENTERS: Record<Presenter, { name: string; role: string }> = {
  lotta: { name: 'Lotta Glitter', role: 'Host of the Media Times Awards' },
  sonny: { name: 'Sonny Sparkle', role: 'Host of the Media Times Awards' },
};

/** Uncle Tabby opens the game: who you are, what has changed in Etheria, and the deal. */
export const WELCOME: readonly Line[] = [
  {
    id: 'tabby-welcome',
    wiki: 'tabby-loid',
    speaker: 'tabby',
    title: 'Welcome',
    say: 'There you are! Come in, come in. All my life I have printed the news of Etheria. Today, the news is you.',
  },
  {
    id: 'tabby-law',
    wiki: 'broadcasting-act',
    speaker: 'tabby',
    title: 'The new law',
    say: 'The government has finally given in. From this morning, anyone may make radio and television, not just the public broadcaster. I lobbied for that law for years. Somebody in the family ought to use it.',
  },
  {
    id: 'tabby-deal',
    wiki: 'dividends',
    speaker: 'tabby',
    title: 'The deal',
    say: 'So here is the deal. I put up the money to start. You build the company. And once a year I take my share of whatever you have not put back into it. Fair is fair.',
  },
  {
    id: 'tabby-penny',
    wiki: 'penny-cash',
    speaker: 'tabby',
    title: 'One more thing',
    say: 'One more thing. I am lending you Penny Cash, my business consultant. She is sharp, she is honest, and she will tell you so herself. Good luck. Make me proud. And make me rich.',
  },
];

/** Penny asks whether she is wanted; the answer decides the rest. */
export const OFFER: Line = {
  id: 'penny-offer',
  wiki: 'penny-cash',
  speaker: 'penny',
  title: 'Penny Cash',
  say: 'Penny Cash. Your uncle pays me to keep his money safe, and as of today his money is you. I can walk you through the first weeks: a studio, a team, a channel, and a month that ends in the black. Shall I?',
};

/** What Penny says when she is sent away, at the start or later. */
export const FAREWELL: Line = {
  id: 'penny-farewell',
  speaker: 'penny',
  title: 'As you wish',
  say: 'As you wish. If the numbers ever turn red, you will find me under Settings.',
};

/** The first weeks, in order. A step is done when the game says so (sim/guide.ts), whoever's idea it was. */
export const STEPS: readonly Line[] = [
  {
    id: 'look-around',
    wiki: 'the-screen',
    speaker: 'penny',
    title: 'A look around',
    say: 'Before we build anything, have a look around. This is your floor of the building. You can turn it, zoom in and out, and move along it. Try it, and find the hall with the stairs. That is where everything starts.',
    how: ['Q and E turn the view a quarter, or the arrows at the bottom of the screen.', 'Plus and minus zoom in and out; so does the mouse wheel, or two fingers.', 'W, A, S and D move the view, or drag it with the mouse or a finger.', 'Zero, or the house at the bottom, puts it back as it was.'],
    reply: 'I have looked',
  },
  {
    id: 'ceo-office',
    wiki: 'headquarters',
    speaker: 'penny',
    title: 'Your own office',
    say: 'Before anything else: a company needs somebody in charge, and somewhere for them to sit. That is you. Build a small room, make it your own office, and put your desk in it. Nothing goes on the air without one.',
    how: ['Press “Build a room” above the office.', 'Choose “CEO’s office”. A small one will do: rent goes by the tile.', 'Press “Build”.', 'In its checklist, press “Place” beside the CEO’s desk and click a free spot in the room.'],
  },
  {
    id: 'reception',
    wiki: 'headquarters',
    speaker: 'penny',
    title: 'The reception',
    say: 'And somebody has to answer the door. The hall downstairs comes with the building, but there is no desk in it yet. A broadcaster without a reception is a pirate station.',
    how: ['Click the reception: the hall at the head of the ground floor.', 'In its checklist, press “Place” beside the reception desk and click a free spot in the hall.'],
  },
  {
    id: 'studio',
    wiki: 'office',
    speaker: 'penny',
    title: 'A studio',
    say: 'Now the heart of it: no studio, no radio. Build a room and make it a radio studio. A small one will do nicely.',
    how: ['Press “Build a room” above the office.', 'Choose “Radio studio”. Its outline appears on the floor, at the usual size.', 'To put it elsewhere, drag a rectangle on the floor yourself and click a wall for the door.', 'Press “Build”.'],
  },
  {
    id: 'equipment',
    wiki: 'studios',
    speaker: 'penny',
    title: 'Equipment',
    say: 'An empty room is not a studio. It needs a mixing desk and an on-air light. The room keeps a checklist of what is missing. Buy them, and put them where you like. Only keep the floor in front of the door clear.',
    how: ['Select the studio: click it in the office.', 'In its checklist, press “Place” beside the mixing desk.', 'Click a free spot in the studio. The green shape shows how it will stand; R turns it.', 'Do the same for the on-air light.'],
  },
  {
    id: 'mcr',
    wiki: 'headquarters',
    speaker: 'penny',
    title: 'Master control',
    say: 'A studio makes the programme. It still has to reach the antenna on the roof, and every channel goes out through a master control room: a long desk and a wall of monitors. Build one. A narrow room is enough. There is nothing to lay: the cables lay themselves. Cables, beside the floors, shows them, and a red one is a channel that cannot go out.',
    how: ['Press “Build a room” and choose “Master control room”.', 'Press “Build”.', 'In its checklist, press “Place” beside the master control desk and the wall of monitors, and click a free spot for each.', 'To see the cables, press “Cables” beside the floors. Green carries a channel on the air, red one that can’t go out, grey nothing.'],
  },
  {
    id: 'office',
    wiki: 'office',
    speaker: 'penny',
    title: 'An office',
    say: 'Your people will need somewhere to sit. Build a second room and make it an office. Make it a big one: every desk in it seats one of them.',
    how: ['Press “Build a room”.', 'Choose “Office”. Its outline appears on the floor; draw another if you like.', 'Press “Build”.'],
  },
  {
    id: 'management',
    wiki: 'managers',
    speaker: 'penny',
    title: 'A room for the manager',
    say: 'Managers do not sit with the others. They get an office of their own, with a proper desk in it. Build a third room, make it a management office and buy what it needs. It can be small: rent goes by the tile.',
    how: ['Press “Build a room”.', 'Choose “Management office”. Its outline appears on the floor; draw another if you like.', 'Press “Build”.', 'In its checklist, press “Place” beside the manager’s desk and click a free spot in the room.'],
  },
  {
    id: 'manager',
    wiki: 'managers',
    speaker: 'penny',
    title: 'A channel manager',
    say: 'Now, people. A channel without a manager does not broadcast at all, so we start there. The best candidates are at the top of the list. Hire one.',
    how: ['Open Staff, in the menu on the left, then the Hiring tab.', 'Pick Management, then “Channel managers”.', 'Press Hire on the first one: the list is sorted by skill.'],
    to: 'staff',
  },
  {
    id: 'hosts',
    wiki: 'hosts',
    speaker: 'penny',
    title: 'Five hosts',
    say: 'Hosts next. Five of them: we have five shows to fill, and a host is on the air once a day. Look at what they are best at. A morning show, Top 40 and rock are what we are going to make.',
    how: ['In Staff, on the Hiring tab, pick Hosts.', 'Hire five. “Best at” shows their genres: a host for Morning show, Top 40 or Rock is worth more to you than a few points of skill.'],
    to: 'staff',
  },
  {
    id: 'production',
    wiki: 'staff',
    speaker: 'penny',
    title: 'Three producers',
    say: 'And three people in production. They make the shows your hosts present. Do not save on skill here: a weak show earns nothing, and it costs the same rent.',
    how: ['In Staff, on the Hiring tab, pick Content, then “Production”.', 'Hire three, from the top.'],
    to: 'staff',
  },
  {
    id: 'desks',
    wiki: 'staff',
    speaker: 'penny',
    title: 'Desks',
    say: 'Your manager has a desk. The three in production do not, and no desk means no work. Put three workstations in the office.',
    how: ['Select the office: click it. Then press “Rooms” in the menu on the left.', 'Pick “Workstation” and press “Place it”.', 'Click three free spots in the office, one for each desk. R turns it before you put it down.'],
    to: 'catalog',
  },
  {
    id: 'music-post',
    wiki: 'content-market',
    speaker: 'penny',
    title: 'A post room',
    say: 'Music is not made out of thin air. It is played from records, and records need a shelf to stand on. Shelves need a library, and a library needs a post room: whatever comes in has to be signed for. Build one and put a sorting case in it.',
    how: ['Press “Build a room” and choose “Post room”.', 'Press “Build”.', 'In its checklist, press “Place” beside the sorting case and click a free spot in the room.'],
    to: 'floor',
  },
  {
    id: 'music-library',
    wiki: 'content-market',
    speaker: 'penny',
    title: 'A library',
    say: 'Now the library. Build one and put two sets of shelves in it. Each collection of records takes up one.',
    how: ['Press “Build a room” and choose “Library”.', 'Press “Build”.', 'In its checklist, press “Place” beside the shelving and click a free spot in the room. Do it twice.'],
    to: 'floor',
  },
  {
    id: 'music-records',
    wiki: 'content-market',
    speaker: 'penny',
    title: 'Records',
    say: 'Now the records themselves. A show can only play what you own. Buy the Top 40 and rock collections: you pay once, and they never run out.',
    how: ['In On air, go to Content.', 'Under “Records”, press Buy beside Top 40 and beside Rock.'],
    to: 'broadcast:content',
  },
  {
    id: 'channel',
    wiki: 'channels',
    speaker: 'penny',
    title: 'A channel',
    say: 'Time to exist. Start a radio channel, and give it a name people can shout across a schoolyard.',
    how: ['Open On air, in the menu on the left.', 'Press “Start a radio channel”.', 'Give it a name and a logo, and press “Create channel”.'],
    to: 'broadcast:channels',
  },
  {
    id: 'in-charge',
    wiki: 'managers',
    speaker: 'penny',
    title: 'Someone in charge',
    say: 'A channel with nobody in charge is a very expensive hobby. Give it your channel manager.',
    how: ['On the channel, under “Channel manager”, choose the manager you hired.'],
    to: 'broadcast:channels',
  },
  {
    id: 'license',
    wiki: 'licenses',
    speaker: 'penny',
    title: 'A license',
    say: 'Now the permit. You may broadcast in any region, but start in Coaxia. It has the most people, and they are young. Young people want music, and music is the cheapest thing to make.',
    how: ['On the channel, find Coaxia in the list of regions.', 'Press Buy on that row.'],
    to: 'broadcast:channels',
  },
  {
    id: 'show',
    wiki: 'shows',
    speaker: 'penny',
    title: 'Your first show',
    say: 'A license, and nothing to play. Let us fix that. Make a morning show. It takes a host, two producers and your studio. Give it the host who is best at it.',
    how: ['In On air, press “Schedule” on your channel, then “+ Radio show”.', 'Name it and choose the genre “Morning show”.', 'Pick a host: a ★ marks the ones whose genre it is. Tick two production staff; your studio is chosen already.', 'Press “Create show”.'],
    to: 'broadcast:schedule',
  },
  {
    id: 'full-day',
    wiki: 'genres',
    speaker: 'penny',
    title: 'Four more shows',
    say: 'One down, four to go. An empty slot plays reruns, and reruns pay for nobody’s lunch. Make three Top 40 shows, for lunch, the afternoon and the evening, and a rock show for late at night. A host of its own for each. Your producers can take two shows, no more.',
    how: ['On your channel’s schedule, make four more shows with “+ Radio show”: three “Top 40” and one “Rock”.', 'Each takes a host who has no show yet, one producer and the studio.'],
    to: 'broadcast:schedule',
  },
  {
    id: 'schedule',
    wiki: 'schedule',
    speaker: 'penny',
    title: 'The schedule',
    say: 'A show nobody airs is a rehearsal. Put all five on the schedule. The morning show goes in the morning, when most people listen. The rock show goes last, late at night. Top 40 fills the hours in between.',
    how: ['In On air, press “Schedule” on your channel.', 'Drag each show into a slot of its own, or press the show and then the button that appears under the slot.', 'The morning show in Morning, Top 40 at Lunch, in the Afternoon and in the Evening, the rock show in Late night.'],
    to: 'broadcast:schedule',
  },
  {
    id: 'cleaner',
    wiki: 'upkeep',
    speaker: 'penny',
    title: 'A cleaner',
    say: 'One last hire. Offices get dirty, and people in dirty offices do bad work. A cleaner costs less than the mess.',
    how: ['Open Staff, then the Hiring tab.', 'Pick Support, then “Cleaners”, and hire one.'],
    to: 'staff',
  },
  {
    id: 'technician-hire',
    wiki: 'upkeep',
    speaker: 'penny',
    title: 'A technician',
    say: 'And somebody for the desk in master control. A technician sits there while the channel is on the air, and mends whatever breaks in between. Without one, nothing goes out.',
    how: ['On the Hiring tab, pick Support, then “Technicians”, and hire one. Skill matters little at the desk: the cheapest will do.'],
    to: 'staff',
  },
  {
    id: 'play',
    wiki: 'time',
    speaker: 'penny',
    title: 'On the air',
    say: 'That is it. You are ready. Press play at the bottom of the screen and let the days run. The space bar pauses the game whenever you want to think.',
    how: ['Press one of the play buttons in the bar at the bottom. Three arrows is the fastest.'],
  },
  {
    id: 'clock',
    wiki: 'time',
    speaker: 'penny',
    title: 'Day and night',
    say: 'One thing about the clock, before you wonder. A month in the game is one working day in the office: the clock goes from eight in the morning to ten at night as the month goes by. In winter the sun sets on that clock long before the office closes, and the screen turns dark with it. Nothing is broken. Settings keeps it light, or dark, if you would rather.',
    how: ['The clock in the bar at the bottom shows the time of that working day: 8 am on the first of the month, 10 pm on the last.', 'Under Settings, “Color scheme” can keep the screen light or dark instead of following the clock.'],
    reply: 'I see',
  },
  {
    id: 'first-month',
    wiki: 'ratings',
    speaker: 'penny',
    title: 'The first month',
    say: 'Now we wait for the listeners to find you. The ratings come in every Monday. On the first of February you get the report for January. It will show a lot of money gone: we bought furniture and a license, and those you pay for only once. Look at the running result instead. That says whether the company pays its own way.',
    how: ['Let the game run until the first of February.', 'On air, under Ratings, shows who is listening.', 'Finance shows the bills building up. The running result is the income less salaries, rent and license fees.'],
    to: 'broadcast:ratings',
  },
  {
    id: 'black',
    wiki: 'money',
    speaker: 'penny',
    title: 'Into the black',
    say: 'There is January, and the company does not pay its own way yet. Do not panic. Listeners take a while to find a new station. Let February run, and we look again.',
    how: ['Let the game run until the next monthly report: what counts is its running result.', 'Still a running loss? Check that every slot has a show, that every show has its host, its producers and its studio, and that everyone who needs a desk has one.'],
    to: 'finance',
  },
  {
    id: 'sales',
    wiki: 'sponsors',
    speaker: 'penny',
    title: 'Someone in sales',
    say: 'A month in the black! Your uncle will have it framed. And it opens a door: sponsors only talk to a company that pays its own way. Advertisers already pay you for every listener. A sponsor pays more, for one show. Hire someone in sales, and give them a desk.',
    how: ['Open Staff, then Hiring. Pick Business, then “Sales”, and hire one.', 'They need a workstation: select your office and put one more in it from the catalog.'],
    to: 'staff',
  },
  {
    id: 'sponsor',
    wiki: 'sponsors',
    speaker: 'penny',
    title: 'Your first sponsor',
    say: 'Now we wait for Monday: that is when the offers come in. Read the small print before you sign. The show has to keep its listeners above the minimum, or you pay a penalty. Give it to a show that clears the bar with room to spare.',
    how: ['Let the game run until an offer comes in. A pop-up tells you.', 'In Sales, choose a show that had more listeners yesterday than the offer asks for, and press “Accept”.', 'No show clears it? Decline, and wait for the next Monday.'],
    to: 'sales',
  },
  {
    id: 'marketing',
    wiki: 'marketing',
    speaker: 'penny',
    title: 'Someone in marketing',
    say: 'A sponsor on the books. Now for the listeners you do not have yet: nobody tunes in to a channel they have never heard of. A marketer runs a campaign that makes one channel, or one show, more appealing to the audience you choose. Hire one, and find them a desk too.',
    how: ['Open Staff, then Hiring. Pick Business, then “Marketing”, and hire one.', 'Put one more workstation in the office.'],
    to: 'staff',
  },
  {
    id: 'campaign',
    wiki: 'marketing',
    speaker: 'penny',
    title: 'A first campaign',
    say: 'Start small. Promote the channel to everyone, on the smallest budget, for a few weeks, and watch what the ratings do. A campaign costs money every week it runs, so never start one you cannot pay for.',
    how: ['Open Marketing.', 'Under “New campaign”, leave it on your channel, all audiences, the smallest budget and the shortest run.', 'Press “Start campaign”.'],
    to: 'marketing',
  },
  {
    id: 'finish',
    wiki: 'a-good-first-year',
    speaker: 'penny',
    title: 'On your own',
    say: 'That is the lot, for now. You have a company that pays its way, a sponsor, and people who are starting to know your name. From here it is yours. I will only drop by when something new comes up. And if you would rather not see me at all, Settings is where you send me away.',
    reply: 'Thank you, Penny',
  },
];

/** Said once each, the first time something new matters. */
export const HINTS: readonly Line[] = [
  {
    id: 'red',
    wiki: 'loans',
    speaker: 'penny',
    when: 'The first time the money is below zero. This one can interrupt the first weeks.',
    title: 'In the red',
    say: 'We need to talk. The company is in the red, and the bank will not watch that for long. Cut what does not earn: a host without a show, a room nobody uses. A loan buys you time, if the bank will lend. And fill every slot on your schedule.',
    to: 'finance',
  },
  {
    id: 'bailout',
    wiki: 'loans',
    speaker: 'penny',
    when: 'When the bank would have closed the company down and Uncle Tabby has paid in, which he does once. This one can interrupt the first weeks too.',
    title: 'Your uncle steps in',
    say: 'That was close. The bank was about to close the doors, and your uncle has paid them off. He asked me to tell you that it was the first time and the last. So use the months it buys you: cut what does not earn, fill every slot, and get back above zero.',
    to: 'finance',
  },
  {
    id: 'stale',
    wiki: 'freshness',
    speaker: 'penny',
    when: "The first time a show's freshness drops below 80%.",
    title: 'A stale show',
    say: 'One of your shows is going stale. Listeners notice long before you do. A revamp makes it fresh again. It costs a little, and it is worth it.',
    to: 'broadcast:schedule',
  },
  {
    id: 'titles-low',
    wiki: 'content-market',
    speaker: 'penny',
    when: 'The first time the bought titles of a programme on the schedule last a week or less.',
    title: 'Running out of titles',
    say: 'Your library is running low. When the last episode has aired, that slot shows reruns, and the viewers go elsewhere. Buy more on the content market before it comes to that.',
    to: 'broadcast:content',
  },
  {
    id: 'stale-titles',
    wiki: 'content-market',
    speaker: 'penny',
    when: 'The first time a bought title airs at less than half its freshness.',
    title: 'Tired titles',
    say: 'Your viewers have seen these titles too often. A title needs rest between airings. Buy more of them, so that each one airs less often and comes back fresh.',
    to: 'broadcast:content',
  },
  {
    id: 'second-region',
    wiki: 'licenses',
    speaker: 'penny',
    when: "After a month in the black, once the money covers the cheapest license the channel doesn't have, with some to spare.",
    title: 'A second region',
    say: 'You can afford a license in a second region. The same shows, the same people, and more listeners: growth does not come cheaper than that.',
    to: 'broadcast:channels',
  },
  {
    id: 'talk-station',
    wiki: 'genres',
    speaker: 'penny',
    when: 'After a month in the black, while the company has one channel, once the money covers a radio talk studio, a second manager and a second license.',
    title: 'A second station',
    say: 'Here is a thought. Your station plays music, and music is for the young. The people with money to spend, the professionals and the older listeners, want to be talked to: news, call-ins, sport. That takes a second station. A radio talk studio, a channel with a manager of its own, a license, and hosts who can hold a conversation.',
    to: 'broadcast:channels',
  },
  {
    id: 'master-control',
    wiki: 'headquarters',
    speaker: 'penny',
    when: 'The first time a channel has a license while the company has no master control room, or nobody to work it.',
    title: 'Master control',
    say: 'Your channel is off the air before it has begun. Everything you broadcast goes out through a master control room: a long desk and a wall of monitors, and a technician to sit at it. Build one, and your channel reaches the antenna.',
    to: 'floor',
  },
  {
    id: 'audiences',
    wiki: 'market-leader',
    speaker: 'penny',
    when: 'Once the first weeks are over and the company has had four monthly reports and a month in the black.',
    title: 'Who is listening',
    say: 'A word about your schedule. Every slot has its own crowd: workers and families in the morning, students and teens late at night. Give each crowd what it likes, and keep three slots of one kind to stand out. And when you grow, do not make a second station that plays the same thing. Aim it at the people your first one leaves to the others.',
    to: 'broadcast:schedule',
  },
  {
    id: 'technician',
    wiki: 'upkeep',
    speaker: 'penny',
    when: 'The first time a piece of equipment is worn below 70% and there is no technician.',
    title: 'Worn equipment',
    say: 'Your equipment is wearing out. A broken mixing desk takes half the studio with it. Hire a technician before it gets that far.',
    to: 'staff',
  },
  {
    id: 'maintenance',
    wiki: 'upkeep',
    speaker: 'penny',
    when: 'The first time the lighting or the heating fails in a room and there are no maintenance staff.',
    title: 'A fault in the building',
    say: 'Something in the building has failed, and nobody in that room is happy about it. Maintenance staff repair the heating and the lighting. You do not have any yet.',
    to: 'staff',
  },
  {
    id: 'writers',
    wiki: 'writers',
    speaker: 'penny',
    when: 'The first time the company has a sitcom, soap opera or reality studio, or such a show, and no writers.',
    title: 'Writers, not a host',
    say: 'A sitcom has no host. A cast plays it, and the writers make it funny. Build a writers’ room with a story board and a place for each of them, then hire a few. Soaps and reality TV work the same way, and a kids’ show or a radio drama gets better with writers too.',
    to: 'staff',
  },
  {
    id: 'canteen',
    wiki: 'morale',
    speaker: 'penny',
    when: 'With ten people on the payroll, no canteen, and money for one.',
    title: 'A canteen',
    say: 'Your team has grown, and it eats at its desks. Give them a canteen. People with good morale do better work, and better work is better ratings. Build a room, make it a canteen and buy what its checklist asks for.',
  },
  {
    id: 'cook',
    wiki: 'morale',
    speaker: 'penny',
    when: 'With a canteen that has all it needs, fifteen people on the payroll, no cook, and money to spare.',
    title: 'Hot meals',
    say: 'A canteen keeps your people fed, but a sandwich and a coffee only go so far. Put a stove in it and hire a cook. A hot lunch does more for morale than you would think.',
    to: 'staff',
  },
  {
    id: 'strike',
    wiki: 'morale',
    speaker: 'penny',
    when: 'The first time a team threatens to strike.',
    title: 'Trouble on the floor',
    say: 'Some of your people have had enough, and they say they will walk out. Find out what is wrong: a dirty office, a broken heater, nowhere to eat. A meeting with their manager helps for a month. And if they do walk out, a bonus brings them back, at a price.',
    to: 'staff',
  },
  {
    id: 'research',
    wiki: 'research',
    speaker: 'penny',
    when: 'After four monthly reports, while nobody works in research and development.',
    title: 'Research',
    say: 'A word about the future. Your rivals get new technology in the year it is invented, and a studio that falls behind makes weaker shows. Hire someone for research and development, and you can even be a few years early.',
    to: 'research',
  },
  {
    id: 'television',
    wiki: 'television',
    speaker: 'penny',
    when: 'After half a year, with the last three months in the black, once the money covers the cheapest TV license that is for sale, a library and a few months of series, and there is no TV channel yet. It can also be started from the Settings.',
    title: 'Television',
    say: 'You can afford television now. It does not have to start big. No studio, no cameras, no presenters: a channel, a license, and series that you buy by the episode. Shall I walk you through it?',
    reply: 'Yes, walk me through it',
    later: 'Not now',
  },
  {
    id: 'auction',
    wiki: 'auctions',
    speaker: 'penny',
    when: 'The first time a new license is auctioned for a medium the company broadcasts in.',
    title: 'A license auction',
    say: 'A license is being auctioned. Once the free licenses in a region are gone, a new one goes to the highest bidder. Bid what it is worth to you before the closing day, and not a coin more.',
    to: 'broadcast:channels',
  },
  {
    id: 'renewal',
    wiki: 'auctions',
    speaker: 'penny',
    when: "The first time one of the company's own licenses goes into a renewal round.",
    title: 'A renewal round',
    say: 'One of your licenses is up for renewal. A license does not last forever, and when its term ends, your rivals may bid for it. As the holder you have the advantage. It is not a free pass. Bid, or lose the region.',
    to: 'broadcast:channels',
  },
  {
    id: 'poaching',
    wiki: 'poaching',
    speaker: 'penny',
    when: "The first time a rival makes one of the company's hosts an offer.",
    title: 'A rival wants your host',
    say: 'A rival has made one of your hosts an offer. Fame makes people expensive. Match it, or let them walk and watch the listeners follow.',
    to: 'staff',
  },
  {
    id: 'notice',
    wiki: 'poaching',
    speaker: 'penny',
    when: 'The first time one of the company’s hosts has signed with a rival and works out their notice.',
    title: 'A month’s notice',
    say: 'One of your hosts is leaving us, but not today: they work out the month first. That month is yours. Hire a new host and give them the show before the last day, and the audience hardly notices.',
    to: 'staff',
  },
  {
    id: 'away',
    wiki: 'staff',
    speaker: 'penny',
    when: 'The first time someone on the staff is told to go on leave, or falls ill.',
    title: 'Someone is away',
    say: 'Somebody on the staff is going to be away: on leave to look after a new baby, or ill. While they are gone nobody does their work, and a host who is away means reruns. You can take on a temp at the Staff window. A temp is quick to find and costs a little extra, and does three quarters of the job. Or hire someone else for good, and give them the work.',
    to: 'staff',
  },
  {
    id: 'event',
    wiki: 'history',
    speaker: 'penny',
    when: 'The first time a World Cup, the Olympics, an election campaign or a recession is on.',
    title: 'The country is watching',
    say: 'Big events change what people want to hear. During a World Cup or the Olympics, sports draws a crowd. In an election campaign, the news does. And in a recession, advertisers pay less for everything. When something big happens, The Media Times has it on the front page.',
    to: 'broadcast:schedule',
  },
  {
    id: 'rights',
    wiki: 'sports-rights',
    speaker: 'penny',
    when: 'The first time the TV rights to a sports event are auctioned while the company has a TV channel.',
    title: 'Event rights',
    say: 'The television rights to a big sports event are being auctioned. On television, only the broadcaster that holds them gets the crowd. If you have a sports show, it may be worth a bid.',
    to: 'broadcast:content',
  },
  {
    id: 'sports-rights',
    wiki: 'sports-rights',
    speaker: 'penny',
    when: 'The first time the company has a TV sports show and no sports broadcast rights, with the content market open.',
    title: 'Sport without the games',
    say: 'Your television sports show has no rights, so it can only talk about sport, and fewer people watch. The offers for broadcast rights are on the Content screen, and a month later there are new ones.',
    to: 'broadcast:content',
  },
  {
    id: 'streaming',
    wiki: 'streaming',
    speaker: 'penny',
    when: 'Once Streaming is researched, while the company has a TV channel and no streaming service.',
    title: 'On demand',
    say: 'People have started watching when they like, not when you schedule it. With Streaming researched, you can offer your shows on demand, for a monthly price. You need server racks in the library to carry it, and enough shows to be worth paying for. Too dear, or too stale, and they leave.',
    to: 'broadcast:streaming',
  },
  {
    id: 'own-event',
    wiki: 'prestige',
    speaker: 'penny',
    when: 'Once the money above the reserve covers a concert.',
    title: 'An event of your own',
    say: 'You have money to spare. Stage a concert. It lifts your reputation, it makes your best host famous, and it earns prestige, which is the other score your uncle brags about.',
    to: 'marketing',
  },
  {
    id: 'theme-week',
    wiki: 'theme-weeks',
    speaker: 'penny',
    when: 'Once a radio channel has been on the air for a year and has no theme week planned.',
    title: 'A theme week',
    say: 'Your radio station could do with a week of its own. Book a theme week: a hit list, a listener game, or a special when the country is watching an election or a match. For seven days the right shows draw more listeners, and a little of it stays. You get two a year. The year planner is in On air.',
    to: 'broadcast:planner',
  },
  {
    id: 'news-van',
    wiki: 'news-van',
    speaker: 'penny',
    when: 'The first time a news or sports show is on the air, the company has no news van and a journalist is in the hiring pool.',
    title: 'A news van',
    say: 'Your newsroom never leaves the building. Buy a news van and hire a journalist, and send the van out on the day shift or the evening shift. The news on the air then, on radio and on television, draws more viewers and listeners. Every trip costs fuel and a crew, so send it where the news is.',
    to: 'broadcast:vans',
  },
  {
    id: 'breaking',
    wiki: 'breaking-news',
    speaker: 'penny',
    when: 'The first time a news story breaks while the company has a channel.',
    title: 'Breaking news',
    say: 'Something has happened, and the whole country wants to hear about it. Your news shows draw more while the story runs, and more still with a van and a journalist. You can also break in on a channel: one slot gives way to a bulletin, which draws a crowd and a little reputation, but loses part of its ads, and the sponsor of that show counts the day as missed. It is in the Channels window.',
    to: 'broadcast:channels',
  },
  {
    id: 'awards',
    wiki: 'awards',
    speaker: 'penny',
    when: 'The first time one of the company’s shows or hosts is nominated for a radio or TV award.',
    title: 'A nomination',
    say: 'You have a nomination. Now and then this business hands itself awards, and this time you are in the running. A nomination earns prestige. A win earns more, and a host who wins will knock on your door for a raise. The nominees are in the Milestones window.',
    to: 'milestones',
  },
  {
    id: 'security',
    wiki: 'hosts',
    speaker: 'penny',
    when: 'The first time a host is famous enough for fans to come after them, while no guard works at a security desk.',
    title: 'Fans at the door',
    say: 'One of your hosts is famous now, and fame brings fans to the door. Not all of them are friendly. Build a security room, put a desk in it and hire a guard.',
  },
  {
    id: 'calls',
    wiki: 'call-centre',
    speaker: 'penny',
    when: 'The first time a game show or a reality show is on the air while Premium-rate lines is researched.',
    title: 'Pay to vote',
    say: 'Viewers will pay to vote now. A call centre with agents takes the calls, and every vote answered is money. Too few agents and the calls go unanswered, and the regulator hears about it.',
  },
  {
    id: 'lawsuit',
    wiki: 'lawsuits',
    speaker: 'penny',
    when: 'The first time one of the company’s shows is sued.',
    title: 'You are being sued',
    say: 'One of your shows is being sued. You can settle now, for less than the claim, or go to court and take the chance. A lawyer on the staff lowers the chance of losing, and makes settling cheaper. The case is on the Finance screen.',
    to: 'finance',
  },
  {
    id: 'regulator',
    wiki: 'broadcasting-authority',
    speaker: 'penny',
    when: 'The first time a complaint about one of the company’s channels comes in.',
    title: 'A complaint',
    say: 'A complaint about your channel. The broadcasting authority writes the rules: no adult films before late night, one slot of teleshopping a day, and the news your license asks for. A fine hurts. A record hurts more at the renewal.',
    to: 'licenses',
  },
  {
    id: 'social-media',
    wiki: 'marketing',
    speaker: 'penny',
    when: 'The first time Social media is researched while the company has a marketer.',
    title: 'Everyone is on their phone',
    say: 'Everyone is on their phone now. A marketer can run an account for each of your channels: it costs little, grows slowly, and keeps the young listeners coming back long after a campaign would have faded.',
    to: 'marketing',
  },
  {
    id: 'dividend',
    wiki: 'dividends',
    speaker: 'penny',
    when: 'The first December in which the owners will take a dividend.',
    title: 'Your uncle’s share',
    say: 'December. On the first of January your uncle takes his share: part of the cash you hold above a year of running costs. Whatever you put back into the company before then stays in the company.',
    to: 'finance',
  },
  {
    id: 'second-floor',
    wiki: 'office',
    speaker: 'penny',
    when: 'When the company is worth enough to build on the second floor.',
    title: 'A second floor',
    say: 'The company is worth enough to build on the next floor. More rooms: more studios, more desks, and somewhere to put that canteen.',
  },
  {
    id: 'top-floor',
    wiki: 'office',
    speaker: 'penny',
    when: 'When the company is worth enough to build on the top floor of its building, from the third floor up.',
    title: 'The top floor',
    say: 'The top floor is yours. There is no floor above it, so plan it well: a studio takes more room than you think, and the writers want a room of their own.',
  },
  {
    id: 'places',
    wiki: 'staff',
    speaker: 'penny',
    when: 'When the company has a second office.',
    title: 'Who sits where',
    say: 'A second office. Until now your people sat wherever a desk was free. You can give them a place of their own: a whole department in one room, with its manager next door. The panel of an office shows who sits where.',
  },
];

/** Every line, for the voice-over script and for checks. */
/**
 * Television, the small way: what Penny walks the player through once they
 * say yes to her hint `television`. One programme of bought series on a
 * channel of its own, which pays its way after a few months (measured with
 * the test players; a programme of films does not, at this size).
 */
export const TV_STEPS: readonly Line[] = [
  {
    id: 'tv-channel',
    wiki: 'television',
    speaker: 'penny',
    title: 'A TV channel',
    say: 'First the channel itself. Start a second channel, and make it television. It needs a name of its own.',
    how: ['In On air, go to Channels.', 'Press “Start a TV channel”.', 'Give it a name and press “Create channel”.'],
    to: 'broadcast:channels',
  },
  {
    id: 'tv-manager',
    wiki: 'managers',
    speaker: 'penny',
    title: 'A manager of its own',
    say: 'A channel manager runs one channel, and yours has a radio station to mind. Hire a second one. Give them an office of their own, and put them in charge of television.',
    how: ['In Staff, on the Hiring tab, pick Management and hire a channel manager.', 'A manager has a room of their own: build a second management office and place a manager’s desk in it.', 'In On air, under Channels, choose them as the manager of the TV channel.'],
    to: 'staff',
  },
  {
    id: 'tv-license',
    wiki: 'licenses',
    speaker: 'penny',
    title: 'A television license',
    say: 'Now the permit. Television licenses are scarce: the authority hands out only a few, and every one of them costs a small fortune. Buy one where one is for sale. One region is enough to begin with.',
    how: ['In On air, under Channels, find the list of regions on the TV channel.', 'Press Buy on a region that has a license for sale.'],
    to: 'broadcast:channels',
  },
  {
    id: 'tv-post',
    wiki: 'content-market',
    speaker: 'penny',
    title: 'A post room',
    say: 'Before the library, a post room. The distributors send their titles by post, and somebody has to sign for them. Build a post room and put a sorting case in it.',
    how: ['Press “Build a room” and choose “Post room”.', 'Press “Build”.', 'In its checklist, press “Place” beside the sorting case and click a free spot in the room.'],
    to: 'floor',
  },
  {
    id: 'tv-library',
    wiki: 'content-market',
    speaker: 'penny',
    title: 'A library',
    say: 'No studio. Not yet. Television can start with programmes that somebody else made, and those need a home. Build a library, and put shelves in it.',
    how: ['Press “Build a room” and choose “Library”.', 'Press “Build”.', 'In its checklist, press “Place” beside the shelving and click a free spot in the room.'],
    to: 'floor',
  },
  {
    id: 'tv-titles',
    wiki: 'content-market',
    speaker: 'penny',
    title: 'Series',
    say: 'Now the content market. Buy series. They come by the episode, one for every evening, so buy enough for a few weeks. Leave the films for later: a film costs twice as much, for one night.',
    how: ['In On air, go to Content.', 'Under “Content market”, press Series.', 'Buy one or two: the quality and the number of airings are on each title.'],
    to: 'broadcast:content',
  },
  {
    id: 'tv-show',
    wiki: 'shows',
    speaker: 'penny',
    title: 'On the air',
    say: 'Make a programme of them: a new show, from the library, of the genre series. Then put it in the evening. That is when the whole country sits down to watch.',
    how: ['In On air, press “Schedule” on the TV channel, then “+ From the library”.', 'Name it, choose the genre “Series” and press “Create show”.', 'Put the show in the Evening.'],
    to: 'broadcast:schedule',
  },
  {
    id: 'tv-finish',
    wiki: 'television',
    speaker: 'penny',
    title: 'Television, the small way',
    say: 'And that is a television channel. One programme every evening, and reruns around it. Keep the library stocked: when the episodes run out, so does the audience. Once it earns its keep, add documentaries in the afternoon. They are cheap. A studio and shows of your own can wait until the money is there.',
    reply: 'Thank you, Penny',
  },
];

/** A line of the tutorial or of the awards night. */
export type AnyLine = Line<Speaker | Presenter>;

/**
 * The awards night (0.20.0): the lines Lotta Glitter and Sonny Sparkle say, in the order of the show (ui/ceremony.ts
 * builds it). They name no year, no channel and no person, so one recording serves every night. The nominees and
 * the winner are on screen, and the winner's own name is not said; “the winner is…” is all the voice says.
 */
export const CEREMONY: readonly Line<Presenter>[] = [
  { id: 'lotta-welcome', wiki: 'awards', speaker: 'lotta', title: 'Welcome', say: 'Good evening, and welcome to the Media Times Awards! I am Lotta Glitter.' },
  { id: 'sonny-welcome', wiki: 'awards', speaker: 'sonny', title: 'Welcome, too', say: 'And I am Sonny Sparkle. Every five years this business hands itself a trophy, and tonight we find out who takes one home.' },
  { id: 'lotta-radio-show', wiki: 'awards', speaker: 'lotta', title: 'Best radio show', say: 'Let us start with radio: best radio show. The nominees are…' },
  { id: 'sonny-radio-host', wiki: 'awards', speaker: 'sonny', title: 'Best radio host', say: 'The voices you wake up to: best radio host. The nominees are…' },
  { id: 'lotta-tv-show', wiki: 'awards', speaker: 'lotta', title: 'Best TV show', say: 'Now for television: best TV show. The nominees are…' },
  { id: 'sonny-tv-host', wiki: 'awards', speaker: 'sonny', title: 'Best TV host', say: 'And the faces on the screen: best TV host. The nominees are…' },
  { id: 'lotta-winner', wiki: 'awards', speaker: 'lotta', title: 'The winner, said by Lotta', say: 'And the winner is…' },
  { id: 'sonny-winner', wiki: 'awards', speaker: 'sonny', title: 'The winner, said by Sonny', say: 'And the winner is…' },
  { id: 'lotta-goodnight', wiki: 'awards', speaker: 'lotta', title: 'That is all', say: 'That is all for tonight. Congratulations to the winners, and to everyone else: there is always next time.' },
  { id: 'sonny-goodnight', wiki: 'awards', speaker: 'sonny', title: 'Good night', say: 'Good night, Etheria!' },
];

export const LINES: readonly AnyLine[] = [...WELCOME, OFFER, FAREWELL, ...STEPS, ...HINTS, ...TV_STEPS, ...CEREMONY];

export const getLine = (id: string) => LINES.find((line) => line.id === id);
