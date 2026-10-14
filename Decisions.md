# Decisions

What whoever works on Broadcast Empire needs to remember: how the game is put together where that differs from, or goes beyond, the design brief ([prompt.md](prompt.md)), and the facts that were expensive to find out. Numbers live in [src/config/balance.ts](src/config/balance.ts) and are not repeated here.

This is the short version, made for the first alpha (0.8.0) and kept up since. Until then every phase had its own numbered list (0.1 to 13g.6), which the roadmap in prompt.md still refers to. That full log is in the history: `git show phase-13g:Decisions.md`. What was open in it is now a request in [REQUESTS.md](REQUESTS.md).

## Settled by the designer (13 October 2026)

- **The application id is `media.mvdm.broadcastempire`,** for good.
- **The cheat console stays in the game,** in every build (Ctrl+Alt+C).
- **The CEO's office is for looks only,** and so is sitting next door to one's manager. Neither should change a number.
- **The dividend stays** as it is.
- **Research opens two ways:** with a second region, or with the biggest radio channel in one region.
- **Managers work in a management office,** a room apart from the staff, with a desk each.
- **The models built after the reference photos stay** as they are, cameras and lights at 45 degrees included.
- **The bail-out is €50,000, once** (see "Money and the market").
- **Penny's hint `places` stays:** once there is a second office she points out that people can be given a place of their own.
- **A TV sports show needs no rights.** Without them it talks about sport and draws less; rights for a season, or for an event while it is on, make it show the games.
- **A studio of its own kind for the talk show, the game show and the soap opera,** each built around its set, which stands nowhere else.
- **Television starts small:** Penny teaches a TV channel that only shows bought series, and a TV license is a fifth cheaper than it was.
- **Five shows first, then the schedule,** in Penny's first weeks.

On 14 October 2026:

- **The sounds and jingles stay** as they were picked (`SOUNDS` in `src/audio/sounds.ts`).
- **These stay as built and are off the list of choices:** only Coaxia carries a full team on one license; the look in `design/style.md` (Assistant Regular for small text, the dark theme, the drawn icons, Finance as month columns, Research as a tree, the status bar with icons); the lore added to the wiki ("The law of 1970", "For a broadcaster" per region, the brands article).
- **A browser save is not brought into the desktop app.** The request is dropped.
- **Prestige makes hosts want to work for you:** rivals poach less, and hosts in the hiring pool ask less.
- **A milestone pauses the game** with a pop-up until it is closed.
- **The wiki lists no recession before it has happened.** World Cups, Olympics and regular elections stay listed ahead, and the news warns of a recession on the first of December before it.
- **Shows are looked after on the schedule of their channel,** with the shows that are in no slot beside it; the On air window has Channels, Content and Ratings.

## The simulation

- **`tick(state)` takes only the state.** The position of the random numbers is in the state, so the same save always plays the same.
- **Every player command is a pure action** in `src/sim/actions.ts` that returns a new state or an error with its reason. The interface, the test players and the cheat codes all go through them.
- **Balance and data are in `src/config/`,** never in the simulation or the interface.
- **Running costs build up daily and are paid on the 1st.** A month's result counts everything spent; the "running result" leaves out what was bought.
- **Much of what you see is for looking at only.** The clock beside the date, people's hours, journeys and meals, the traffic, the train, visitors and the audience: the simulation does not know about any of it. It still broadcasts the whole schedule every calendar day, and nobody works less for being at lunch. The town and who looks like whom follow from the game's seed and from names; nothing of it is saved. Traffic has a state of its own that is not saved.
- **The region ids are the old names** (`capital`, `north`, `coast`, `heartland`, `highlands`) for Coaxia, Transponder Valley, Skywave Beach, Aerial Fields and Amplify Hills. Renaming them would break every save.

## Saves

- **A save is the whole state with a version number** (27 at version 0.10.0) and a step for every version before it, in `src/sim/save.ts`. Every change to the state needs a new step, and older saves must keep loading. Tests keep saves of older versions.
- **A step, once written, is frozen.** It may not call code that changes later; where it has to, it has its own copy (`firstFit`, `onOldPlan`).
- **A new field that holds a game day must be added to `DAY_FIELDS` in `src/sim/cheats.ts`,** or the `year` code leaves it behind.
- **Settings belong to the browser or the app, not to a save:** autosave, theme, reduce motion, volumes. The difficulty is fixed when a game starts and is in the save.
- **Saves have names; the autosave is one slot apart** and is written on the 1st of every month, and in the desktop app on quitting. The game opens on the home screen and loads nothing by itself. A save that cannot be read is listed with its problem and can only be deleted.
- **Browser saves and desktop saves are apart** (IndexedDB against JSON files), in the same format.
- **Older games keep what they had** whenever a rule changed: everything unlocked, hosts on two shows, lettered rooms as names, the standard building, pieces already standing in front of a door.

## Money and the market

- **Radio and TV are separate markets,** each with its own leader. "Market leader" is more listeners across all regions than every rival company; "#1 in a region" is the biggest single channel there yesterday.
- **Licenses** are limited per region and grow with its people. TV licenses come on a fixed schedule. A license issued after the start is auctioned by sealed bid. Every license runs eight years and then has a renewal round, in which the holder has an advantage, the reserve is paid automatically, and a rival's license can be taken over. Giving one up bars that medium in that region for five years.
- **Rivals** have personalities and home regions, do not expand in 1970, improve a little every year, always use the equipment of their year, launch TV over time, and try to poach famous hosts at the going rate. The difficulty scales the quality of their shows (and, since 0.12.0, the player's costs: see below).
- **Dividends** are the money sink and a score: each 1 January the owners take a share of the cash above a year of running costs. **Prestige**, from events the company stages, is a second score.
- **The difficulty sets the money too (0.12.0):** the starting money, and one multiplier (`DIFFICULTY_COSTS`, applied through `costFactor` in `src/sim/difficulty.ts`) on rent, salaries, license prices and fees, and the prices of titles and sports rights. Building, furniture, episodes, events and marketing cost the same on every difficulty. Hard costs only 5% more: at 10% Penny's start no longer reached a month in the black outside the Capital.
- **Bills are paid every day (0.12.0),** a day's share of the month's salaries, rent and license fees, so the money in the status bar is what the company has; the 1st only brings the loan installment and the report. A save from before paid what had built up when it was opened.
- **A title is paid by the airing (0.12.0):** taking it from the market costs nothing, and each airing costs its price spread over its airings (`Title.perAiring`), as a running cost (`Ledger.titles`). Sports rights are still paid at once. A company in the red cannot take new titles.
- **Uncle Tabby sends money for milestones (0.12.0),** a sum per milestone in `config/milestones.ts`, scaled by the difficulty (`MILESTONES.rewardScale`). It is a gift in the books (`Ledger.gifts`): in the month's result, not in the running result. The dividend milestones bring nothing.
- **A sponsor's money is part of the ad revenue (0.13.0),** kept apart only for the reader: a day's result and the books have the sponsor's part (`sponsorRevenue`) and teleshopping fees (`fees`) as parts of `revenue`, not on top of it.
- **Campaigns are not a running cost,** though they are paid daily: they are chosen and can be stopped. Finance shows them under the running result with the total after them (0.12.1/0.13.0), and a campaign can repeat by itself.
- **Uncle Tabby bails the company out once.** At the month-end that would make it bankrupt he pays in a fixed sum, the bank starts counting again, and the next time is final. The sum is a gift: it is in no report and counts for no milestone. Penny has a line for it that can break into the first weeks, like the one about being in the red.
- **The calendar of the world is fixed,** like the tech tree: World Cups, Olympics, elections and recessions fall in set years. Nothing about them is random.
- **Sponsor offers** come weekly from sales staff, are for radio or for TV, and stand on the best show that is still free. None come for radio or for TV while every show there has a sponsor.
- **Sports rights raise a TV sports show; they do not permit it.** Without any it draws 60% (`SPORTS_RIGHTS.talkOnly`); with rights for a season it draws by their prestige (80% to 125%), and during an event the company holds, in full. **Campaigns** need a free marketer.
- **A host presents one show a day;** production staff work on two at most. Everyone levels up, and a level brings a raise. The best producers on a show count, as many as its genre needs; each one beyond adds a little, so an extra one never hurts.
- **A course makes someone better at once, for money and a month of a weaker stand-in.** `Employee.trainingUntil` is the day they are back; while it is set, `skillAtWork` gives the stand-in's skill everywhere a skill is used. The head of the department has to be there, and one person per kind of job goes at a time.
- **A sponsor's rate goes by how well the company knows it** (`GameState.relations`, `RELATIONS`): 20% over the ad rate at level 1, 70% at level 6. The sales staff earn the points while a contract with that sponsor runs. Sales skill no longer sets the rate of an offer.
- **A staged show has its own kind of studio:** the talk show studio, the game show studio and the soap opera studio are each built around their set, which is on the room's checklist and can be placed in no other room. The news studio is for the news and for sports; the production studio, for sitcoms, kids' shows and reality TV, needs no set. A studio whose set has yet to be researched cannot be built until it is (`kindError` in `src/sim/rooms.ts`). Bought titles are scheduled as a "library program" that picks the title per day.
- **Research is bought at once with research points.** Formats invented later are unlocked by research; rivals get them in their historical year. Equipment has tiers, and a studio is judged against the tier of its year.

## The office

- **Rooms are drawn.** A room is a rectangle of whole tiles (at least 3 by 3) with one door, and carries its own name, floor, place and door in the save. Open floor is corridor and costs nothing. A room costs a sum once per tile and rent per tile a month. Every room must stay within reach of the stairs and the lifts; the game refuses a room or a door that would cut one off. "Propose a place" puts a room of the usual size in the next free place along the hall.
- **Two buildings:** three floors in the towns, two longer floors in Amplify Hills and Aerial Fields. Stairs and lifts are at the front on every floor; the technicians' and cleaners' rooms are on the ground floor only. The reception comes with the building and is only written into a game once something is placed in it. Floors open with the company's value.
- **Furniture** is placed by hand, one piece at a time, with the pointer or with the arrow keys and Enter. A piece can be turned, moved for nothing and sold. It gives its whole price back for a week, then loses worth with the years and with wear. **The floor in front of a door stays clear,** from both sides: no piece there, and no door where a piece stands.
- **The first free spot is looked for from the wall across from the door.** The test players and the keyboard go by it. Filled from the door instead, an office loses workplaces and the balance tests fail.
- **A workstation is one piece** (desk, chair, machine), and wears and breaks as one. Managers only work at a manager's desk in a management office; a channel whose manager has no desk is off the air. The CEO has a kind of room and a desk of their own, one per company, which change no number.
- **Who sits where:** someone can own a desk; owners are seated first and everyone else as before (newest desks first, production first, then by hiring date). While nobody owns a place a game plays exactly as it did.
- **A control room** next door (a wall in common) lends its desk to a studio that has none, one desk per studio.
- **Upkeep:** rooms get dirty with use, equipment wears, the building has faults; cleaners, technicians and maintenance staff work down the worst first, without being assigned. Morale drifts toward a target set by dirt, faults, the canteen, comfort pieces and toilets, and cannot pass 100. Dirt and morale scale each person's own work.
- **People find their own way** over a grid per floor: through the middle of a doorway, never through a wall, around furniture where there is room and through it only when there is none. People do walk through each other.
- **The traffic keeps vehicles apart by its rules, not by luck** (`src/office/traffic.ts`), and a test drives every town, also at four times the frame length, looking for two that touch. Each lane is a queue; a vehicle never comes closer to the one in front than a gap. A crossing is taken only on green and with room to stand clear beyond it, and its lights go to the other street only once it is empty. A right turn crosses no other lane, so it needs no more than its own street's green and room in the street it turns into. Since 0.11.0:
  - **A turning vehicle stays in its old lane's queue until its tail is round the corner, and whoever follows it waits at the start of the bend:** on the way round its tail swings across the lane, which a follower that only saw the middle drove into.
  - **Oncoming traffic stops short of where an overtaker ends,** and the overtaker only sets out when everyone coming can still stop. Asking for an empty lane instead (long enough for the fastest vehicle) meant nobody ever overtook in these short blocks. The overtaker stops far enough behind the standing bus or taxi to be over in the other lane, tail and all, before it is level with it.
  - **A bus or a taxi that is due, and whoever is in its way, get green sooner and keep it while they are about to go,** and reckon with every set of lights on their way. Without that a bus in Transponder Valley, where half the traffic is trucks, was late about one time in a hundred. Nothing comes into town by the bus's road just before the bus, and nobody turns in ahead of it.
  - **In a town by the water the side streets end at the street along the shore:** whoever comes down one turns there, nobody turns into one there, and nobody comes up one from the water.

## The player's way in

- **A new company starts with what it takes to make radio.** Six things open later, each with a milestone (`src/config/unlocks.ts`): more regions, sales, marketing, research, the content market, events. A locked window stays in the menu, dimmed, and says what opens it. Older tests of a feature start from `unlockAll(...)`; the tests that play decades start locked.
- **Penny teaches one opening, tested to work:** a radio studio, an office, a management office, a channel manager, five hosts, three producers, a cleaner, a license in Coaxia and five shows; then sales, a first sponsor, marketing and a first campaign. It ends a month in the black by March on every difficulty and from every headquarters. The first hiring pool of a new game has a host for each of those five shows (`OPENING_SHOWS`). Smaller openings all lose money, and so does a single license outside Coaxia, which is why she sends everyone to Coaxia first.
- **"In the black" means the running result,** for Penny and for the milestone "First profitable month" as on the monthly report: income less salaries, rent, license fees and the like, without what was bought once. A January that pays its way finishes her step on 1 February and opens Sales that day.
- **Penny has a second chapter, television** (`TV_STEPS`): it starts when the player says yes to her hint `television`, runs as steps with a ring like the first weeks, and is kept apart from them. "Not now" is remembered as `television-later` in what she has said. What it teaches is one program of bought series: measured, that pays its way after a few months and a program of films does not.
- **A line that waits for its recording is not played** (`TO_RECORD` in `src/config/voiceOver.ts`), so an old recording never says other words than are on screen. A test holds the list against the folder.
- **A step is done when the game says so,** not when a button in the tutorial is pressed. Hints come after the first weeks, at most one a week unless something has a deadline. Penny never points at a lock.
- **Every line of the tutorial is in `src/config/guide.ts`.** What is spoken names no player, no company and no figure, so a recording stays right. `design/voice-over.md` is written from it by `npm run voice-over`, and a test fails when it is out of date. **All 55 lines are recorded (0.10.0) and must not change without asking;** `first-month` and `black` got new words in 0.10.0, at the designer's word, and were recorded again with `bailout`. The recordings are the designer's, in `public/voice/`, one mp3 per line named after it. A line is said once, when it comes up in a game (`src/audio/voice.ts`); one without a recording is shown and not heard. The voice has its own volume.
- **The wiki's figures are the game's own,** filled in from `config/` and `sim/`. A part that depends on the game that is open (the recessions so far) is a block written from that game's day (`asOf`); before a game is open, and for searching, it reads as at the start. A test reads Penny's lines and the whole wiki for words that are gone (lettered rooms, renting a room, removed buttons).

## Interface

- **The office is always on screen;** everything else is a window over it that can be moved, and several can be open. The status bar is part of the page.
- **Every color is a token** at the top of `src/ui/styles.css`; channel logos and sponsor logos are the only colors outside them. The game writes the theme on the page itself (`data-theme`); the stylesheet does not ask the system. The 3D view reads the same tokens.
- **The 3D libraries load only when the office opens.** Reduce motion stops walking, traffic and the ticker.
- **The view turns in quarter turns** and is moved with the keys or by dragging it: the mouse or one finger moves it, two fingers move and zoom. A press that travels less than a few pixels stays a click, and the click that ends a drag is swallowed. While a room is being drawn the left button and one finger draw, so the view goes with the right or middle button or two fingers.
- **News the player will want to act on names its window** (`about` on a message): it gets a pop-up with a button to that window and a dot on its icon. Sponsor offers, an ended campaign, something opening, a rival's offer to a host, a license running out and its renewal round, and a technology coming within reach do this. Dots are not saved; `waitingFor` gives a loaded game the ones for what is still waiting.
- **Every control gets its sound from one listener on the page,** by what kind of control it is; `data-sound` overrides it. A failed action sounds different. One jingle at a time, for the message that is shown. A test fails when a clip is listed but missing, or present but unused.
- **What the schedule tells the player is worked out apart from the simulation (0.13.0),** in `src/sim/insight.ts`: who is tuned in to a slot and how well a genre suits them (fit counted by people and what advertisers pay for them), specialization, how long bought titles last and the freshness they settle at, and why a slot's audience moved. `slotFactors` in broadcast.ts takes a slot's appeal apart with the same parts the share formula multiplies; each Monday they are kept as `weekAgo` for the arrows and the news of the next week.
- **The game asks for a newer version only in the desktop app (0.13.0),** through its main process (the page itself may load nothing from outside), once a session, and only when the setting is on. It reads the latest GitHub release and that version's CHANGELOG.md.
- **On air is organised by channel (0.11.0).** Its menu has Channels, Content and Ratings; a channel's schedule is a page of Channels (`src/ui/onAir.ts` holds which), with the shows of its medium and the buttons that make them. A show is looked at, changed, revamped and cancelled there.
- **A milestone pauses the game** with a pop-up of its own, which also names what it opened; those openings get no small pop-up besides. The store notices both by comparing the game before and after a day or an action (`announce` in `src/ui/store.ts`).
- **Rooms have no buttons above the office (0.11.0).** A room's name label in the office can be clicked, and carries the `data-guide` that Penny's ring looks for; the Office window lists the rooms for the keyboard.
- **Penny's ring finds its control by `data-guide`.** What she points at has to stay in sight, which is why some buttons sit in a sticky footer; a control that is scrolled out of sight in its window is brought into view, a few times and no more. Her "Show me" can also clear the view (`floor`) for a step that starts in the office.
- **The story figures gesture by code, not by clip:** their files have no talking movement, so `StoryFigure.tsx` turns the arm and head bones on top of the idle clip while their own line is heard, and hangs a mouth on the head that follows the loudness of the voice (`voiceLevel`).
- **Models** are Kenney's kits (furniture, characters, three city kits, the train) and Quaternius's two figures, all CC0, in `public/models`. Broadcast equipment and vehicles are built from simple shapes in the registry, `src/office/assets.ts`, where every piece is listed part by part. Characters are recolored by pointing a part at another swatch of the kit's one texture.

## The desktop app

- **Electron,** not Tauri: the same engine on every system for the 3D office, and nothing to install beyond Node. Only `electron/` and the `build` block in `package.json` depend on that choice; the game talks to the desktop through `src/persistence/desktop.ts`.
- **The page runs in a sandbox** and can ask the app for save files and closing, nothing else. Only what ships with the app is loaded. One copy runs at a time.
- **Nothing is signed.** The installers are built on a Mac: one for every Mac (Apple silicon and Intel in one), 64-bit Windows and 64-bit Linux.
- **The version** is in `package.json` and reaches the game through `src/version.ts`.

## Tests and test players

- **The test players in `src/sim/bots.ts` play with the actions a player has:** they build where the game proposes a place and furnish piece by piece. Short cuts for tests only (lettered rooms of the old plan, furnishing in one go) are in `src/sim/fixtures.ts`, which the game does not use.
- **The balance is guarded by tests that play years:** a first profit from every region and difficulty, ten-year survival, a 1970–2030 run, license renewals, the edge that research gives (an average over three games, because luck in the hiring pool moves it by a few percent).
- **What those tests have shown:** a company that never hires support staff is bankrupt within two years; one that stays in one region and never researches does not last ten; one well-run channel in Coaxia earns a little on normal and fails on hard. Since 0.12.0 `npm run simulate` has the bots, and the TV path Penny teaches was measured by a player who follows her to the letter: on normal it breaks even in its first months and then earns a few thousand a month; series at lunch lose about two thirds of what they cost.
- **The advice in the wiki is tested where it can be (0.13.0):** a test player that aims its second station at other audiences (`networkBot`) has to draw more listeners than one whose second station plays the same music (`growthBot`).
- **The whole suite has to run alone** and takes about two and a half minutes. Tests that play years carry their own time limit. If the Mac sleeps during a run, tests time out for no fault of the code.
