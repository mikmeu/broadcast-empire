import { TITLES_FOR_FULL_FRESHNESS } from '../sim/insight';
// The wiki's articles about how the game works. Figures come from the game's
// own data (config/ and sim/), so an article can't fall behind a change to the
// balance.

import {
  AUCTION,
  BAILOUT,
  BANKRUPTCY_MONTHS,
  CANDIDATE_POOL,
  CLEANLINESS,
  COMFORT,
  CONTENT,
  CONTROL_ROOM,
  DECOR,
  GRACE,
  MASTER_CONTROL,
  OFF_AIR_WARNING,
  CPM,
  DIVIDEND,
  EPISODE_COST,
  EXTRA_PRODUCER,
  EVENTS,
  FAME_APPEAL,
  FAME_HALF_LISTENERS,
  FLOOR_UNLOCK_VALUE,
  FRESHNESS_DECAY,
  FRESHNESS_MIN,
  FURNITURE_WORTH,
  HOME_REGION,
  ISSUES,
  LOAN,
  MANAGER,
  MARKETING,
  MAX_PLAYER_CHANNELS,
  MAX_SHOWS_PER_HOST,
  MAX_SHOWS_PER_PERSON,
  MORALE,
  MS_PER_DAY,
  OFF_SPECIALTY_SKILL,
  OWN_EVENTS,
  OWN_EVENT_LIMITS,
  POACH,
  PRESTIGE,
  RADIO_LICENSE_SLOTS,
  REGIONAL_AUDIENCES,
  RENEWAL,
  RENT_PER_TILE,
  BUILD_COST_PER_TILE,
  RESEARCH,
  REVAMP_COST,
  RIVAL_DIFFICULTY,
  DIFFICULTIES,
  DIFFICULTY_COSTS,
  MILESTONES,
  RIVAL_ERA,
  RIVAL_EXPANSION_FROM_YEAR,
  SALARY,
  RELATIONS,
  SALES,
  SEVERANCE_MONTHS,
  SPECIALIZATION,
  STUDIO_AUDIENCE,
  SPEEDS,
  SPORTS_RIGHTS,
  STARTING_MONEY,
  TIERS,
  TV_HOST_CANDIDATES,
  WRITER_CANDIDATES,
  WRITERS,
  EDITOR_CANDIDATES,
  EDITORS,
  ENGINEERS,
  ENGINEER_CANDIDATES,
  COOKS,
  COOK_CANDIDATES,
  CLERK_CANDIDATES,
  RECRUITER_CANDIDATES,
  RECRUITING,
  POST,
  MEETINGS,
  STRIKES,
  DRESSING,
  TALENT,
  TV_LICENSE_YEARS,
  TRAINING,
  WEAR,
  XP,
  MAX_MESSAGES,
} from '../config/balance';
import { ELECTIONS, RECESSIONS, SPORTS_EVENTS } from '../config/events';
import { GENRES, getGenre, type Genre } from '../config/genres';
import { STEPS } from '../config/guide';
import { MILESTONE_LIST } from '../config/milestones';
import { BUILDINGS, FURNITURE, ROOM_MIN, ROOM_TYPE_NAMES, ROOM_TYPE_NOTES, SEATS_PER_MEETING_TABLE, STAFF_PER_TABLE, STUDIO_REQUIREMENTS, TITLES_PER_RACK, TITLES_PER_SHELF, type FurnitureType, type RoomType } from '../config/office';
import { PERSONALITIES } from '../config/rivals';
import { TECHS } from '../config/tech';
import { AUDIENCES, OFFICE_DAY, REGIONS, SLOTS, SLOT_HOURS, SLOT_NAMES, TUNED_IN, type Medium } from '../config/world';
import { formatHour, formatHours, toCalendarDate } from '../sim/calendar';
import { DAY } from '../office/day';
import { licenseMonthly, licensePrice, LIST_PRICES } from '../sim/licenses';
import { cents, count, euro, list, percent, type ArticleId, type ArticleText } from './types';
import { getMilestone } from '../config/milestones';
import { FEATURES, UNLOCKS, type Feature } from '../config/unlocks';

/** The milestones that open something, by name, as "“A” or “B”". */
const opensWith = (feature: Feature) => UNLOCKS[feature].milestones.map((id) => `“${getMilestone(id).name}”`).join(' or ');
/** A line for the article on something a new company has to open first. */
const lockLine = (feature: Feature) => `A new company cannot do this from the first day: it opens with the milestone ${opensWith(feature)} ([[milestones]]).`;

const secondsPerDay = MS_PER_DAY / 1000;
const fit = (value: number) => (value >= 1 ? 'High' : value >= 0.6 ? 'Medium' : 'Low');
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** One row per genre of a medium: what it is, where it is made and who likes it. */
const genreRows = (medium: Medium) =>
  GENRES.filter((g) => g.medium === medium).map((g: Genre) => [
    g.name,
    g.group,
    g.kind === 'licensed' ? 'Bought (library)' : ROOM_TYPE_NAMES[g.studio],
    g.kind === 'licensed' ? '–' : String(g.requiredStaff),
    String(g.unlockYear),
    ...AUDIENCES.map((a) => fit(g.fit[a.id])),
  ]);
const genreHead = ['Genre', 'Group', 'Made in', 'Producers', 'From', ...AUDIENCES.map((a) => a.name)];

/** The TV studios, whose control desk and audio mixer stand in a control room of their own (0.16.0). */
const TV_KIT_ROOMS = Object.fromEntries((Object.keys(STUDIO_REQUIREMENTS) as RoomType[]).filter((t) => STUDIO_REQUIREMENTS[t]?.audioMixer).map((t) => [t, true]));

/** What a room's checklist asks for, in words. */
const checklist = (type: RoomType) =>
  Object.entries(STUDIO_REQUIREMENTS[type as keyof typeof STUDIO_REQUIREMENTS] ?? {})
    .map(([piece, n]) => `${n} × ${lower(FURNITURE[piece as FurnitureType].name)}`)
    .join(', ') || 'Nothing';

const tunedRows = (medium: Medium) => AUDIENCES.map((a) => [a.name, ...TUNED_IN[medium][a.id].map((share) => percent(share))]);
const slotHead = ['Audience', ...SLOTS.map((slot) => SLOT_NAMES[slot])];

const years = (first: number, every: number, until = 2030) => {
  const out: number[] = [];
  for (let year = first; year <= until; year += every) out.push(year);
  return out;
};

export const GAME_ARTICLES = {
  // --- Getting started ---

  'broadcast-empire': {
    title: 'Broadcast Empire',
    category: 'start',
    summary: 'What the game is about, and where to start reading.',
    facts: [
      ['Starts', '1 January 1970'],
      ['Starting money', `${euro(STARTING_MONEY.easy)}, ${euro(STARTING_MONEY.normal)} or ${euro(STARTING_MONEY.hard)} (easy, normal, hard)`],
      ['Country', 'Etheria'],
      ['Last milestone', '2030'],
    ],
    sections: [
      {
        body: [
          '**Broadcast Empire** is a game about building a broadcasting company in [[etheria]], from one radio station in 1970 into a network of radio and television channels. You build rooms, hire people, make shows, put them on a schedule and sell the audience to advertisers.',
          'There is no way to win. The last milestone is for still being on the air in 2030, and the game goes on after it. The company keeps two scores: the [[dividends]] it has paid to its owners, and the [[prestige]] it has earned. [[milestones]] mark the way. The one way to lose is to go [[loans|bankrupt]].',
        ],
      },
      {
        heading: 'Where to start',
        body: [
          { list: ['[[first-weeks]] walks through a start that works.', '[[the-screen]] explains what is where.', '[[ratings]] explains why people listen, which is most of the game.', '[[a-good-first-year]] has advice for after the first month.'] },
        ],
      },
      {
        heading: 'This wiki',
        body: [
          'Every window in the game has small question marks that open the article about what you are looking at. Words in purple lead to other articles. The figures in the articles are the game’s own, so they are right for the version you are playing.',
          { tip: 'The articles under “How to do well” give advice. The rest only describes how things work.' },
        ],
      },
    ],
    seeAlso: ['first-weeks', 'the-screen', 'etheria'],
  },

  'first-weeks': {
    title: 'Your first weeks',
    category: 'start',
    summary: 'A start that pays its own way from the first month: the one Penny Cash teaches.',
    sections: [
      {
        body: [
          'A new company has ' + euro(STARTING_MONEY.normal) + ' on normal (more on easy, less on hard) and nothing else. This is the start [[penny-cash]] walks a new player through. It is not the only one that works, but it is tested: with it, a company has a month that pays its own way by March, and most have one in January; on hard, a start outside Coaxia with a weak hiring pool can take longer.',
        ],
      },
      {
        heading: 'The steps',
        body: [
          { steps: STEPS.filter((s) => s.how).map((s) => `**${s.title}.** ${s.how!.join(' ')}`) },
        ],
      },
      {
        heading: 'Why it works',
        body: [
          {
            list: [
              '**A full day.** An empty slot plays a rerun that almost nobody listens to. Five shows on five slots earn five times a day. See [[schedule]].',
              '**Coaxia first.** It has the most people by far, and many of them are young. One license elsewhere does not pay for a full team. See [[coaxia]] and [[licenses]].',
              '**Music.** Top 40 and rock suit teens and students, and take one producer each. See [[genres]].',
              '**Skill.** A show’s quality is its host, its producers and its studio together, and listeners go to the better show much more than in proportion. See [[ratings]].',
              '**Five hosts and three producers.** A host presents one show a day; a producer works on ' + MAX_SHOWS_PER_PERSON + ' shows at most. See [[staff]].',
              '**Sales, then marketing.** The first month that pays its own way opens Sales, and the first sponsor opens Marketing ([[milestones]]). One salesperson and one marketer are enough to begin with: a sponsor on the best show, and a small campaign for the channel. See [[sponsors]] and [[marketing]].',
            ],
          },
          { tip: 'January closes far down, because the furniture and the license are paid for once. Judge it by its running result: the income less what the company costs to run.' },
        ],
      },
    ],
    seeAlso: ['a-good-first-year', 'office', 'shows', 'schedule'],
  },

  time: {
    title: 'Time',
    category: 'start',
    summary: 'Days, weeks, months and years, and what happens on which day.',
    facts: [
      ['One day', `${secondsPerDay} seconds at normal speed`],
      ['Speeds', SPEEDS.filter((s) => s > 0).map((s) => `${s}×`).join(', ')],
      ['Pause', 'Space'],
    ],
    sections: [
      {
        body: [
          `The game runs in days. At normal speed a day takes ${secondsPerDay} seconds; the buttons in the bar at the bottom pause the game or run it at ${list(SPEEDS.filter((s) => s > 0).map((s) => `${s}×`))}. Everything can be done while the game is paused.`,
          'Every day your [[schedule]] is broadcast once, and the advertising money for that day comes in.',
        ],
      },
      {
        heading: 'The clock',
        body: [
          `Beside the date is a clock. It shows the time at the [[office]], where a month of the calendar passes as one day: ${formatHour(OFFICE_DAY.from)} on the first of the month, ${formatHour(OFFICE_DAY.to)} as the last day ends. What you see in the office and in the street follows that clock; pause the game and everyone stands still.`,
          'The clock is only for looking at. Your shows are broadcast every day of the calendar, whatever the time on it.',
          'The screen follows it too, with the color scheme set to the time of day ([[saving]]): it turns dark when the sun goes down on the office clock and light again when it comes up. In winter the sun sets on it in the afternoon, which is the second half of the month, and in December it rises after eight; in summer the office day ends before dark. A new game opens in the light of a January morning.',
          `Your people live by it, though ([[staff]]): most are in from ${formatHour(DAY.office.from)} to ${formatHour(DAY.office.to)}, a bus stands at the stop in front of the office at a quarter to every hour, and around midday the canteen fills up.`,
          {
            table: {
              head: ['Slot', 'On the clock'],
              rows: SLOTS.map((slot) => [SLOT_NAMES[slot], formatHours(SLOT_HOURS[slot])]),
            },
          },
        ],
      },
      {
        heading: 'What happens when',
        body: [
          {
            table: {
              head: ['When', 'What'],
              rows: [
                ['Every day', 'Shows air and earn. Rooms get dirtier, equipment wears, people gain experience, research points come in.'],
                ['Every Monday', 'The weekly [[ratings]] come in. Sales staff bring new [[sponsors|sponsor offers]].'],
                ['The 1st of the month', 'Salaries, rent and license fees for the past month are paid, and the monthly report is filed ([[money]]). New candidates arrive in the hiring pool, and new titles on the [[content-market]]. With autosave on, the game saves itself.'],
                ['1 January', 'The owners take their [[dividends|dividend]].'],
                ['Now and then', 'A [[history|World Cup, an election or a recession]]; a license [[auctions|auction]]; a rival’s offer to one of your [[poaching|hosts]].'],
              ],
            },
          },
        ],
      },
    ],
    seeAlso: ['the-screen', 'money', 'history'],
  },

  'the-screen': {
    title: 'The screen',
    category: 'start',
    summary: 'The office, the menu, the windows and the bar at the bottom.',
    sections: [
      {
        body: [
          'The [[office]] is always in view. Everything else opens as a window on top of it, from the menu on the left. Windows can be dragged by their title bar and closed with their button or with Escape.',
          'Some news is about one window: new [[sponsors|sponsor offers]], a [[marketing]] campaign that has ended. A pop-up at the top says so, with a button that opens the window, and the window’s icon in the menu carries a red dot until you open it.',
          'Every piece of news is also an e-mail from your staff, kept in the [[inbox]], so you can read what you missed.',
        ],
      },
      {
        heading: 'The menu',
        body: [
          {
            table: {
              head: ['Button', 'What is there'],
              rows: [
                ['Office', 'Whether everyone has a desk, whether cleaning, repairs and [[morale]] are in order, and every room of the building.'],
                ['Inbox', 'The news, as e-mails from your staff ([[inbox]]). The number on it is what you have not read.'],
                ['Rooms', 'Every kind of room there is, what it is for and what it needs, and the furniture that goes in each ([[furniture]]).'],
                ['Staff', 'Your people, the hiring pool, and rival [[hosts]] you could sign.'],
                ['On air', '[[channels]], [[shows]], the [[schedule]], bought [[content-market|content]], the [[ratings]], and who makes which [[shows|show]].'],
                ['Licenses', 'The map of [[etheria]]: who broadcasts where, and which [[licenses]] are free.'],
                ['Sales', '[[sponsors|Sponsor]] offers and contracts.'],
                ['Marketing', '[[marketing|Campaigns]] and [[prestige|events of your own]].'],
                ['Research', 'The [[research|technology tree]].'],
                ['Finance', 'The month ahead, this month so far, the monthly reports, [[loans]] and [[dividends]].'],
                ['Milestones', 'What the company has reached ([[milestones]]).'],
                ['Wiki', 'This.'],
              ],
            },
          },
          'The cog at the top right opens the Settings ([[saving]]), and the credits of the game.',
        ],
      },
      {
        heading: 'The bar at the bottom',
        body: [
          'From left to right: the date, the speed buttons ([[time]]), and the company’s figures: money, this month’s result so far, listeners (and viewers, once you have television), research points, [[reputation]], [[prestige]] and your rank among the broadcasters. The news ticker at the end announces what is coming.',
        ],
      },
      {
        heading: 'The office view',
        body: [
          { list: ['“Build a room” draws a new room on the floor. Click a room, or its name, to furnish it; the Office window lists every room as well, which is the way with the keyboard. The pencil beside a room’s name in its panel gives it a name of your own.', 'Click a person to see who they are and what they are doing.', '“Cables”, beside the floors, shows the cables of the building: from every studio to the [[headquarters|master control room]] and up to the antenna, green while they carry a channel on the air, red where one can’t go out.', 'Q and E turn the view, + and − zoom, W A S D move it, and 0 puts it back. The view can also be dragged, with the mouse or a finger; two fingers zoom.', 'While placing furniture, R turns the piece and Escape stops.'] },
        ],
      },
      {
        heading: 'Keys',
        body: [
          { table: { head: ['Key', 'Does'], rows: [['Space', 'Pause and continue'], ['1, 2, 3', 'Normal, fast, fastest'], ['Ctrl+S (⌘S on a Mac)', 'Save'], ['Escape', 'Close the window in front']] } },
        ],
      },
    ],
    seeAlso: ['time', 'office', 'saving', 'inbox'],
  },

  inbox: {
    title: 'Inbox',
    category: 'start',
    summary: 'Every piece of news, as an e-mail from the person it concerns.',
    facts: [
      ['Kept', `The last ${count(MAX_MESSAGES)}`],
      ['Your address', 'firstname.lastname@your-company.eth'],
    ],
    sections: [
      {
        body: [
          'Everything the game tells you while it runs, in a toast at the bottom or a pop-up at the top, also arrives as an e-mail to you, the CEO. The Inbox, in the menu under the Office, keeps them, so you can read again what went by too fast. Click a toast to open its e-mail.',
          'The number on the Inbox in the menu is how many you have not read. An e-mail is read once you open it; “Mark all as read” does them all.',
        ],
      },
      {
        heading: 'Who writes',
        body: [
          'The person in the company the news is about, as they are on the day it is sent: their name, their portrait and an address at the company, made from the company’s name.',
          {
            table: {
              head: ['News', 'From'],
              rows: [
                ['[[ratings|Ratings]], a show that lost its audience, a channel off the air, [[licenses]] and [[auctions]]', 'The [[channels|channel manager]]: of that channel, or the one who has been there longest'],
                ['[[sponsors|Sales]], [[marketing]], [[research]]', 'The head of that department, or else someone who works in it'],
                ['The library and bought [[content-market|content]]', 'The head of Production ([[managers]]), or else a channel manager'],
                ['Your people: [[morale]], strikes, [[poaching|rival offers]], courses and levels', 'A [[staff|recruiter]]'],
                ['Dirt, breakdowns and failures ([[upkeep]])', 'A cleaner, a technician or the maintenance staff'],
                ['[[milestones|Milestones]], the [[dividends|dividend]], being in the red and [[loans|bankruptcy]]','[[tabby-loid|Uncle Tabby]], tabby@loid-enterprises.eth'],
                ['[[history|Sports events, elections and recessions]], rivals, and anything nobody is hired for yet', '[[penny-cash|Penny Cash]], penny@loid-enterprises.eth'],
              ],
            },
          },
        ],
      },
      {
        heading: 'Priority',
        body: [
          {
            list: [
              '**High** (red): trouble, and milestones.',
              '**Medium** (amber): warnings, news about one window, something starting in the country, and good news.',
              '**Low**: the rest, such as the weekly ratings, the monthly report, a level reached and a sponsor contract that ran its course. Low news has no toast: it only lands in the inbox.',
            ],
          },
          'The High filter shows only the e-mails that matter most; Unread, those you have not opened.',
        ],
      },
    ],
    seeAlso: ['the-screen', 'tabby-loid', 'penny-cash'],
  },

  saving: {
    title: 'Saving and settings',
    category: 'start',
    summary: 'Saves, the autosave, the difficulty and the options.',
    sections: [
      {
        body: [
          'A game is saved under a name from the Settings window or the main menu. Save writes to the game’s own save; the main menu can save under another name, load a game or start a new one. The game waits while you are in the main menu.',
          'With **autosave** on, the game also saves itself at the start of every month, in a slot of its own that your saves don’t overwrite.',
        ],
      },
      {
        heading: 'Difficulty',
        body: [
          'The difficulty is chosen when a game starts and stays with it. It sets the money a company starts with, what things cost, how good the shows of your [[rivals]] are, and what Uncle Tabby sends for a [[milestones|milestone]]. **Costs** are rent, salaries, license prices and fees, and what titles and sports rights cost on the [[content-market]]; the prices elsewhere in this wiki are those of normal.',
          {
            table: {
              head: ['Difficulty', 'Starting money', 'Costs', 'Rival show quality', 'For a milestone', 'In short'],
              rows: DIFFICULTIES.map((d) => [
                d[0]!.toUpperCase() + d.slice(1),
                euro(STARTING_MONEY[d]),
                percent(DIFFICULTY_COSTS[d]),
                percent(RIVAL_DIFFICULTY[d]),
                percent(MILESTONES.rewardScale[d]),
                { easy: 'One good channel is enough to live on.', normal: 'A single channel gets by; growing pays off.', hard: 'A company that doesn’t grow goes under.' }[d],
              ]),
            },
          },
        ],
      },
      {
        heading: 'Options',
        body: [
          { list: ['**Color scheme:** by the time of day, light or dark. By the time of day, the default, it is light while the sun is up on the office clock and dark before sunrise and after sunset; the sun sets early in winter and not at all in midsummer, when the office day ends before dark. That clock runs through one working day in a month ([[time]]), so in winter the screen turns dark in the second half of the month.', '**Sound volume:** the clicks, furniture being put down, and a short jingle for news and milestones.', '**Reduce motion:** stops the news ticker scrolling and people walking.', '**Penny Cash:** send the [[penny-cash|tutorial]] away or call it back.', '**Check for a new version** (in the desktop app): when the game starts it asks the game’s releases on GitHub whether there is a newer version, and the main menu then says so, with what changed and where to download it. Nothing about you or your games is sent.'] },
        ],
      },
    ],
    seeAlso: ['the-screen', 'rivals'],
  },

  // --- Office and staff ---

  office: {
    title: 'The office',
    category: 'company',
    summary: 'Rooms, floors and rent.',
    facts: [
      ['Building a room', `${euro(BUILD_COST_PER_TILE)} per tile, once`],
      ['Rent', `${euro(RENT_PER_TILE)} per tile a month, on normal`],
      ['Second floor', `at a company value of ${euro(FLOOR_UNLOCK_VALUE[2]!)}`],
      ['Third floor', `at a company value of ${euro(FLOOR_UNLOCK_VALUE[3]!)}`],
      ['Fourth floor', `at a company value of ${euro(FLOOR_UNLOCK_VALUE[4]!)}, in town`],
      ['In the countryside', `${BUILDINGS.long.floors} longer floors instead of ${BUILDINGS.standard.floors}`],
    ],
    sections: [
      {
        body: [
          `Your company has floors in an office building, and builds its own rooms on them. “Build a room” above the office starts one: choose what kind of room it is, and its outline appears on the floor in the next free place, at the usual size for its kind, with a door. To have it elsewhere or another size, drag a rectangle of your own and click one of its walls for the door; “Propose a place” goes back to the game’s proposal. What still stands in the way of building is said above the Build button. Whatever floor you leave open is corridor, which costs nothing.`,
          `Building a room costs ${euro(BUILD_COST_PER_TILE)} a tile, once. From then on its rent is ${euro(RENT_PER_TILE)} a month for every tile on normal ([[saving|difficulty]]), paid day by day.`,
          `A room is a rectangle of at least ${ROOM_MIN} by ${ROOM_MIN} tiles. Rooms may stand wall to wall but not through each other, and a door has to open onto the corridor. Every room has to stay within reach of the stairs and the lifts: the game refuses a room that would close another one off.`,
          'The **kind** of a room decides what [[furniture]] goes in it. It can be changed as long as the room is empty. A room can also be given another shape or another door, as long as its furniture still fits: floor it gains is paid for like new, floor it gives up brings nothing back. An empty room can be taken away again.',
        ],
      },
      {
        heading: 'Kinds of room',
        body: [
          {
            table: {
              head: ['Room', 'What it is for', 'Needs, before it can be used'],
              rows: (Object.keys(ROOM_TYPE_NAMES) as RoomType[]).map((type) => [
                ROOM_TYPE_NAMES[type],
                ROOM_TYPE_NOTES[type],
                type === 'office' ? 'A workstation per member of the office staff' : type === 'writersRoom' ? `${checklist(type)}, and a writer’s place per writer` : type in TV_KIT_ROOMS ? `${checklist(type)}; the control desk and the audio mixer in its control room next door` : checklist(type),
              ]),
            },
          },
          'A room’s panel shows its checklist, with a **Place** button beside every piece that is still missing: press it and pick the spot in the room yourself.',
        ],
      },
      {
        heading: 'The building',
        body: [
          'At the front of every floor, beside the entrance, are the stairs and the lifts. On the ground floor the hall between them is the **reception**, which comes with the building and costs no rent; behind the stairs and the lifts are the rooms where technicians and cleaners wait for work. The floors above have only a hallway there.',
          `The second floor opens when the [[dividends|company is worth]] ${euro(FLOOR_UNLOCK_VALUE[2]!)}, the third at ${euro(FLOOR_UNLOCK_VALUE[3]!)} and the fourth at ${euro(FLOOR_UNLOCK_VALUE[4]!)}.`,
          'Above the top floor is the **roof**, the last tab of the floors above the office. The antenna the company broadcasts from stands there, and a satellite dish beside it once the satellite uplink is [[research|researched]]. They come with the building; nothing on the roof is bought or built. The cables of the studios come up to them through a shaft by the stairs ([[headquarters]]).',
          `Not every building is the same. In town it has ${BUILDINGS.standard.floors} floors with ${BUILDINGS.standard.plan.length} rooms each. A company that starts in [[amplify-hills]] or [[aerial-fields]] gets a longer building of ${BUILDINGS.long.floors} floors with ${BUILDINGS.long.plan.length} rooms each: more room on every floor from the first day, and no fourth floor.`,
        ],
      },
    ],
    seeAlso: ['furniture', 'studios', 'upkeep', 'morale'],
  },

  headquarters: {
    title: 'Headquarters and master control',
    category: 'company',
    summary: 'What a company needs before it goes on the air, and the way its channels go out to the antenna.',
    facts: [
      [FURNITURE.ceoDesk.name, euro(FURNITURE.ceoDesk.cost)],
      [FURNITURE.receptionDesk.name, euro(FURNITURE.receptionDesk.cost)],
      [FURNITURE.mcrDesk.name, euro(FURNITURE.mcrDesk.cost)],
      [FURNITURE.monitorWall.name, euro(FURNITURE.monitorWall.cost)],
      ['A technician at master control', `${percent(MASTER_CONTROL.crew)} of their day`],
    ],
    sections: [
      {
        body: [
          `Nothing goes on the air until the company has a **${ROOM_TYPE_NAMES.ceoOffice}** with your desk in it, and a **${lower(FURNITURE.receptionDesk.name)}** in the reception, the hall that comes with the building on the ground floor (since 0.16.0). They are the first steps of [[penny-cash|Penny’s]] first weeks, after a look around. A CEO’s office can be small: rent goes by the tile.`,
          `A game from before 0.16.0 that lacked either got ${GRACE.days} days to put them in, and the news said until when.`,
        ],
      },
      {
        heading: 'The master control room',
        body: [
          `Every channel goes out through a **${lower(ROOM_TYPE_NAMES.masterControl)}**: a room with a ${lower(FURNITURE.mcrDesk.name)} and a ${lower(FURNITURE.monitorWall.name)}, where a technician sees every channel out. One room serves all your channels, and a narrow one is enough. Its desk takes ${percent(MASTER_CONTROL.crew)} of a technician’s day, before anything else they do ([[upkeep]]). Penny has it built after the studio and points out the Cables view, and the technician hired after the cleaner.`,
          'Without a master control room that has both pieces, or without a technician to work it, every channel is off the air, and its panel says why.',
          `A game from before 0.16.0 that was on the air got ${GRACE.days} days to build one.`,
        ],
      },
      {
        heading: 'Cables',
        body: [
          'Cables are laid by themselves: from every studio (from the control room of a TV studio) to the master control room, and from the master control room up a shaft by the stairs to the antenna, and to the dish once the satellite uplink is [[research|researched]].',
          '“Cables”, beside the floors in the office, shows them, with a list of where each one goes. A cable is green while it carries a channel on the air, red where it should carry one that can’t go out, and grey while nothing goes through it.',
        ],
      },
      {
        heading: 'Off the air for a week',
        body: [
          `A channel that has been off the air for ${OFF_AIR_WARNING.days} days in a row gets a warning in the news, saying why: no manager, no license, no master control room. So does a show on the schedule of a channel on the air that has not gone out for as long, because it has no host, no studio, or its team is on strike. It is said once, until it goes out again.`,
        ],
      },
    ],
    seeAlso: ['office', 'studios', 'channels', 'upkeep'],
  },

  furniture: {
    title: 'Furniture and equipment',
    category: 'company',
    summary: 'What can be placed, what it costs and how it ages.',
    facts: [
      ['Sold in its first week', 'Its whole price back'],
      ['Sold later', `${percent(FURNITURE_WORTH.used)} of its price, falling to ${percent(FURNITURE_WORTH.floor)} over ${FURNITURE_WORTH.years} years, less wear`],
      ['Moving and turning', 'Free'],
      ['Each newer version', `+${percent(TIERS.costPerTier)} of the first price`],
    ],
    sections: [
      {
        body: [
          'Furniture is bought from **Rooms** in the menu on the left, which has a tab for every kind of room with the furniture that goes in it, or from the list in a room’s panel. With a room selected, it opens at its kind. A piece is placed on the tiles of a room of the right kind: point at a free spot and click, or take it there with the arrow keys and press Enter. R turns it. The floor in front of a door stays clear: nothing can be placed there, and a door can’t be moved to where something stands.',
          'Click a piece in the office and a small window opens beside it, to **sell** it, **turn** it, **move** it or leave it be. Moving and turning cost nothing, and a piece can be moved to any room that takes its kind.',
          `A piece is worth less as it gets older. Sold within ${FURNITURE_WORTH.graceDays} days of buying, it gives its whole price back, so a piece bought by mistake costs nothing. After that it is second-hand: it brings ${percent(FURNITURE_WORTH.used)} of its price, and that falls evenly to ${percent(FURNITURE_WORTH.floor)} over ${FURNITURE_WORTH.years} years. What is worn brings less still. Furniture counts towards the worth of your company for what it would sell for.`,
          'Some pieces come in newer versions (tiers) that [[research]] unlocks. The catalog lists those with a lock until then. New pieces are always bought at the best version you have researched; a room’s panel can upgrade what stands there.',
        ],
      },
      {
        heading: 'The pieces',
        body: [
          {
            table: {
              head: ['Piece', 'Goes in', 'Tiles', 'Price', 'Wears out'],
              rows: (Object.keys(FURNITURE) as FurnitureType[])
                .filter((type) => !FURNITURE[type].retired)
                .map((type) => {
                  const spec = FURNITURE[type];
                  return [spec.name, spec.rooms.length > 6 ? 'Every room' : spec.rooms.map((r) => ROOM_TYPE_NAMES[r]).join(', '), `${spec.w} × ${spec.h}`, euro(spec.cost), spec.durable ? 'No' : 'Yes'];
                }),
            },
          },
        ],
      },
      {
        heading: 'Wear',
        body: [
          `Workstations and studio equipment lose ${WEAR.perDay} points of condition a day, out of 100. At 0 a piece is broken: nobody can work at a broken workstation, and one broken piece in a studio halves the studio ([[studios]]). A technician repairs the most worn piece each day ([[upkeep]]).`,
          'Shelves, tables, plants and the like never break.',
        ],
      },
      {
        heading: 'Comfort',
        body: [
          `Planters, couches, TV screens, radios, filing cabinets and dressers make a room nicer. Each adds ${COMFORT.perPiece} to the [[morale]] of the people who work there; an aquarium counts as ${FURNITURE.aquarium.comfort} of them. The best ${COMFORT.maxPieces} pieces of a room count.`,
        ],
      },
      {
        heading: 'Pieces that help',
        body: [
          'Some small pieces do more than look nice (0.16.0). One of each counts in a room:',
          {
            table: {
              head: ['Piece', 'Where', 'What it does'],
              rows: [
                [FURNITURE.calendar.name, 'An office', `The production staff who work there get ${percent(DECOR.calendar)} more done`],
                [FURNITURE.salesChart.name, 'An office', `The sales staff who work there work ${percent(DECOR.salesChart)} better`],
                [FURNITURE.printer.name, 'An office', `Every marketing campaign costs ${percent(DECOR.printer)} less; one printer is enough`],
                [FURNITURE.bin.name, 'Any room', `The room gets dirty ${percent(DECOR.bin)} more slowly`],
                [FURNITURE.dishwasher.name, 'A canteen', `The canteen gets dirty ${percent(DECOR.dishwasher)} more slowly`],
                [FURNITURE.flipChart.name, 'A meeting room', `A meeting there lifts morale ${percent(DECOR.flipChart)} more`],
                [FURNITURE.recordingBooth.name, 'An audio room', `The radio shows its audio engineer looks after are ${percent(DECOR.recordingBooth)} better: jingles and promos`],
              ],
            },
          },
        ],
      },
    ],
    seeAlso: ['office', 'studios', 'research', 'upkeep'],
  },

  studios: {
    title: 'Studios',
    category: 'company',
    summary: 'Where shows are made, and what makes a studio good.',
    sections: [
      {
        body: [
          'A produced show is made in a studio of the kind its genre asks for ([[genres]]). A studio makes one show per time slot, so two shows in the same slot on different channels need two studios.',
          'A studio can be used once everything on its checklist stands in it ([[office]]).',
        ],
      },
      {
        heading: 'Studio level',
        body: [
          'A studio’s level is one of the three things that make a show’s quality ([[ratings]]). It compares the version of the studio’s equipment with what your [[rivals]] use that year: equipment that is behind lowers it, equipment ahead of its time raises it a little.',
          {
            list: [
              `One broken piece of equipment brings the studio to ${percent(WEAR.brokenStudioLevel)} of its level.`,
              `A radio studio whose mixing desk stands in a **control room** next door works ${percent(CONTROL_ROOM.studioLevel - 1)} better.`,
              `A TV studio whose control room nobody works goes out at ${percent(CONTROL_ROOM.unmanned)} of its level.`,
              'A dirty studio makes worse shows ([[upkeep]]).',
            ],
          },
        ],
      },
      {
        heading: 'Radio',
        body: [
          'A **radio studio** needs a mixing desk and an on-air light. A **radio talk studio** also needs a talk table for the guests, unless its mixing desk is of the second version or newer, which seats them itself.',
        ],
      },
      {
        heading: 'Television',
        body: [
          'Every TV studio needs cameras and lights, a **control room** of its own and one more piece, which says what is made there:',
          {
            list: [
              'the **talk show studio** around the talk show set;',
              'the **game show studio** around the game show decor, where two contestants play while the show is on;',
              'the **soap opera studio** around the soap opera decor, a pub, where a cast plays the soap while it is on;',
              'the **sitcom studio** around the sitcom decor, a coffee house, where a cast plays the sitcom while it is on;',
              'the **kids’ studio** around the kids’ show decor, a playroom;',
              'the **reality studio** around the reality decor, a house, with a **confession booth** beside it; its cast lives there while the show is on, and one of them is in the booth;',
              'the **news studio**, for the news and for sports, around a news desk.',
            ],
          },
          `The **control room** of a TV studio stands wall to wall with it, and belongs to that studio alone: it holds the ${lower(FURNITURE.controlDesk.name)} (${euro(FURNITURE.controlDesk.cost)}) and the ${lower(FURNITURE.audioMixer.name)} (${euro(FURNITURE.audioMixer.cost)}), which stand nowhere else, and a technician works them while the studio has shows on the schedule. A control room takes ${percent(CONTROL_ROOM.crew)} of a technician’s day, after the master control room ([[headquarters]]), and that time does not go to repairs ([[upkeep]]); a studio whose control room nobody works goes out at ${percent(CONTROL_ROOM.unmanned)} of its level. Build a control room with a TV studio on its floor and the game proposes the place beside it.`,
          `Each of those pieces stands in its own studio and nowhere else. The game show decor, the soap opera decor and the reality decor have to be [[research|researched]] first; until then their studios cannot be built. Audience seating fills with people while a show is on, and makes a sitcom, a kids’ show or a game show ${percent(STUDIO_AUDIENCE.perBlock)} better for each block, up to ${STUDIO_AUDIENCE.maxBlocks}. See [[television]].`,
          `Two more rooms help the TV shows without making them. In an **editing room** the [[writers|video editors]] work, each at an editing desk. A **dressing room** with a make-up table and a clothes rail gets ${DRESSING.hostsPerTable} hosts of TV shows ready for every make-up table, the most famous first, and a host who is made up makes their show ${percent(DRESSING.bonus)} better.`,
          'Until 0.14.0 sitcoms, kids’ shows and reality TV were made in a **production studio** without a set. In a game from before, that studio became the studio of the kind of show most made there, with its decor for free where it fit. Until 0.16.0 the control desk stood in the TV studio itself; a game from before got a month to build each TV studio its control room, and a control desk can be moved there.',
        ],
      },
    ],
    seeAlso: ['furniture', 'shows', 'genres', 'television', 'headquarters'],
  },

  staff: {
    title: 'Staff',
    category: 'company',
    summary: 'Hiring, skill, salaries, experience and desks.',
    facts: [
      ['New candidates', 'The 1st of every month'],
      ['Shows per host', `${MAX_SHOWS_PER_HOST}: one slot a day`],
      ['Shows per producer', `${MAX_SHOWS_PER_PERSON} at most`],
      ['Firing costs', `${SEVERANCE_MONTHS} month of salary`],
    ],
    sections: [
      {
        body: [
          'People are hired from the **hiring pool** in the Staff window. The pool is new on the 1st of every month; whoever you don’t hire is gone. Each candidate has a **skill** from 1 to 100, and a salary that goes with it. The salaries below are those of normal; the [[saving|difficulty]] makes them lower or higher.',
        ],
      },
      {
        heading: 'Roles',
        body: [
          {
            table: {
              head: ['Role', 'What they do', 'Salary a month', 'In the pool'],
              rows: [
                ['Host', 'Presents shows ([[hosts]]).', `${euro(SALARY.host.min)}–${euro(SALARY.host.max)}`, `${CANDIDATE_POOL.host} best at radio genres, ${TV_HOST_CANDIDATES} at TV genres`],
                ['Production', 'Makes shows. Each genre needs a number of them ([[genres]]).', `${euro(SALARY.production.min)}–${euro(SALARY.production.max)}`, String(CANDIDATE_POOL.production)],
                ['Writer', 'Writes sitcoms, reality TV, soaps, kids’ shows and radio drama ([[writers]]).', `${euro(SALARY.writer.min)}–${euro(SALARY.writer.max)}`, String(WRITER_CANDIDATES)],
                ['Video editor', 'Edits produced TV shows ([[writers]]).', `${euro(SALARY.editor.min)}–${euro(SALARY.editor.max)}`, String(EDITOR_CANDIDATES)],
                ['Audio engineer', 'Keeps radio shows fresh for longer ([[writers]]).', `${euro(SALARY.engineer.min)}–${euro(SALARY.engineer.max)}`, String(ENGINEER_CANDIDATES)],
                ['Channel manager', 'Every channel needs one to broadcast ([[managers]]).', `${euro(SALARY.channelManager.min)}–${euro(SALARY.channelManager.max)}`, String(CANDIDATE_POOL.channelManager)],
                ['Department manager', 'Makes a department better ([[managers]]).', `${euro(SALARY.manager.min)}–${euro(SALARY.manager.max)}`, String(CANDIDATE_POOL.manager)],
                ['Sales', 'Brings in [[sponsors|sponsor offers]].', `${euro(SALARY.sales.min)}–${euro(SALARY.sales.max)}`, String(CANDIDATE_POOL.sales)],
                ['Marketing', 'Runs one [[marketing|campaign]] at a time.', `${euro(SALARY.marketing.min)}–${euro(SALARY.marketing.max)}`, String(CANDIDATE_POOL.marketing)],
                ['R&D', 'Earns [[research]] points.', `${euro(SALARY.researcher.min)}–${euro(SALARY.researcher.max)}`, String(CANDIDATE_POOL.researcher)],
                ['Cleaner', 'Cleans the dirtiest room ([[upkeep]]).', `${euro(SALARY.cleaner.min)}–${euro(SALARY.cleaner.max)}`, String(CANDIDATE_POOL.cleaner)],
                ['Technician', 'Repairs worn equipment ([[upkeep]]).', `${euro(SALARY.technician.min)}–${euro(SALARY.technician.max)}`, String(CANDIDATE_POOL.technician)],
                ['Maintenance', 'Fixes the lighting and the heating ([[upkeep]]).', `${euro(SALARY.maintenance.min)}–${euro(SALARY.maintenance.max)}`, String(CANDIDATE_POOL.maintenance)],
                ['Cook', 'Cooks hot meals in the canteen ([[morale]]).', `${euro(SALARY.cook.min)}–${euro(SALARY.cook.max)}`, String(COOK_CANDIDATES)],
                ['Post room clerk', 'Sorts the post ([[morale]]).', `${euro(SALARY.clerk.min)}–${euro(SALARY.clerk.max)}`, String(CLERK_CANDIDATES)],
                ['Recruiter', 'Brings better people into the pool, and finds a host in the place of one who leaves.', `${euro(SALARY.recruiter.min)}–${euro(SALARY.recruiter.max)}`, String(RECRUITER_CANDIDATES)],
              ],
            },
          },
        ],
      },
      {
        heading: 'Desks',
        body: [
          'Production, sales, marketing and research staff and recruiters each need a **workstation** in an office. A producer without one leaves their show short ([[shows]]): Staffing, in On air, shows who is where and who has room for another show. Managers need a **manager’s desk** in a management office instead ([[managers]]), writers a **writer’s place** in a writers’ room with a story board, video editors an **editing desk** in an editing room and audio engineers an **audio desk** in an audio room ([[writers]]). A cook needs a **stove** in a canteen that has all it needs, and a post room clerk a **sorting case** in a post room ([[morale]]). Hosts, cleaners, technicians and maintenance staff need no desk. Someone without a working desk does nothing at all, and still gets paid. Newer workstations get more work out of the same person: ' + list(TIERS.officeOutput.slice(1).map((o, i) => `+${percent(o - 1)} at version ${i + 2}`)) + '.',
        ],
      },
      {
        heading: 'Who sits where',
        body: [
          'The panel of an office, a management office, a writers’ room, an editing room, an audio room or a post room, and of a canteen with a stove, lists its **workplaces**: how many are taken, and who works at each desk. The same count stands under the room’s name in the office.',
          'As long as you decide nothing, people take whatever desk is free. The newest desks go first: to production, then to the others in the order they were hired; channel managers come before department managers. They may be moved when someone is hired or leaves.',
          'You can give someone a place of their **own**: press “Give to…” beside a workplace and pick who gets it. From then on that desk is theirs. With the buttons under the list, every place of a room that is nobody’s own goes to one job at once, such as Marketing. That is how a department gets an office to itself, with its manager at a desk in a management office next door.',
          'Where someone works matters: the version of their desk, the cleanliness of the room, its comfort pieces and the toilets on its floor are those of the room they sit in ([[morale]], [[upkeep]]). If someone’s own desk breaks, they take a free one until it is repaired. A desk that is sold is nobody’s any more; one that is moved stays whose it was.',
        ],
      },
      {
        heading: 'Experience',
        body: [
          `People earn ${XP.perDay} experience point for each day they work. Going from level 1 to 2 takes ${XP.perLevel} points, and each level after that takes ${XP.perLevel} more than the one before. A level adds ${XP.skillGain.min} to ${XP.skillGain.max} skill, and a raise of at least ${percent(XP.raisePerLevel)}: people who stay get better and dearer.`,
        ],
      },
      {
        heading: 'A course',
        body: [
          `Hosts, writers, video editors and the people in production, sales, marketing and research can be sent on a course, with the Course button beside them in the Staff window. It takes ${TRAINING.days} days and costs ${TRAINING.salaryMonths} months of their salary. They come back ${TRAINING.skillGain.min} to ${TRAINING.skillGain.max} skill points better, and are paid for what they have become.`,
          {
            list: [
              `A stand-in does their work while they are away, at ${percent(TRAINING.standIn)} of their skill. Shows go on; they are a little weaker for a month.`,
              'A course is arranged by the head of the department, who needs a desk: the manager of Production, Sales, Marketing or Research ([[managers]]). A host is sent by a channel manager, a writer or an editor by the manager of Production.',
              'One at a time for each kind of job.',
              'Whoever is away earns no experience at work in that time.',
            ],
          },
        ],
      },
      {
        heading: 'The talent programme',
        body: [
          `A host of skill ${TALENT.maxSkill} or less can go into the talent programme, with the button beside them in the Staff window. It takes a year and costs ${TALENT.salaryMonths} months of their salary, and they present nothing meanwhile: no stand-in, so they have to be off every show first. They come back ${TALENT.skillGain.min} to ${TALENT.skillGain.max} skill points better, ready to present, and are paid for what they have become. A channel manager or a recruiter at a desk arranges it, one host at a time.`,
          { tip: 'A cheap way to a good host: a year of a weak host’s salary and a few months more, against what a skilled host from the pool asks every month.' },
        ],
      },
      {
        heading: 'Recruiters',
        body: [
          `A recruiter works at a workstation in an office and looks for people for you. Each month, a recruiter of average skill in good spirits brings ${RECRUITING.extraEach} more candidates into the pool: hosts first, then people for the other jobs you have. They are better than most, as each is the better of two that were found. A weaker or unhappy recruiter brings fewer; no more than ${RECRUITING.max} recruiters count. A better candidate also asks a higher salary.`,
          `When a host signs with a rival and works out their notice ([[poaching]]), a recruiter finds someone in their place on day ${RECRUITING.replaceDays} of it: a host best at the same genres, within ${RECRUITING.skillSpread} points of their skill. They wait in the hiring pool, past the 1st of the month, until you hire them or the host has gone.`,
          'A recruiter can also arrange the talent programme, as a channel manager does. Recruiters belong to the support staff ([[morale]]).',
        ],
      },
      {
        heading: 'How well people work',
        body: [
          'Skill is not the whole story. People work worse in a dirty room and better with good [[morale]], and a department [[managers|manager]] adds to the skill of their team.',
        ],
      },
      {
        heading: 'The working day',
        body: [
          `What you see in the office follows the clock beside the date ([[time]]). It changes nothing in what people do for the company: it is there to look at.`,
          {
            list: [
              `**Office and support staff, managers and you** are in from ${formatHour(DAY.office.from)} to ${formatHour(DAY.office.to)}.`,
              `**Hosts** come by taxi shortly before their first show and leave shortly after their last. A host with no show on the air stays at home.`,
              `**Production staff** work eight hours around the shows they make: early if they make the morning show, into the evening if they make a late one.`,
              `Whoever is needed for the first show is in before the day begins.`,
            ],
          },
          `People come on foot, by bus or by taxi, differently from day to day. The bus stands at the stop in front of the office at a quarter to every hour; a taxi stops at the entrance. They walk in through the entrance, and those who work upstairs take the lift. Inside they find their own way: through the doors, and around the furniture where it leaves them room. Furniture that blocks a door stops nobody, but they have to squeeze past it.`,
          `Between ${formatHour(DAY.lunch.from)} and ${formatHour(DAY.lunch.to)} everyone but the hosts looks for a free seat in a canteen, each at a moment of their own; those who work late eat again around dinner time. The audience of a show comes by bus before it begins and goes home after ([[studios]]).`,
          'Click someone in the office to see where they are; the Staff window lists everyone, also those who are not in.',
        ],
      },
    ],
    seeAlso: ['hosts', 'writers', 'managers', 'morale', 'upkeep'],
  },

  hosts: {
    title: 'Hosts',
    category: 'company',
    summary: 'Skill, specialties and fame.',
    facts: [
      ['Outside their genres', `${percent(OFF_SPECIALTY_SKILL)} of their skill`],
      ['Fame adds', `up to +${percent(FAME_APPEAL)} appeal`],
    ],
    sections: [
      {
        body: [
          `A host presents a show. Hosts have a **skill**, one or two **genres they are best at**, and **fame**. In their own genres their skill counts in full; in any other genre it counts for ${percent(OFF_SPECIALTY_SKILL)}. The list of hosts in a show’s form marks the right ones with a star.`,
          `Any host can present any show that has a host: a sitcom, a soap and reality TV have none, their [[writers]] make them. Of the hosts in the hiring pool each month, ${CANDIDATE_POOL.host} are best at radio genres and ${TV_HOST_CANDIDATES} at TV genres; on the other side of that line they are outside their genres like anyone else.`,
        ],
      },
      {
        heading: 'Fame',
        body: [
          `Fame runs from 0 to 100 and makes every show of that host more appealing, by up to ${percent(FAME_APPEAL)} at fame 100 ([[ratings]]). It follows the audience of the host’s best show: with ${count(FAME_HALF_LISTENERS)} listeners it heads for 50, with three times as many for 75. It rises slowly and fades more slowly still when the audience shrinks.`,
          'Fame also makes a host dearer, and it makes [[rivals]] want them ([[poaching]]). An [[prestige|event of your own]] gives your best-known host a push.',
        ],
      },
    ],
    seeAlso: ['staff', 'shows', 'poaching', 'ratings'],
  },

  writers: {
    title: 'Writers, editors and engineers',
    category: 'company',
    summary: 'Who writes the sitcoms, the soaps and the reality TV, who edits the TV shows, and who looks after the sound of the radio shows.',
    facts: [
      ['Shows per writer', `${WRITERS.showsEach} at most`],
      ['Shows per editor', `${EDITORS.showsEach} at most`],
      ['Shows per audio engineer', String(ENGINEERS.showsEach)],
      ['In the pool', `${WRITER_CANDIDATES} writers, ${EDITOR_CANDIDATES} editors and ${ENGINEER_CANDIDATES} audio engineers a month`],
      ['On a show writers help', `up to +${percent(WRITERS.bonus)}`],
      ['Editing', `up to +${percent(EDITORS.bonus)}`],
      ['Engineering', `up to ${percent(ENGINEERS.slower)} slower wear`],
    ],
    sections: [
      {
        body: [
          'A **writer** writes shows. Writers work in a **writers’ room**: it needs a story board, and a **writer’s place** at the table for each of them. Places put side by side make one long table. A writer without a place in a writers’ room with its story board writes nothing, and still gets paid ([[staff]]). Like a workstation, a newer place gets more written.',
          'Writers are picked in a show’s form, as many as you like up to what the show can use; each writes for at most ' + `${WRITERS.showsEach}` + ' shows.',
        ],
      },
      {
        heading: 'Shows without a host',
        body: [
          'A **sitcom**, a **soap opera** and **reality TV** have no host. A cast plays them, people the company does not employ, and their writers make them: the writers’ work counts in a show’s quality where a host’s skill would ([[ratings]]). Such a show needs writers before it goes on the air:',
          { table: { head: ['Genre', 'Writers it needs'], rows: GENRES.filter((g) => g.writers?.lead).map((g) => [g.name, String(g.writers!.needed)]) } },
          'Fewer writers than that count for less, as producers do. Nobody on such a show has fame, so it has none of the lift a famous host gives ([[hosts]]).',
        ],
      },
      {
        heading: 'Shows they help',
        body: [
          `A kids’ show and a radio drama keep their host, and go on the air without writers. Writers make them better, by up to ${percent(WRITERS.bonus)} with the best writing there is:`,
          { table: { head: ['Genre', 'Writers it can use'], rows: GENRES.filter((g) => g.writers && !g.writers.lead).map((g) => [g.name, String(g.writers!.needed)]) } },
        ],
      },
      {
        heading: 'Video editors',
        body: [
          `A **video editor** cuts a produced TV show. Editors work in an **editing room**, one to a room, at an editing desk, which comes in the versions of the TV equipment ([[research]]): a newer one gets more done. A show has one editor at most, chosen in its form, and an editor edits ${EDITORS.showsEach} shows. A show goes on the air without one; a good editor makes it up to ${percent(EDITORS.bonus)} better.`,
        ],
      },
      {
        heading: 'Audio engineers',
        body: [
          `An **audio engineer** looks after the sound of the radio shows you make, so that listeners tire of them more slowly: a show an engineer looks after loses up to ${percent(ENGINEERS.slower)} less of its [[freshness]] each day it airs, by how good the engineer is. Engineers work in an **audio room**, one to a room, at an audio desk, which comes in the versions of the radio equipment: a newer one gets more done. With a **recording booth** (${euro(FURNITURE.recordingBooth.cost)}) beside the desk, the engineer records jingles and promos as well, and the shows they look after are ${percent(DECOR.recordingBooth)} better.`,
          `Nobody picks the shows: each engineer looks after ${ENGINEERS.showsEach} radio shows that are on the air, the best engineers taking the shows with the most listeners. The audio room’s panel says how many of your radio shows are looked after.`,
        ],
      },
    ],
    seeAlso: ['staff', 'studios', 'shows', 'genres'],
  },

  managers: {
    title: 'Managers',
    category: 'company',
    summary: 'Channel managers and department managers.',
    sections: [
      {
        heading: 'Channel managers',
        body: [
          'Every channel needs a channel manager, or it does not broadcast. One manager runs one channel. A skilled channel manager makes the channel’s [[reputation]] grow faster, and fills empty slots on the [[schedule]] with reruns.',
        ],
      },
      {
        heading: 'Department managers',
        body: [
          `There can be one manager each for Production, Sales, Marketing and R&D. A manager adds up to ${percent(MANAGER.maxBonus)} to the skill of up to ${MANAGER.teamSize} people in their department; how much depends on the manager’s own skill. With a bigger department, the ${MANAGER.teamSize} best are helped.`,
          'You can also make someone from the department its head (since 0.17.0), with the button by their name on the Staff window: writers, video editors and audio engineers count as Production. They leave their shows, their campaign and their desk, and are paid at least a manager’s salary for their skill. There is no way back down; firing is the way out, as for any manager.',
        ],
      },
      {
        heading: 'The management office',
        body: [
          `Managers do not work at a workstation. Every manager, of a channel or of a department, needs a **${lower(FURNITURE.managerDesk.name)}** in a **management office** of their own: one desk to a room (since 0.16.0), which you build and set up like any other ([[office]]). A desk costs ${euro(FURNITURE.managerDesk.cost)} and does not wear out; a small room is enough, as rent goes by the tile.`,
          'A channel whose manager has no desk is off the air, and a department manager without one helps nobody. The Staff window marks a manager who has no desk, and the Office window counts the desks against the managers.',
          `You are in the office yourself, as the CEO: the character you made when the game started, with a star over its head. Your own **${ROOM_TYPE_NAMES.ceoOffice}**, a kind of room of which a company has one, with a **${lower(FURNITURE.ceoDesk.name)}** in it (${euro(FURNITURE.ceoDesk.cost)}), is where you work, and nothing goes on the air without it ([[headquarters]]). Your name and your character can be changed in Settings ([[saving]]).`,
          { tip: 'Build the management office before you hire the manager, and one more for every manager after that. In a game from before 0.16.0 the desks beyond the first in a management office were sold back.' },
        ],
      },
    ],
    seeAlso: ['staff', 'channels', 'reputation'],
  },

  upkeep: {
    title: 'Cleaning, repairs and maintenance',
    category: 'company',
    summary: 'What the support staff do, and what happens without them.',
    sections: [
      {
        body: [
          'Cleaners, technicians and maintenance staff need no desk and no orders. Each day each of them goes to the room or the piece that needs them most. The Office window shows whether they keep up.',
        ],
      },
      {
        heading: 'Cleaning',
        body: [
          `Rooms get dirtier with use: an office by the people at its desks, a studio by the shows made in it, a canteen by the people it feeds. Above ${CLEANLINESS.cleanEnough}% a room is clean enough. Below that, the people in it work worse and feel worse; in a filthy room work and show quality drop to ${percent(CLEANLINESS.minFactor)}.`,
          `A cleaner of average skill restores ${CLEANLINESS.cleanerPerDay} points a day in the dirtiest room. A bin in a room makes it get dirty ${percent(DECOR.bin)} more slowly, and a dishwasher in a canteen ${percent(DECOR.dishwasher)} more slowly ([[furniture]]).`,
        ],
      },
      {
        heading: 'Repairs',
        body: [
          `Equipment wears ([[furniture]]). A technician of average skill repairs ${WEAR.technicianPerDay} points a day on the most worn piece. After the personal computer is [[research|researched]], technicians are called IT technicians; the work is the same.`,
          `Technicians also work desks (0.16.0): the master control desk while a channel goes out through it, for ${percent(MASTER_CONTROL.crew)} of a technician’s day, and the control room of every TV studio with shows on the schedule, for ${percent(CONTROL_ROOM.crew)} each ([[headquarters]], [[studios]]). They take those first, the longest hired first, and repair with what is left of their day. A control room nobody can work makes its studio’s shows weaker; a master control room nobody works keeps every channel off the air.`,
        ],
      },
      {
        heading: 'The building',
        body: [
          `Now and then the lighting or the heating fails in a room: a chance of ${(ISSUES.dailyChancePerRoom * 100).toFixed(1)}% per room per day. Until it is fixed, the [[morale]] of the people in that room suffers. It takes one maintenance worker about ${ISSUES.work} days.`,
        ],
      },
    ],
    seeAlso: ['morale', 'furniture', 'staff'],
  },

  morale: {
    title: 'Morale',
    category: 'company',
    summary: 'What makes people happy at work, and what it is worth.',
    facts: [
      ['Without anything', String(MORALE.neutral)],
      ['A canteen for all', `+${MORALE.canteenBonus}`],
      ['Hot meals for all', `+${COOKS.morale}`],
      ['A meeting', `+${MEETINGS.morale} for ${MEETINGS.lasts} days`],
      ['Post for all', `+${POST.morale}`],
      ['A strike', `after ${STRIKES.warnAfter + STRIKES.strikeAfter} days under ${STRIKES.below}`],
      ['Work at morale 100', `+${percent(MORALE.maxFactor - 1)}`],
      ['Work at morale 0', `−${percent(1 - MORALE.minFactor)}`],
    ],
    sections: [
      {
        body: [
          `Everyone has a morale from 0 to 100. It drifts a little each day toward what their workplace deserves. At ${MORALE.neutral} it changes nothing; above that people work better, up to ${percent(MORALE.maxFactor - 1)} more at 100, and below it worse, down to ${percent(1 - MORALE.minFactor)} less at 0. For hosts and producers, that goes straight into the quality of their shows.`,
        ],
      },
      {
        heading: 'What moves it',
        body: [
          {
            table: {
              head: ['What', 'Effect'],
              rows: [
                ['A clean office, no canteen', `${MORALE.neutral}`],
                ['A canteen that serves everyone', `+${MORALE.canteenBonus}; less if it serves only part of the staff`],
                ['Hot meals from its cooks', `+${COOKS.morale} for everyone who gets one`],
                ['Their team’s meeting', `+${MEETINGS.morale} for ${MEETINGS.lasts} days, less in a room too small for the team`],
                ['The post, sorted', `+${POST.morale} for everyone whose post is sorted`],
                ['Comfort pieces in the room, or in the canteen', `+${COMFORT.perPiece} each (an aquarium ${FURNITURE.aquarium.comfort}), the best ${COMFORT.maxPieces} of a room`],
                ['Complete toilets on the floor', `+${COMFORT.toilets}`],
                ['A dirty room', `up to −${MORALE.dirtPenalty}`],
                ['Lighting or heating out of order', `−${MORALE.issuePenalty}`],
              ],
            },
          },
          'Morale tops out at 100. A canteen and its comfort alone no longer get people there (since 0.15.0): the cook, the meetings and the post do the rest. The Teams panel in the Staff window shows each team’s morale, and what lifts everyone’s.',
        ],
      },
      {
        heading: 'The canteen',
        body: [
          `A canteen is a room with at least a table, a coffee machine, a fridge and a counter. Nobody needs a chair of their own: people do not all eat at once, so a table with four chairs serves ${STAFF_PER_TABLE} people over the day. A growing staff needs more tables, and a dirty canteen serves fewer.`,
          `With a **stove** (${euro(FURNITURE.stove.cost)}) and a **cook** at it there are hot meals as well. A cook of average skill cooks for ${COOKS.mealsEach} people a day; more skill, a clean canteen and good spirits make it more. Everyone who gets a hot meal gains ${COOKS.morale} morale, and nobody gets one the canteen has no seat for. Each cook needs a stove of their own.`,
        ],
      },
      {
        heading: 'Meetings',
        body: [
          `In a **meeting room** with a meeting table (${euro(FURNITURE.meetingTable.cost)}, ${SEATS_PER_MEETING_TABLE} seats), a manager can call their team together: the manager of Production for the production staff, writers, video editors and audio engineers; the manager of Sales, Marketing or R&D for theirs. Hosts and support staff have no meetings. The button is in the Teams panel of the Staff window.`,
          `A **channel manager** at a desk calls the meetings of the production team of their channel: everyone in production who works on its shows, and the audio engineer who looks after them. Someone on the shows of two such channels meets with the one where most of their shows air. They no longer sit in the meeting of Production, which is for those who are left; a channel manager needs no manager of Production for theirs. Each channel has its own row in the Teams panel, with its own Meeting button and “Every month”.`,
          `A meeting lifts the team’s morale by ${MEETINGS.morale} for ${MEETINGS.lasts} days, in full when everyone has a seat, and for less when the team is bigger than the room; a flip chart in the room makes it ${percent(DECOR.flipChart)} more. It costs a day: while the team sits there, it gets only ${percent(MEETINGS.workOnTheDay)} of its work done. A team meets once every ${MEETINGS.every} days at most, and a meeting room holds one meeting a day. Tick “Every month” and the team meets by itself whenever it may and a room is free.`,
        ],
      },
      {
        heading: 'The post',
        body: [
          `Letters come in every day: for the staff, from listeners, and fan mail for the hosts. In a **post room** a clerk at a sorting case (${euro(FURNITURE.sortingCase.cost)}) sorts them: a clerk of average skill sorts the post of ${POST.staffEach} people. Everyone whose post is sorted gains ${POST.morale} morale, and while a clerk is at work the fan mail reaches the [[hosts]], whose fame grows ${POST.fameGrowth} times as fast.`,
          'The bought titles come by post too: a [[content-market|library]] can’t be built, and no titles bought, without a post room with its sorting case, until a library has a server rack. That needs no clerk.',
        ],
      },
      {
        heading: 'Strikes',
        body: [
          `The staff are in teams: the hosts; production (with the writers, the video editors and the audio engineers); sales; marketing; R&D; and the support staff (cleaners, technicians, maintenance, cooks and clerks). Managers belong to none. A team whose average morale stays under ${STRIKES.below} for ${STRIKES.warnAfter} days **threatens to strike**, and says on which day. If its morale is still under ${STRIKES.below} then, ${STRIKES.strikeAfter} days later, it walks out for ${STRIKES.days} days. Morale back at ${STRIKES.recover} or more calls it off.`,
          `On strike, a team does nothing: hosts present nothing and their shows go to reruns, production makes no shows, sales and marketing stop, R&D earns no points, and the support staff neither clean nor repair. Strikers stay at home. A bonus of ${percent(STRIKES.bonusMonths)} of a month’s salary each ends a strike at once. However it ends, the team comes back ${STRIKES.moraleAfter} points happier, for having been heard; if nothing changes, it will not last.`,
          { tip: 'A strike starts with what made the morale low: a dirty office, broken lighting or heating, no canteen. Put that right first; a meeting buys a month.' },
        ],
      },
    ],
    seeAlso: ['upkeep', 'office', 'staff', 'managers'],
  },

  // --- On the air ---

  channels: {
    title: 'Channels',
    category: 'air',
    summary: 'What a channel is and what it needs.',
    facts: [
      ['Most channels', String(MAX_PLAYER_CHANNELS)],
      ['Needs', 'A channel manager, a license and a master control room'],
      ['Warning', `After ${OFF_AIR_WARNING.days} days off the air`],
    ],
    sections: [
      {
        body: [
          `A channel is a radio station or a TV station. It has a name, a logo, a [[managers|channel manager]], a [[schedule]] of five slots, and a [[licenses|license]] for each region it broadcasts in. You can have up to ${MAX_PLAYER_CHANNELS}.`,
          'A channel is **off the air** while it has no manager or no license, while the company has no CEO’s office or no reception desk, and while there is no master control room with a technician at its desk ([[headquarters]]). The channel’s panel says which. Its manager is chosen there, from the channel managers you have hired; one runs one channel.',
          `A channel that has been off the air for ${OFF_AIR_WARNING.days} days in a row gets a warning in the news, with the reason; so does a show on the schedule that has not gone out for as long. It is said once, until it goes out again.`,
          'With radio and TV channels both, the list can be narrowed to one kind. Each channel’s “Schedule” button opens its [[schedule]], where its [[shows]] are made and put in a slot.',
          'The same schedule goes out in every region the channel has a license for. That is what makes a second region cheap: the shows and the people are paid for already.',
        ],
      },
      {
        heading: 'Specialization',
        body: [
          `When ${SPECIALIZATION.minSlots} or more of the five slots hold shows from the same group (Music, News & Talk, Entertainment, Fiction, Sports or Factual), the channel is known for it, and those shows are ${percent(SPECIALIZATION.bonus - 1)} more appealing.`,
        ],
      },
    ],
    seeAlso: ['licenses', 'schedule', 'reputation', 'managers', 'headquarters'],
  },

  licenses: {
    title: 'Licenses',
    category: 'air',
    summary: 'The permit to broadcast in a region: prices, numbers and terms.',
    facts: [
      ['A license runs', `${RENEWAL.termYears} years`],
      ['After giving one up', `no new one there for ${RENEWAL.barYears} years`],
    ],
    sections: [
      {
        body: [
          `A new company buys its first license in the region it likes. Licenses in other regions, and the auctions of new ones, open with the milestone ${opensWith('regions')} ([[milestones]]).`,
          'To broadcast in a region, a channel needs a license for it: one for radio, another for TV. A license costs a price once and a fee every month. Both follow the number of people in the region, so they rise as it grows. The table has the prices of 1970 on normal; the [[saving|difficulty]] makes them lower or higher.',
          {
            table: {
              head: ['Region', 'People in 1970', 'Radio license', 'Radio fee a month', 'TV license', 'TV fee a month'],
              rows: REGIONS.map((r) => [r.name, count(r.population1970), euro(licensePrice('radio', r.id, LIST_PRICES)), euro(licenseMonthly('radio', r.id, LIST_PRICES)), euro(licensePrice('tv', r.id, LIST_PRICES)), euro(licenseMonthly('tv', r.id, LIST_PRICES))]),
            },
          },
        ],
      },
      {
        heading: 'How many there are',
        body: [
          `A region has ${RADIO_LICENSE_SLOTS.base} radio licenses, plus one for every ${count(RADIO_LICENSE_SLOTS.peoplePerSlot)} people. Your [[rivals]] hold some of them from the start.`,
          'TV licenses are few. The broadcasting authority issues them one at a time, in fixed years; the public broadcaster [[epb]] holds the first in every region.',
          { table: { head: ['Region', 'TV licenses issued in'], rows: REGIONS.map((r) => [r.name, TV_LICENSE_YEARS[r.id].join(', ')]) } },
          'A license that is still free can be bought at the list price. One that is issued later is [[auctions|auctioned]].',
        ],
      },
      {
        heading: 'Terms',
        body: [
          `A license runs for ${RENEWAL.termYears} years and then goes into a renewal round, where rivals can bid for it ([[auctions]]). A license you give up is not refunded, and you cannot get another for that medium in that region for ${RENEWAL.barYears} years.`,
        ],
      },
    ],
    seeAlso: ['auctions', 'channels', 'etheria', 'reputation'],
  },

  auctions: {
    title: 'Auctions and renewals',
    category: 'air',
    summary: 'How new licenses are sold, and how you keep the ones you have.',
    sections: [
      {
        heading: 'A new license',
        body: [
          `When a new license is issued in a region, it is auctioned for ${AUCTION.days} days. Everyone bids once, without seeing the other bids; the highest bid wins and is paid at once. The lowest bid allowed is the list price. The auction shows how many rivals are interested, not what they bid.`,
          'Auctions are on the Channels page of the On air window.',
        ],
      },
      {
        heading: 'A renewal round',
        body: [
          `A license runs ${RENEWAL.termYears} years. You are warned a year before it ends, and for the last ${RENEWAL.auctionDays} days it is auctioned again. The lowest bid is what the license earns in advertising in about ${Math.round(RENEWAL.reserveYears * 12)} months, and never less than the list price.`,
          `As the holder you have an advantage: your bid counts for ${percent(RENEWAL.holderAdvantage)} more than it is. If you don’t bid, or a rival outbids you, the license and the region are gone, and you cannot buy a license for that medium there for ${RENEWAL.barYears} years.`,
          'The same goes for your rivals: when one of their licenses comes up, you can bid for it.',
        ],
      },
      {
        heading: 'Event rights',
        body: ['The TV rights to a World Cup or the Olympics are auctioned the same way; see [[sports-rights]].'],
      },
    ],
    seeAlso: ['licenses', 'rivals', 'sports-rights'],
  },

  shows: {
    title: 'Shows',
    category: 'air',
    summary: 'Making a show, and what makes it good.',
    sections: [
      {
        body: [
          'There are two kinds of program. A **produced show** is made by your own people: it has a genre, a host, production staff and a studio. A **library program** airs titles you bought on the [[content-market]]; it needs none of those, only a library. Library programs are for television.',
          `A host presents one show, which is one slot a day: a full day of produced shows takes a host for every slot. Someone in production can work on ${MAX_SHOWS_PER_PERSON} shows at most.`,
        ],
      },
      {
        heading: 'Where shows are made',
        body: [
          'Shows are made on the [[schedule]] of a channel: in On air, press “Schedule” on the channel. A radio channel’s schedule has a button for a radio show and one for a radio talk show; a TV channel’s for a produced TV show and one for a program from the library. A new show starts in no slot.',
          'Press a show, on the schedule or beside it, to see it in full: its quality, what it is made of and its sponsor. That is where it is changed, revamped ([[freshness]]) and cancelled.',
        ],
      },
      {
        heading: 'Who makes what',
        body: [
          `**Staffing**, in On air, has every show in one place. A grid shows which show each studio makes in every slot, and on which channel. Under it is a card for each produced show: its host, with their skill and the genres they are best at, its producers, writers and editor, and a tag that says whether it has enough people. Beside it are the people who could take on another show. Its Change button opens the show on its channel’s schedule.`,
          `A show is **short** when fewer of its producers are at a desk than its genre needs; its production drops in proportion. A producer without a workstation does not count. The schedule tags a show that is short, the Staffing tab gets a dot, and you get a message the day a show on the air falls short. A producer beyond the ${EXTRA_PRODUCER.max} extras who still help adds nothing, and is better on another show.`,
        ],
      },
      {
        heading: 'Quality',
        body: [
          'A produced show’s quality comes from three things. They multiply, so one weak one pulls the whole show down.',
          {
            table: {
              head: ['Part', 'Weight', 'What it is'],
              rows: [
                ['The host', '40%', 'Their skill, in full for a genre they are best at ([[hosts]]).'],
                ['Production', '30%', `The average skill of the best producers on the show, as many as the genre needs. With fewer than that it drops in proportion; every producer beyond that adds ${percent(EXTRA_PRODUCER.bonus)}, for up to ${EXTRA_PRODUCER.max} of them.`],
                ['The studio', '30%', 'How its equipment compares with the times ([[studios]]).'],
              ],
            },
          },
          'A dirty studio and low [[morale]] lower the result; good morale raises it. The show’s form shows the quality to expect before you create it.',
        ],
      },
      {
        heading: 'From quality to listeners',
        body: ['Quality is the start. How many people a show draws also depends on who is listening at that hour, what the genre means to them, how fresh the show is, the host’s fame and the channel’s name. That is in [[ratings]].'],
      },
    ],
    seeAlso: ['genres', 'schedule', 'ratings', 'freshness'],
  },

  genres: {
    title: 'Genres',
    category: 'air',
    summary: 'Every kind of show, where it is made and who likes it.',
    sections: [
      {
        body: [
          'A show’s genre decides which studio it needs, how many producers, and how much each [[audiences|audience]] cares for it: **High** counts in full, **Medium** for 60% and **Low** for 25%. “From” is the year the genre exists; some also need [[research]] before you can make them.',
        ],
      },
      { heading: 'Radio', body: [{ table: { head: genreHead, rows: genreRows('radio') } }] },
      {
        heading: 'Television',
        body: [
          { table: { head: genreHead, rows: genreRows('tv') } },
          `${getGenre('tvSports').name} shows the games while you hold sports broadcast rights, and only talks about sport without them ([[sports-rights]]). ${getGenre('teleshopping').name} draws few viewers but pays a fee for every airing instead of advertising.`,
        ],
      },
    ],
    seeAlso: ['shows', 'audiences', 'schedule', 'television'],
  },

  schedule: {
    title: 'The schedule',
    category: 'air',
    summary: 'Five slots a day, and who is tuned in when.',
    sections: [
      {
        body: [
          `A channel’s day has five slots: ${list(SLOTS.map((slot) => lower(SLOT_NAMES[slot])))}. The schedule repeats every day. A show fills one slot on one channel.`,
          'Each channel has a schedule of its own: in On air, press “Schedule” on the channel. Above the slots are the shows of its medium that are in no slot yet, and those on your other channels. To put a show in a slot, drag it there, or press the show and then the slot. A show dragged onto a slot that is taken changes places with the show that was there; one dragged back to the row above goes off the air.',
          'An empty slot is filled by the channel manager with a **rerun**, which hardly anyone tunes in for. A show that can’t air, because its studio is not ready or it has no host, becomes a rerun too; its slot names the problem.',
          'A studio and a host can’t be in two places at once: two shows in the same slot on different channels need different studios and different hosts.',
        ],
      },
      {
        heading: 'Who is tuned in',
        body: [
          'The share of each audience that has the radio on:',
          { table: { head: slotHead, rows: tunedRows('radio') } },
          'And the television:',
          { table: { head: slotHead, rows: tunedRows('tv') } },
          { tip: 'Radio is a morning medium and television an evening one. Put your best show where the most people are, and the show for an audience where that audience is. Each slot on the schedule names who is tuned in, and with a show pressed, how well it suits the slot ([[market-leader]]).' },
        ],
      },
    ],
    seeAlso: ['shows', 'audiences', 'genres', 'ratings'],
  },

  'market-leader': {
    title: 'Becoming the biggest',
    category: 'air',
    summary: 'What wins listeners and viewers, slot by slot, channel by channel and region by region.',
    sections: [
      {
        body: [
          'The biggest company in radio, or in television, is the one with the most listeners or viewers over all regions together: more than any rival company. Being it is a milestone, and the Ratings page says who is ([[ratings]]).',
          'There is no single way there, but the game rewards a few things above all.',
        ],
      },
      {
        heading: 'Win the audience in each slot',
        body: [
          'Every slot has its own crowd ([[schedule]]): on the radio, the morning belongs to workers, professionals, families and seniors, and late at night to students and teens; on television more than half of everyone watches in the evening. A show is chosen by how much the people tuned in like its genre ([[genres]]), so the same show draws more in one slot than in another.',
          'People divide over the shows by appeal **squared** ([[ratings]]). Being the clear first choice of the audiences in a slot pays far more than being a fair second choice for everyone.',
          { tip: 'On the schedule, each slot says who is tuned in. Press a show and every slot says how well it suits it: good, fair or poor. An empty slot names the genres that would suit it best.' },
        ],
      },
      {
        heading: 'Specialize, or not',
        body: [
          `${SPECIALIZATION.minSlots} slots of one kind of genre (music, fiction, news and talk…) make those shows ${percent(SPECIALIZATION.bonus - 1)} more appealing ([[channels]]). That can be worth a slot that suits its crowd a little less, and Penny's first schedule is built that way. A channel can also follow its crowds slot by slot instead: both work, and the schedule says what each choice gives.`,
        ],
      },
      {
        heading: 'More channels, for other people',
        body: [
          `A company can run up to ${MAX_PLAYER_CHANNELS} channels. Your own channels share the audience between them exactly as rivals do: a second music station takes listeners from the first. A second channel grows the company when it is aimed at the audiences the first one leaves to others, such as news and talk for professionals and seniors beside music for the young.`,
        ],
      },
      {
        heading: 'More regions',
        body: ['Listeners and viewers are counted over every region a channel broadcasts in, so every license adds people ([[licenses]]). Each region has its own three audiences ([[audiences]]); a channel suits some regions better than others.'],
      },
      {
        heading: 'Keeping what you have',
        body: [
          {
            list: [
              '**Freshness:** a show goes stale a little every day; a revamp makes it new ([[freshness]]). Bought titles go stale with every airing and need rest between airings ([[content-market]]).',
              '**Reputation:** a channel’s reputation moves towards the average quality of all five slots, so reruns and weak shows pull every slot down ([[reputation]]).',
              '**Rivals:** every quarter each rival channel replaces its weakest show, rivals get better every year, and they move into new regions ([[rivals]]).',
              '**Marketing** lifts a show or a channel while it runs, and fades after ([[marketing]]).',
            ],
          },
          'A show’s card on the schedule shows each of these as a figure, with arrows against a week ago, and the strongest rival in its slot. When a show loses much of its audience in a week, the news says why.',
        ],
      },
      {
        heading: 'And the money',
        body: ['Audiences are not worth the same to advertisers: professionals the most, students the least ([[audiences]]). The biggest audience is not always the richest one, and a sponsor pays more for the audience it wants ([[sponsors]]).'],
      },
    ],
    seeAlso: ['schedule', 'ratings', 'audiences', 'channels', 'rivals'],
  },

  audiences: {
    title: 'Audiences',
    category: 'air',
    summary: 'The six groups of people, how many there are and what they are worth.',
    sections: [
      {
        body: [
          'The people of [[etheria]] come in six groups. They like different [[genres]], listen at different hours ([[schedule]]), and are worth different amounts to advertisers.',
          {
            table: {
              head: ['Audience', 'Share in 1970', 'Share in 2030', 'Worth to advertisers'],
              rows: AUDIENCES.map((a) => [a.name, percent(a.share), percent(a.share2030), `× ${a.sponsorValue}`]),
            },
          },
          'The shares shift evenly over the years: the country gets older and better educated.',
        ],
      },
      {
        heading: 'By region',
        body: [
          `Each region has three audiences that are its own. They are twice as common there as in a region where they aren’t: ${REGIONAL_AUDIENCES.main} times their national share against ${REGIONAL_AUDIENCES.other} times.`,
          { table: { head: ['Region', 'Its audiences'], rows: REGIONS.map((r) => [r.name, r.mainAudiences.map((id) => AUDIENCES.find((a) => a.id === id)!.name).join(', ')]) } },
        ],
      },
    ],
    seeAlso: ['genres', 'schedule', 'etheria', 'money'],
  },

  ratings: {
    title: 'Ratings',
    category: 'air',
    summary: 'Why people choose one show over another.',
    sections: [
      {
        body: [
          'Every slot of every day, in every region, the people who are tuned in choose between the shows on the air: yours, your rivals’, and switching off. Each show has an **appeal** for each audience, and the audience divides itself by appeal.',
        ],
      },
      {
        heading: 'Appeal',
        body: [
          'A show’s appeal for an audience is these multiplied together:',
          {
            table: {
              head: ['What', 'Range', 'More in'],
              rows: [
                ['Quality', '0 to 1 and a little over', '[[shows]]'],
                ['How much the audience likes the genre', '25%, 60% or 100%', '[[genres]]'],
                ['Freshness', `${percent(FRESHNESS_MIN)} to 100%`, '[[freshness]]'],
                ['The host’s fame', `up to +${percent(FAME_APPEAL)}`, '[[hosts]]'],
                ['The channel’s reputation in the region', '50% to 150%', '[[reputation]]'],
                ['A marketing campaign', `up to +${percent(MARKETING.maxPromotion)}`, '[[marketing]]'],
                ['The channel’s specialization', `+${percent(SPECIALIZATION.bonus - 1)}`, '[[channels]]'],
                ['A big event', `+${percent(EVENTS.electionNewsAppeal - 1)} or +${percent(EVENTS.sportsAppeal - 1)}`, '[[history]]'],
              ],
            },
          },
        ],
      },
      {
        heading: 'Share',
        body: [
          'The audience is not divided in proportion to appeal but to appeal **squared**. A show twice as appealing as another gets four times the audience. Being a little better than the competition is worth a lot; being a little worse costs a lot.',
          'Switching off counts as a show too, with a fixed, modest appeal. So even without any rival in the slot, a weak show loses most people to something else.',
        ],
      },
      {
        heading: 'The weekly report',
        body: [
          'Every Monday the ratings of the past week come in. The Ratings page of the On air window has your listeners per show and per audience, your share against your rivals’, and how both have moved.',
          'Why a show draws what it draws is on its card in the schedule: its quality, how well it suits who is tuned in, its freshness, the channel’s reputation, the host’s fame, marketing and bonuses, each with an arrow against a week ago, and the strongest rival in its slot. A show that loses much of its audience in a week gets a line in the news with the main reason. See [[market-leader]].',
        ],
      },
    ],
    seeAlso: ['shows', 'reputation', 'freshness', 'rivals', 'schedule'],
  },

  reputation: {
    title: 'Reputation',
    category: 'air',
    summary: 'A channel’s name in a region.',
    sections: [
      {
        body: [
          'A channel has a reputation in every region it broadcasts in, from 0 to 100. It multiplies the appeal of everything on the channel there: at 0 a show has half its appeal, at 50 all of it, at 100 one and a half times ([[ratings]]).',
          'Reputation moves slowly, a little each day, toward what the channel earns there: good shows with a good share raise it, weak ones lower it. A skilled [[managers|channel manager]] makes it move faster.',
        ],
      },
      {
        heading: 'Starting out',
        body: [
          `A channel starts in a new region with no reputation, except in the region of your headquarters, where it starts at ${Math.round(HOME_REGION.startReputation * 100)}. That is why a new region earns little at first and more every month. Your rivals’ channels start higher.`,
          'An [[prestige|event of your own]] lifts a channel’s reputation at once, in every region it is in. The lift fades again unless the shows hold it up.',
          'The figure in the bar at the bottom is the average over all your channels and regions.',
        ],
      },
    ],
    seeAlso: ['ratings', 'channels', 'prestige', 'managers'],
  },

  freshness: {
    title: 'Freshness',
    category: 'air',
    summary: 'Shows wear out; a revamp makes them new.',
    facts: [
      ['A show loses', `${(FRESHNESS_DECAY * 100).toFixed(2)}% a day on air`],
      ['After a year on air', percent(Math.max(FRESHNESS_MIN, 1 - 365 * FRESHNESS_DECAY))],
      ['Lowest', percent(FRESHNESS_MIN)],
      ['A revamp', euro(REVAMP_COST)],
    ],
    sections: [
      {
        body: [
          `A new show is 100% fresh. Every day it airs it loses ${(FRESHNESS_DECAY * 100).toFixed(2)}%: after two months it is at ${percent(1 - 60 * FRESHNESS_DECAY)}, and after a year just under half. The lowest is ${percent(FRESHNESS_MIN)}, which it reaches in ${Math.round((1 - FRESHNESS_MIN) / FRESHNESS_DECAY)} days. Freshness multiplies a show’s appeal ([[ratings]]), so an old show draws up to ${percent(1 - FRESHNESS_MIN)} less than it did.`,
          `A **revamp** makes a show fully fresh again for ${euro(REVAMP_COST)}: press the show on its channel’s schedule. Changing a show’s genre does the same.`,
          `A radio show an **audio engineer** looks after wears more slowly: up to ${percent(ENGINEERS.slower)} less a day, by how good the engineer is ([[writers]]).`,
        ],
      },
      {
        heading: 'Bought titles',
        body: [
          `Titles from the [[content-market]] wear differently: each airing takes ${percent(1 - CONTENT.freshnessPerAiring)} off a title’s freshness, and every day it stays off the air gives ${percent(CONTENT.freshnessRecovery)} back. A library program rotates through its titles, so a bigger library keeps them fresher.`,
        ],
      },
    ],
    seeAlso: ['ratings', 'shows', 'content-market'],
  },

  television: {
    title: 'Television',
    category: 'air',
    summary: 'What changes when you add pictures.',
    sections: [
      {
        body: [
          'Television works like radio, with bigger numbers. A TV license costs eight times a radio license ([[licenses]]), a TV studio a multiple of a radio studio, and most TV shows take more producers. Advertisers pay ' + cents(CPM.tv) + ' for a thousand viewers against ' + cents(CPM.radio) + ' for a thousand listeners, and far more people watch in the evening than ever listen at once.',
          `The hiring pool has ${TV_HOST_CANDIDATES} hosts a month whose best genres are TV genres ([[hosts]]).`,
        ],
      },
      {
        heading: 'The small way in',
        body: [
          'A TV channel does not need a studio. It needs a channel manager of its own, a license, a post room with a sorting case ([[morale|the post]]), a library with shelves ([[content-market]]), and titles to show: a program of bought **series** in the evening, with reruns in the other slots. [[penny-cash]] offers to walk you through this once the company has paid its way for a few months and can pay for it, or whenever you ask her in the Settings, and it is tested to work: after a few months such a channel pays for its series, its license fee and its manager.',
          { tip: 'Films cost about twice as much an evening as series, and a channel this small does not earn them back. Documentaries are cheap: a second program for the afternoon once the first one pays. At lunch so few people watch that nothing bought pays: series there cost about three times what they bring in.' },
        ],
      },
      {
        heading: 'Getting a license',
        body: ['There are few TV licenses, and in most regions none is free for years ([[licenses]]). In [[coaxia]] one is for sale from the first day. Later ones are [[auctions|auctioned]].'],
      },
      {
        heading: 'Produced shows',
        body: [
          'A produced TV show costs money every day it airs, for sets, costumes and crew:',
          { table: { head: ['Genre', 'A day'], rows: Object.entries(EPISODE_COST).map(([id, cost]) => [getGenre(id as Genre['id']).name, euro(cost)]) } },
          'Each needs its studio and what stands in it ([[studios]]). The decor for game shows, soap operas and reality TV has to be [[research|researched]] first. A sitcom and reality TV have no host: their [[writers]] make them.',
        ],
      },
      {
        heading: 'Bought programs',
        body: ['Movies, series and documentaries are bought, not made: see [[content-market]]. They need a library, no host and no studio, which makes them the cheap way to fill a TV day.'],
      },
    ],
    seeAlso: ['licenses', 'studios', 'content-market', 'sports-rights', 'genres'],
  },

  'content-market': {
    title: 'The content market',
    category: 'air',
    summary: 'Buying movies, series and other titles, and the library that holds them.',
    sections: [
      {
        body: [
          lockLine('content'),
          'On the 1st of every month new titles come on the market, on the Content page of the On air window. What you don’t buy goes to other broadcasters. A title has a genre, a quality, and a number of **airings**: how often it can be shown before it is used up.',
          {
            table: {
              head: ['Genre', 'New a month', 'Airings', 'Price per airing, for the best'],
              rows: (Object.keys(CONTENT.titlesPerMonth) as Genre['id'][]).map((id) => [
                getGenre(id).name,
                String(CONTENT.titlesPerMonth[id]),
                `${CONTENT.airings[id]![0]}–${CONTENT.airings[id]![1]}`,
                id === 'teleshopping' ? `pays you ${euro(CONTENT.teleshopping.feePerAiring.min)}–${euro(CONTENT.teleshopping.feePerAiring.max)}` : euro(CONTENT.pricePerAiring[id]!),
              ]),
            },
          },
          'Better titles cost much more than their quality in proportion. Music videos and teleshopping exist only after they are [[research|researched]]. Cartoons (since 0.16.0) are for children, and so for the families who watch with them ([[audiences]]).',
          'Nothing is paid when you buy a title. Each airing is paid on the day it airs: the title’s price, spread over its airings. So a title costs only for the days it is on, and one thrown out of the library costs nothing more. The Finance window counts the airings among the running costs ([[money]]). Prices are those of normal; the [[saving|difficulty]] makes them lower or higher.',
        ],
      },
      {
        heading: 'The library',
        body: [
          `Titles are kept in a **library**: a room with shelving. Each set of shelves holds ${TITLES_PER_SHELF} titles. After the personal computer, a server rack holds ${TITLES_PER_RACK[0]}, and later ${TITLES_PER_RACK[1]}.`,
          'The titles come by post. Until one of your libraries has a server rack, a library can’t be built and no title bought without a **post room** with a sorting case in it ([[morale]]); it needs no clerk for this. A post room that is emptied or closed stops counting, and the library you have goes on airing what it holds. A game from before 0.17.0 that had a library and no post room got 30 days to build one.',
        ],
      },
      {
        heading: 'On the air',
        body: [
          'To show them, make a show of a bought genre (Movies, say) and put it on the schedule. Each day it airs the title of that genre in your library that is best that day: quality and freshness together. With no title left, the slot becomes a rerun. Titles lose [[freshness]] with every airing and recover while they rest.',
          `A title loses ${percent(1 - CONTENT.freshnessPerAiring)} of its freshness each time it airs and gains ${percent(CONTENT.freshnessRecovery)} back each day it rests. A programme that airs every day with only a few titles soon shows them stale: with ${TITLES_FOR_FULL_FRESHNESS} or more taking turns, each comes back fresh. A programme's card on the schedule lists its titles with their freshness and says how many days they last; the news warns a week before they run out, and again when they have.`,
        ],
      },
    ],
    seeAlso: ['television', 'freshness', 'genres', 'research'],
  },

  'sports-rights': {
    title: 'Sports rights',
    category: 'air',
    summary: 'The rights to show sports, and the rights to the big events.',
    sections: [
      {
        heading: 'Broadcast rights',
        body: [
          `A TV sports show can be made without any rights: it then talks about sport, and is ${percent(1 - SPORTS_RIGHTS.talkOnly)} less appealing than it would be otherwise. With sports broadcast rights it shows the games. ${SPORTS_RIGHTS.offersPerMonth} offers come on the [[content-market]] each month, for ${list(SPORTS_RIGHTS.months.map(String))} months. Each has a prestige: better rights make your sports shows more appealing, and cost much more. Radio sports commentary needs no rights.`,
        ],
      },
      {
        heading: 'Event rights',
        body: [
          `During a World Cup or the Olympics ([[history]]), sports shows are ${percent(EVENTS.sportsAppeal - 1)} more appealing: on radio for everyone, on TV only for the broadcaster that holds the rights to the event. Those are auctioned ${EVENTS.auctionLeadDays} days before it starts, with one sealed bid each, like a license ([[auctions]]). The lowest bid was ${euro(EVENTS.reserve.worldCup)} for a World Cup and ${euro(EVENTS.reserve.olympics)} for the Olympics in 1970, and rises every year.`,
          'A rival that wins shows the event live in the evening, and takes the crowd. The holder’s TV sports shows show the event while it is on, with or without other rights.',
        ],
      },
    ],
    seeAlso: ['television', 'auctions', 'history'],
  },

  // --- Money ---

  money: {
    title: 'Money',
    category: 'money',
    summary: 'Where it comes from, where it goes, and when.',
    facts: [
      ['Radio advertising', `${cents(CPM.radio)} per 1,000 listeners`],
      ['TV advertising', `${cents(CPM.tv)} per 1,000 viewers`],
      ['Bills are paid', 'Every day'],
    ],
    sections: [
      {
        heading: 'Coming in',
        body: [
          `Every show earns advertising money every day it airs: ${cents(CPM.radio)} for each thousand radio listeners, ${cents(CPM.tv)} for each thousand TV viewers, times what that [[audiences|audience]] is worth to advertisers. A [[sponsors|sponsor]] on a show raises the rate. In a [[history|recession]] advertisers pay ${percent(1 - EVENTS.recessionAdRate)} less.`,
          'Uncle Tabby sends money when the company reaches a [[milestones|milestone]].',
        ],
      },
      {
        heading: 'Going out',
        body: [
          {
            list: [
              '**Every day:** a day’s share of the month’s salaries, rent and license fees, the episode costs of TV shows, each airing of a bought title ([[content-market]]), and marketing campaigns. What the Money in the bar at the bottom says is what you have.',
              '**Every month, on the 1st:** the installment on a [[loans|loan]].',
              '**At once, when you buy:** furniture, licenses, sports rights, a revamp, a signing fee.',
            ],
          },
        ],
      },
      {
        heading: 'The monthly report',
        body: [
          'On the 1st the report of the past month is filed in the Finance window. It first sets the income against the **running costs**: salaries, rent, license fees, the episode costs of TV shows, the airings of bought titles and the installment on a loan. What is left is the running profit or loss, and that says whether the company pays its own way. Under it stands what was bought and spent besides, and what the month comes to after that. A month with big purchases closes in the red even when the company runs at a profit.',
          '**The month ahead**, in the same window, makes the same sum for the company as it stands today: yesterday’s income every day, against what the staff, the rooms, the licenses, the schedule (its episodes and its bought titles) and the loan cost per month. Marketing campaigns are paid every day while they run, but they are not a running cost: they stand under it, with what the month comes to after them. A company can run at a profit and still lose money while its campaigns cost more than that profit.',
          `A company that ends ${BANKRUPTCY_MONTHS} months in a row with less than nothing in the bank is bankrupt ([[loans]]).`,
        ],
      },
    ],
    seeAlso: ['sponsors', 'loans', 'dividends', 'time'],
  },

  sponsors: {
    title: 'Sponsors',
    category: 'money',
    summary: 'A higher advertising rate on one show, with a condition.',
    sections: [
      {
        body: [
          lockLine('sales'),
          `A sponsor pays more for the advertising on one show than ordinary advertisers do: ${percent(RELATIONS.firstBonus)} more to begin with. In return the show has to keep its audience: if its average daily listeners over the whole contract fall below the agreed minimum, you pay a penalty of ${SALES.penaltyWeeks} weeks of what the contract would have paid at that minimum. A sponsor pays no sum of its own: what it adds is on top of the ads of that show, and the Finance window and the Sales window show how much.`,
          'Offers come from your **sales staff**, every Monday. More and better salespeople bring more offers. Without sales staff there are none, and none come for radio or for TV while every show there has a sponsor already.',
        ],
      },
      {
        heading: 'Getting to know a sponsor',
        body: [
          `Your sales staff look after the sponsors that have a contract with you, and the company gets to know each of them better: a relationship has ${RELATIONS.levels} levels. A sponsor pays ${percent(RELATIONS.firstBonus)} over the normal ad rate at level 1 and ${percent(RELATIONS.bonusPerLevel)} more with every level, up to ${percent(RELATIONS.firstBonus + RELATIONS.bonusPerLevel * (RELATIONS.levels - 1))} at level ${RELATIONS.levels}. A new level counts at once, on the contracts that run as well.`,
          {
            list: [
              'The better your sales staff, the faster it goes. Their work is shared among the sponsors under contract, so a few sponsors are known sooner than many.',
              `While every show has a sponsor there are no offers to chase, and the team works on its sponsors at ${RELATIONS.fullTime} times the pace.`,
              `A sponsor you know comes back: about half of all offers are from one you have worked with, at the rate of its level.`,
              `A contract that ends in a penalty costs ${RELATIONS.lostOnPenalty} level with that sponsor.`,
            ],
          },
        ],
      },
      {
        heading: 'An offer',
        body: [
          {
            list: [
              'It is for radio or for TV.',
              `It runs ${SALES.durationWeeks.min} to ${SALES.durationWeeks.max} weeks.`,
              `It waits ${SALES.offerLifetimeDays} days for an answer; at most ${SALES.maxOpenOffers} are open at a time.`,
              `Half of them prefer one audience, and pay ${percent(SALES.preferredAudienceBonus - 1)} more again for that audience.`,
              'A show can have one sponsor at a time.',
            ],
          },
          { tip: 'The minimum is set against the shows you have today. Give a contract to a show that clears it with room to spare, and not to one that is going stale.' },
        ],
      },
    ],
    seeAlso: ['money', 'staff', 'freshness', 'brands'],
  },

  marketing: {
    title: 'Marketing',
    category: 'money',
    summary: 'Campaigns that make a channel or a show more appealing.',
    sections: [
      {
        body: [
          lockLine('marketing'),
          'A campaign promotes one channel or one show to one audience, or to all of them. While it runs, what it promotes becomes more appealing to that audience ([[ratings]]); afterwards the effect fades over a few weeks.',
          `Each **marketer** runs one campaign at a time, and needs a desk. A campaign costs ${list(MARKETING.budgets.map((b) => euro(b)))} a week, for ${list(MARKETING.durations.map(String))} weeks, paid day by day.`,
          'A running campaign can be made longer in the Marketing window, or set to start again by itself when it ends, for as long as the money is there for its first week. A week before a campaign ends the news says so, unless it starts again.',
        ],
      },
      {
        heading: 'How strong',
        body: [
          `At ${euro(MARKETING.fullBudget)} a week a campaign adds up to ${percent(MARKETING.maxPromotion)} to appeal. Smaller budgets do more per euro: a quarter of the money buys half the effect. A better marketer gets more out of the same budget. A campaign for all audiences reaches each of them at ${percent(MARKETING.allAudiences)} strength.`,
        ],
      },
      { heading: 'Events', body: ['Concerts, galas and telethons are on the same window; see [[prestige]].'] },
    ],
    seeAlso: ['ratings', 'prestige', 'audiences'],
  },

  loans: {
    title: 'Loans and bankruptcy',
    category: 'money',
    summary: 'Borrowing from the bank, and what happens when the money runs out.',
    facts: [
      ['Interest', `${percent(LOAN.monthlyRate)} a month`],
      ['Most', `${percent(LOAN.maxShare)} of the company’s value`],
      ['Bankrupt after', `${BANKRUPTCY_MONTHS} month-ends in the red`],
    ],
    sections: [
      {
        heading: 'Loans',
        body: [
          `The bank lends up to ${percent(LOAN.maxShare)} of what the company is worth ([[dividends]]), from ${euro(LOAN.minAmount)}, over ${list(LOAN.terms.map(String))} months, at ${percent(LOAN.monthlyRate)} interest a month. You pay a fixed amount on the 1st of every month. There is one loan at a time, and it can be paid off early without a fee.`,
          'A company that is worth very little gets no loan at all. Borrow while things go well.',
        ],
      },
      {
        heading: 'In the red',
        body: [
          `The money can go below zero. If it is still below zero when a month ends, the bank counts. At the ${BANKRUPTCY_MONTHS === 3 ? 'third' : `${BANKRUPTCY_MONTHS}th`} month-end in a row, the company is bankrupt and the game is over. One month-end above zero and the count starts again.`,
          `**Once, your uncle steps in.** The first time the bank would close the company down, [[tabby-loid|Tabby Loid]] pays in ${euro(BAILOUT.amount)} and the bank starts counting again. It is a gift, not income, and he does not do it twice.`,
          { list: ['Fill every slot on the [[schedule]].', 'Let go of people who are on no show and rooms nobody uses.', 'Sell furniture you don’t need: it still brings a good part of its price.', 'Take a loan, if the bank still lends.'] },
        ],
      },
    ],
    seeAlso: ['money', 'dividends', 'ways-to-lose-money'],
  },

  dividends: {
    title: 'Dividends and company value',
    category: 'money',
    summary: 'The owners’ share, which is the score, and what the company is worth.',
    facts: [
      ['Paid on', '1 January'],
      ['Share', `${percent(DIVIDEND.payout)} of the cash above the reserve`],
      ['Reserve', `${DIVIDEND.reserveMonths} months of running costs`],
    ],
    sections: [
      {
        heading: 'Dividends',
        body: [
          `Every 1 January the owners, which is to say [[tabby-loid|your uncle]], take ${percent(DIVIDEND.payout)} of the cash the company holds above a reserve of ${DIVIDEND.reserveMonths} months of running costs: salaries, rent and license fees. A company with less than that reserve pays nothing.`,
          'Everything paid out over the years is the company’s **score**. It is also money that is gone: what you put back into the company before the year ends stays in it.',
        ],
      },
      {
        heading: 'Company value',
        body: [
          `The company is worth its money, its furniture at what it would sell for, its licenses at what was paid for them, and ${LOAN.revenueMonths} months of its average revenue, less what it owes the bank. The value decides how much the bank lends ([[loans]]) and when the next floor of the [[office]] opens.`,
        ],
      },
    ],
    seeAlso: ['money', 'prestige', 'milestones', 'loans'],
  },

  prestige: {
    title: 'Events and prestige',
    category: 'money',
    summary: 'Concerts, galas and telethons, and what the prestige they earn is good for.',
    sections: [
      {
        body: [
          lockLine('events'),
          'A channel can stage an event of its own, from the Marketing window. An event lifts the channel’s [[reputation]] in every region it broadcasts in and makes its best-known [[hosts|host]] more famous. Both fade again over the following months. What stays is **prestige**, the company’s second score.',
          {
            table: {
              head: ['Event', 'Cost per region', 'Reputation', 'Host fame', 'Prestige per region'],
              rows: Object.values(OWN_EVENTS).map((e) => [e.name, euro(e.costPerRegion), `+${Math.round(e.reputation * 100)}`, `+${e.fame}`, String(e.prestigePerRegion)]),
            },
          },
          `A channel can stage one event every ${OWN_EVENT_LIMITS.cooldownDays} days. The cost and the prestige count once for each region the channel is in.`,
        ],
      },
      {
        heading: 'What prestige does',
        body: [
          'Hosts would rather work for a company people talk about. With prestige:',
          {
            list: [
              `[[rivals]] court your hosts less often ([[poaching]]): up to ${percent(PRESTIGE.poachCut)} less;`,
              `hosts in the hiring pool ask less: up to ${percent(PRESTIGE.hostDiscount)} below the going rate ([[staff]]). What they ask is set when the pool is drawn, so it shows in the next pool.`,
            ],
          },
          `Both grow with prestige and are at their full size from ${PRESTIGE.full} prestige; at half of that, they are half as large. Prestige never fades, and it is the company’s second score beside the [[dividends]].`,
        ],
      },
    ],
    seeAlso: ['reputation', 'hosts', 'dividends', 'marketing', 'poaching'],
  },

  milestones: {
    title: 'Milestones',
    category: 'money',
    summary: 'The marks along the way.',
    sections: [
      {
        body: [
          'The game has no finish line, so milestones mark how far the company has come. Each is reached once, with a jingle; the Milestones window lists them with the day.',
          `For most of them Uncle Tabby sends money: the amounts below on normal, ${percent(MILESTONES.rewardScale.easy)} of them on easy and ${percent(MILESTONES.rewardScale.hard)} on hard ([[saving|difficulty]]). It is in the Finance window as a gift, apart from what the company earns. The dividend milestones bring nothing: the dividends go to him.`,
          { table: { head: ['Milestone', 'For', 'Uncle Tabby sends'], rows: MILESTONE_LIST.map((m) => [m.name, m.description, m.reward > 0 ? euro(m.reward) : '–']) } },
        ],
      },
      {
        heading: 'What a milestone opens',
        body: [
          'A new company starts with what it takes to make radio: the office, hosts, production staff and the people who keep the building going, one channel’s worth of shows and schedule, one license, and the books. The rest opens one thing at a time, each with a milestone. Until then its window in the menu is dimmed, with a lock; pressing it says what opens it.',
          { table: { head: ['Opens', 'What it is', 'With the milestone'], rows: FEATURES.map((feature) => [`**${UNLOCKS[feature].name}**`, UNLOCKS[feature].opens, opensWith(feature)]) } },
          'A second channel, television itself, signing a rival’s host and borrowing are open from the first day.',
        ],
      },
    ],
    seeAlso: ['dividends', 'prestige', 'broadcast-empire'],
  },

  // --- A changing world ---

  research: {
    title: 'Research',
    category: 'world',
    summary: 'Technology: what it brings and when.',
    facts: [
      ['Early by at most', `${RESEARCH.maxYearsEarly} years`],
      ['Each year early', `+${percent(RESEARCH.earlyCostPerYear)} cost`],
    ],
    sections: [
      {
        body: [
          lockLine('research'),
          'The game runs from 1970 to 2030 and beyond, and technology changes with it. Each technology has a year. In that year your [[rivals]] get it for nothing. You have to **research** it, with research points.',
          'Research points come from R&D staff: each day, every researcher with a desk earns their skill divided by 100. A department [[managers|manager]] and good [[morale]] raise that.',
          `A technology can be researched up to ${RESEARCH.maxYearsEarly} years before its year, for ${percent(RESEARCH.earlyCostPerYear)} more per year early. From its year on it costs the listed amount.`,
        ],
      },
      {
        heading: 'Why bother',
        body: [
          'Studio equipment is judged against what rivals use that year ([[studios]]). When they move to a newer version and you don’t, your shows get worse without anything in your building changing. Researching and upgrading keeps you level; being early puts you ahead.',
          'Other technologies open genres, make bought titles better or cheaper, or get more work out of every desk.',
        ],
      },
      {
        heading: 'The technologies',
        body: [{ table: { head: ['Year', 'Technology', 'Points', 'What it brings'], rows: TECHS.map((t) => [String(t.year), t.name, count(t.cost), t.description]) } }],
      },
    ],
    seeAlso: ['studios', 'furniture', 'rivals', 'staff'],
  },

  rivals: {
    title: 'Rivals',
    category: 'world',
    summary: 'The other broadcasters of Etheria.',
    sections: [
      {
        body: [
          'Four other broadcasters are on the air. They have channels, schedules and shows with famous hosts, and they compete with you for the same listeners in every slot ([[ratings]]). They have no office you can see.',
          {
            table: {
              head: ['Kind', 'Airs', 'Starts in'],
              rows: Object.values(PERSONALITIES).map((p) => [
                p.company ? `${p.label} (${p.company})` : p.label,
                list([...new Set(p.channels.flatMap((c) => c.schedule))].slice(0, 4).map((g) => lower(getGenre(g).name))),
                p.regions.length === REGIONS.length ? 'Every region' : list(p.regions.map((id) => REGIONS.find((r) => r.id === id)!.name)),
              ]),
            },
          },
          'One of them is always [[epb]], the public broadcaster. The others get their names anew every game.',
        ],
      },
      {
        heading: 'How good they are',
        body: [
          `Rival shows get better with the years, by about ${(RIVAL_ERA.perYear * 100).toFixed(1)}% a year, as they adopt each new technology in its year ([[research]]). The difficulty of the game scales all of it ([[saving]]).`,
          'Now and then a rival replaces a weak show with a new one.',
        ],
      },
      {
        heading: 'What they do',
        body: [
          {
            list: [
              `From ${RIVAL_EXPANSION_FROM_YEAR} on they buy licenses in new regions, but only where enough are left that you are not locked out.`,
              'They start TV channels over the years, and bid in [[auctions]] for licenses and event rights.',
              'They make offers to your famous hosts ([[poaching]]).',
              'They bid for your licenses when those come up for renewal.',
            ],
          },
        ],
      },
    ],
    seeAlso: ['epb', 'ratings', 'poaching', 'auctions'],
  },

  poaching: {
    title: 'Poaching hosts',
    category: 'world',
    summary: 'Rivals want your famous hosts, and you can take theirs.',
    sections: [
      {
        heading: 'They come for yours',
        body: [
          `Once a host’s fame is ${POACH.minFame} or more, a rival may make them an offer: a salary well above what they earn. You have ${POACH.answerDays} days to match it, in the Staff window. Matching means paying that salary from then on. If you don’t, or let them go, the host signs with the rival and works out ${POACH.noticeDays} days of notice: they present their shows as before, which gives you that long to hire someone in their place; a recruiter finds you one ([[staff]]). Then they leave, their shows are without a host, and the rival’s show gets better.`,
          `Rivals try less often with a company that has [[prestige]]: up to ${percent(PRESTIGE.poachCut)} less, from ${PRESTIGE.full} prestige.`,
        ],
      },
      {
        heading: 'You go for theirs',
        body: [
          `The Staff window lists the most famous hosts on rival channels. Signing one costs ${POACH.signingMonths} months of their salary at once, and the salary itself is ${percent(POACH.salaryPremium - 1)} above the going rate. The show they leave gets worse. You can sign one host every ${POACH.cooldownDays} days.`,
          { tip: 'A famous host is worth it on a show with a big audience, where fame multiplies a lot of listeners. On a late-night show it is money burned.' },
        ],
      },
    ],
    seeAlso: ['hosts', 'rivals', 'staff'],
  },

  history: {
    title: 'World events',
    category: 'world',
    summary: 'World Cups, Olympics, elections and recessions.',
    sections: [
      {
        body: ['Some things happen to the whole country, in fixed years. The news ticker announces them, and the jingle for news plays when one begins.'],
      },
      {
        heading: 'Sport',
        body: [
          `The **World Cup** is held every ${SPORTS_EVENTS.worldCup.every} years from ${SPORTS_EVENTS.worldCup.firstYear}, for ${SPORTS_EVENTS.worldCup.days} days in June and July. The **Olympics** are every ${SPORTS_EVENTS.olympics.every} years from ${SPORTS_EVENTS.olympics.firstYear}, for ${SPORTS_EVENTS.olympics.days} days from late July. While one is on, sports shows are ${percent(EVENTS.sportsAppeal - 1)} more appealing: on radio for everyone, on TV for whoever holds the rights ([[sports-rights]]).`,
        ],
      },
      {
        heading: 'Elections',
        body: [
          `There is a general election every ${ELECTIONS.every} years from ${ELECTIONS.firstYear} (${years(ELECTIONS.firstYear, ELECTIONS.every).slice(0, 4).join(', ')} and so on). The campaign fills the month of May, and during it news shows are ${percent(EVENTS.electionNewsAppeal - 1)} more appealing.`,
        ],
      },
      {
        heading: 'Recessions',
        body: [
          `In a recession advertisers pay ${percent(1 - EVENTS.recessionAdRate)} less for the whole year. Your costs stay the same. Nobody can say years ahead when the next one comes, but the economists see it a month before: the news ticker says so on the first of December.`,
          {
            asOf: (day) => {
              const year = day === null ? null : toCalendarDate(day).year;
              const past = RECESSIONS.filter((r) => year !== null && r.year <= year);
              return past.length > 0
                ? [{ table: { head: ['Year', 'Known as'], rows: past.map((r) => [String(r.year), r.name]) } }]
                : [`There has been no recession since ${toCalendarDate(0).year}.`];
            },
          },
          { tip: 'Keep some cash aside: a recession year is a bad one to be short of it in.' },
        ],
      },
    ],
    seeAlso: ['sports-rights', 'ratings', 'money', 'time'],
  },
} satisfies Partial<Record<ArticleId, ArticleText>>;
