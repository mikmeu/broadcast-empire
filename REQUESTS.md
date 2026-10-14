# Requests

What is still wanted for Broadcast Empire: features, fixes and choices that are waiting for an answer. This file takes over from the roadmap in [prompt.md](prompt.md), which ends with Phase 14. What has been released is in [CHANGELOG.md](CHANGELOG.md); how the game is built and why is in [Decisions.md](Decisions.md).

## How this file works

- **Every request has a number that never changes** (R1, R2, …) and a priority: high, medium or low. The priorities below are a first proposal; move a line to another table to change one.
- **A request that is settled leaves the list.** What was built goes to the changelog; what was decided goes to Decisions.md.
- **A version is a bundle of requests.** The bundle for the next version is listed under "Next version". When it is released, its requests move from here to the changelog.
- **Version numbers** are `0.minor.patch` until the game is finished: the minor number goes up with a bundle of requests, the patch number with fixes only. 1.0.0 is the finished game.
- **Kinds of request:** *feature* (something new), *fix* (something wrong), *choice* (something built one way that is yours to confirm or change; until you do, it stays as it is), *release* (packaging and shipping).
- **Playtest notes go in the inbox** as you write them, in your own words. They get a number and a priority when they are sorted.

## Inbox: playtest notes

Write notes here. It helps to say which build (it is on the home screen and at the bottom of Settings, for example "Alpha 0.10.0"), which system, and what you were doing.

- 

## Next version: 0.11.0 (proposal)

From the notes on 0.10.0, the ones about finding your way in the interface, and what a public build needs:

- R78 The question mark that disappears under the pointer.
- R82 The On air window, reworked around the channels.
- R81 No more room buttons above the office.
- R80 The furniture catalog in the menu on the left.
- R79 A pop-up with confetti for a milestone.
- R83 Credits and links.
- R73 What prestige does, and R72 no recessions known in advance.
- R77 The canteen.

The lore for the wiki (R69, R70, R71, R75, R76) could be a version of its own after that; the streaming service (R74) and the new studios (R68) are the large ones.

## High

| # | Kind | Request | Notes |
|---|---|---|---|
| R78 | fix | **A question mark disappears when the pointer is on it.** | From the playtest of 0.10.0. Found: on hover the question mark turns light, as meant, on a purple ground; but the rule for every button under the pointer wins for the ground and makes it light too. Light on light. It goes for every "?" beside a title. One line in `src/ui/styles.css`. |
| R2 | choice | **How to release for free.** The game is to cost nothing, and nothing is to be paid to release it. | Signing the Mac app means Apple's paid developer programme, so that is out; the installers stay unsigned and each system asks once before it runs them (see "Installing the alpha" in the README). Free ways to spare players that question: put the browser version online, which needs no installer at all, and for Windows look at free signing for open-source projects or the Microsoft Store. To decide before the game goes to other people. |
| R5 | fix | **Listen to the sounds and jingles and say which are wrong.** | All 43 clips and 6 jingles were picked by measuring them, not by ear. Which clip plays for what is one table, `SOUNDS` in `src/audio/sounds.ts`. |

## Medium

| # | Kind | Request | Notes |
|---|---|---|---|
| R82 | feature | **The On air window, reworked around the channels.** Its menu has only Channels, Content and Ratings. A filter for radio and TV channels. The channel manager is chosen with buttons with portrait and name, not from a drop-down list. Every channel has a Schedule button that opens its own schedule. On a schedule there are buttons to add a show: "radio show" or "radio talk show" for radio, "produced TV show" or "from the library" for TV. | From the playtest of 0.10.0. "Start a radio channel" and "Start a TV channel" at the top is done since 0.10.0. Shows and Schedule leave the menu, so to settle: where a show is looked at, changed, revamped and cancelled once the Shows page is gone (proposed: on the schedule of its channel, with the shows that are in no slot beside it). Penny's ring and the instructions of five of her steps point at the Shows and Schedule pages and change with it; what she says aloud can stay. |
| R81 | feature | **No buttons for the rooms above the office.** The player clicks a room to see it. | From the playtest of 0.10.0. Today there is a button per room of the floor. They do two more things: they are how a room is picked with the keyboard, and they are what Penny's ring is around when she says "select the studio". To settle: Penny then points into the office itself, and whether the keyboard gets another way to a room. The floor buttons, "Build a room" and the catalog are not rooms: say if they stay. |
| R80 | feature | **The furniture catalog gets its own icon in the menu on the left.** | From the playtest of 0.10.0. Today it opens from "Furniture catalog" above the office and from a room's panel. An icon to draw in the style of the others, or one of yours. |
| R79 | feature | **A milestone gets a pop-up with confetti,** which shows what it has opened. | From the playtest of 0.10.0. Today a milestone is a line in the news with a jingle, and what it opens gets a small pop-up at the top ("Sales is open: …"). To settle: whether the game pauses for it, and what it does with "reduce motion" on (proposed: the pop-up without confetti). |
| R83 | feature | **A thank-you section on the main menu and in the Settings.** Credits for Mike van der Meulen, with a link to mvdm.media; art style by Christian den Oude; thanks to the free kits the game uses; a link to the game's website, broadcastempire.online. | From the playtest of 0.10.0. The kits and what else to thank: Kenney (furniture, characters, three city kits, the train, the interface and impact sounds, the jingles), Quaternius (Uncle Tabby and Penny), and the typefaces Assistant and Fjalla One. In the desktop app a link opens in the browser of the system already. The website is described in `website.md` and is not there yet; until it is, that link leads nowhere. |
| R73 | choice | **The wiki does not explain what prestige does.** | From the playtest of 0.10.0. It cannot: prestige does nothing. Events earn it, it is counted, and two milestones look at it ("first event" and 100 prestige). The article calls it "the company's second score" and leaves it there. To settle: say that plainly in the wiki, or give prestige something to do (for example better sponsor offers, or hosts who would rather work for you). |
| R72 | fix | **The wiki lists the recessions of the future.** Let them be a surprise; once one has happened the wiki shows it. | From the playtest of 0.10.0. The article "History" has a table of every recession with its year, and a tip that says to plan for them. The wiki is written once from the rules today; for this it has to read the date of the game that is open. To settle: whether World Cups, Olympics and regular elections stay listed ahead (they are on a calendar everybody would know), and whether the news ticker may still warn a few weeks before a recession. |
| R77 | choice | **A canteen does not need a seat for everyone:** half would do, people do not all eat at once. | From the playtest of 0.10.0. That is the rule already: a table has four chairs and counts for eight people. But the game says "Canteen seats 60% of staff" and "has a seat for everyone", which reads as a chair each. To settle: only other words ("serves"), or also fewer tables (a table for 12 or 16). |
| R68 | feature | **Studios and decor for kids' shows and reality TV.** | From the playtest of 0.10.0. Today both are made in the production studio, which needs no set, together with the sitcom (see R65). Each new studio needs a decor built from shapes like the three there are (a photo to work from helps), a picture for the list of rooms and a price. To settle: whether the sitcom gets one too, which would leave the production studio with nothing to make; and whether the decors have to be researched (reality TV exists from 2000). |
| R74 | feature | **A streaming service.** Once it is researched and there are enough servers, all your shows are offered on demand, for a monthly subscription whose price you set. Another way to earn. | From the playtest of 0.10.0. Today the technology "Streaming" (2012) adds 10% to the income from bought titles, and server racks only hold titles. This is a new part of the game, for its last twenty years. To settle: how many servers are enough, what brings and loses subscribers (the price, how many shows, how good and how fresh), whether it takes viewers away from your own channels, and whether rivals get one. |
| R76 | feature | **Elections with people in them.** The wiki names the president and vice-president that were elected (made up per game), a president can serve two terms, and now and then there is a snap election. | From the playtest of 0.10.0. Today elections fall in fixed years, the news draws more during a campaign, and nobody is elected. The names are for reading only, unless you say otherwise. A snap election is more than that: it changes the rule that the calendar of the world is fixed (Decisions.md), and it is one more thing the news ticker has to announce. Like R72, the wiki has to read the game that is open. |
| R69 | feature | **Wiki: a backstory for Tabby Loid.** | From the playtest of 0.10.0. His article has three facts (known as Uncle Tabby, newspapers, the money he put up) and what the welcome says. I can write a draft from lore.md for you to change; the lore is yours. |
| R70 | feature | **Wiki: a backstory for EPB:** when it was founded and so on. | From the playtest of 0.10.0. Its article lists its channels and says it was the only broadcaster until 1970. Same way of working as R69. |
| R71 | feature | **Wiki: more about each region:** what the people are like, their football and basketball teams, the capital city, what there is to see, and pictures. | From the playtest of 0.10.0. A region's article has its numbers and a part "For a broadcaster". Overlaps R24 (cities on the map) and R25 (pictures in articles). The text I can draft from lore.md; for the pictures say whether screenshots of each region's town will do, or whether they are drawn. |
| R75 | feature | **Wiki: a page for every sponsor,** with a made-up backstory. | From the playtest of 0.10.0. There are eight: Beerstar, Citrus, Foodst, Ipsum & Ipsum, Jupiter, Manen, Moon Capital and Tahoma, each with a logo; one article lists their names (R20). Since 0.10.0 the company gets to know them, so a sponsor's page could also show how well. Same way of working as R69. |
| R67 | choice | **What was filled in to build the second half of 0.10.0.** Courses: 30 days, two months of salary, 5 to 8 skill points, a stand-in at 75%, one person at a time per kind of job, a host sent by a channel manager, no courses for managers and support staff. Sponsors: six levels, 20% to 70%, the rate goes by the level alone (sales skill now only brings more offers and faster levels), a penalty costs one level, half the offers come from sponsors you know. An extra producer: 5% each, two at most. Television with Penny: one program of series in the evening (films lose money at that size), she offers it once the money covers the license plus €70,000. A TV license: a fifth cheaper, in price and in monthly fee. The talk station: one hint, no steps. The mouths: a shape that opens with the loudness, no lip shapes. | Each stays unless you say otherwise. The numbers are in `src/config/balance.ts` (`TRAINING`, `RELATIONS`, `EXTRA_PRODUCER`, `LICENSE`) and `src/sim/guide.ts`. |
| R65 | choice | **The new studio kinds, as they were built in 0.10.0:** the production studio (sitcoms, kids' shows, reality TV) needs no set and takes none, so it costs about €10,000 less to set up than before; the soap opera studio has three cameras and three lights and is 8 by 5 tiles, like the production studio where soaps were made before; the game show studio and the soap opera studio cannot be built until their decor is researched; no sitcom, kids' or reality studio of its own. | Each stays unless you say otherwise. A decor that stands in a production studio in a game from 0.9.0 stays there; it can be sold, not moved. |
| R44 | feature | **A roof on the building, with an antenna on it,** and a satellite dish once that technology is there. | From the first playtest of 0.9.0. The game has a technology "Satellite uplink" (1979). To settle: whether the antenna and the dish are placed by the player and needed to broadcast, or come by themselves and are for looking at. |
| R45 | feature | **A master control room (MCR), needed to run more than one channel.** A technician works it when nothing needs repairing. | From the first playtest of 0.9.0. A new kind of room and a change to the rules: today a second channel needs a manager, a studio and licenses. To settle: what stands in the room, whether one room serves any number of channels, and what happens to a company that already has two channels and no such room. |
| R46 | feature | **A video editor and an editing room,** which make a game show or a soap opera better. | From the first playtest of 0.9.0. A new job and a new kind of room. To settle: by how much, whether other TV shows gain too, and how it sits beside the technology "Digital editing" (1993), which already adds 15% to production skill. |
| R47 | feature | **An audio engineer and a room for them,** which make a radio show lose its freshness more slowly. | From the first playtest of 0.9.0. A new job and a new kind of room. To settle: by how much, and whether one engineer serves every radio show or a few. |
| R48 | feature | **A stove for the canteen and a cook to hire,** for more morale. | From the first playtest of 0.9.0. A new piece and a new job. A complete canteen already carries morale from 60 to 100 in a clean office, and morale cannot pass 100, so this needs room made for it: the canteen alone would then give less than it does now. |
| R10 | choice | **Should a company be able to live on its home region alone?** | Today only Coaxia carries a full team on one license, so Penny sends everyone there first, whatever the headquarters. Changing it is a change to the balance. |
| R13 | feature | **Music.** | The Music volume in Settings does nothing yet. |
| R16 | choice | **Numbers that were not yours:** a TV sports show without rights draws 60% of what it would with rights of average prestige (new in 0.10.0; the other numbers of 0.10.0 are in R67); building a room €50 a tile; a piece gives its whole price back for a week, then 75% falling to 25% over five years; a studio with its desk in a control room works 5% better; a channel starts at reputation 15 in the home region; hosts cost three fifths of what they did since they present one show a day. | All in `src/config/balance.ts`. |
| R18 | choice | **The look, never approved in so many words:** Assistant Regular (not Extra Light) for small text and numbers; the dark theme; eleven icons drawn to match yours; which icon stands for which window; Finance as month columns; Research as a tree; the status bar with icons. | Written down in `design/style.md`. |
| R20 | choice | **Lore that was added to the wiki:** the name "The law of 1970", a "For a broadcaster" part per region, and a brands article that only lists names. lore.md still describes the old map (Coaxia in the middle). | The wiki's lore is in `src/wiki/lore.ts`. |

## Low

| # | Kind | Request | Notes |
|---|---|---|---|
| R62 | feature | **The colours of the regions on the map of Etheria** closer to the art style of the game. | From the second playtest of 0.9.0. The five colours came from the first map drawing and are kept in one place (`--map-…` at the top of `src/ui/styles.css`, a light and a dark set). To settle: which colours. I can propose a set from the palette in `design/style.md` for you to judge. |
| R22 | feature | **Takeovers.** Buying a rival out of a region, or outright, with its channels and hosts. | Rivals have no money, value or staff today, so this needs its own design first. Taking over a rival's license in its renewal round exists. |
| R23 | feature | **Start as an offshore pirate station** that later goes legal. | From the brief's open questions; your answer was "not for now". |
| R24 | feature | **Cities, counties, roads and the physical map** on the map of Etheria. | The map shows the five regions only. |
| R25 | feature | **The wiki on the main menu,** pictures in its articles (a map per region first), and a list of what links to an article. | |
| R26 | feature | **Bring a browser save into the desktop app.** | Both use the same file format; saves are kept apart today. |
| R27 | feature | **Uncle Tabby and Penny walking around in the office.** | They only appear in the tutorial's windows. |
| R28 | feature | **Traffic that turns at crossings, overtakes and stops for lights.** | With turning, the car parks on the shore could go. |
| R29 | feature | **More life in the working day:** people crossing streets, a queue at the lifts, talk show guests arriving by taxi, weekends, people stepping aside for each other, footsteps. | All for looking at only. |
| R30 | feature | **More for the CEO's character:** a portrait in lists, more than one piece of clothing, hats and glasses. | |
| R31 | feature | **Small things in the office:** a TV screen that changes with the years; toilets and a reception on the landings upstairs. | |
| R32 | choice | **Choices in the windows of Phase 12 and 13:** channel managers and department managers share the tab "Managers"; a show can be pressed and then put in a slot, as well as dragged; "Propose a place" for a room; the job buttons that give a department a whole office; "Go through them" and ‹ › for furniture; placing with the arrow keys; someone whose own desk is broken takes a free one; the CEO no longer sits at a spare manager's desk. | Each stays unless you say otherwise. |
| R33 | choice | **Small readings:** "giving it a name" at the headquarters means the company's name; bus riders reach the door about a quarter past; jingles follow the Sound volume, not the Music volume. | |
| R34 | feature | **More cheat codes:** ones that trigger an event, an auction or bankruptcy. | For testing. |
| R35 | release | **A .deb package for Linux.** | One line of configuration, but it needs a maintainer name and e-mail address. |
| R36 | fix | **A warning in the developer console** when another region is picked and Start is pressed in the same instant on the new game screen. | The game starts as it should. Possibly the same thing: one start in six of the packaged Mac app logged an error ("removeChild … not a child of this node") and played on normally; it could not be made to happen again. |
| R37 | fix | **Sound in an old Safari.** The clips are Ogg files; a browser that cannot read them stays silent. | Chrome, Edge, Firefox and the desktop app play them. |
| R38 | release | **Eight moderate warnings in `npm audit`.** | In the tools that build the installers, not in the game. The fix npm offers is a downgrade. |

## To watch while playtesting

Not requests yet: things the tests cannot judge, or that were not checked on a real machine.

- **Morale standing still at 60 with a complete canteen.** It could not be reproduced. If it happens, note what stood in the canteen.
- **A talk station.** Penny suggests one (0.10.0); the test players never built one, so nobody knows yet whether it pays. Say how it goes.
- **Sponsors at 70%.** A sponsor known for years pays 70% over the ad rate where every sponsor used to pay 10% to 50%. Say whether money gets too easy later on.
- **Sales two months sooner.** Since 0.10.0 Sales opens on 1 February when January pays its way (it used to take a month that closed up after all spending, 1 April for the test players). Sponsor money comes sooner, and the test player leads the radio market after five months in more games than before. Say whether the first year got too easy.
- **A game saved in 0.9.0 with TV studios.** Its game shows and soaps move to studios of their own kind when it is loaded. Checked by tests, not by hand.
- **Pace.** A day is 4 seconds at normal speed; 1970 to 2030 is about 24 hours of play. The test players reach a first profit within three months and lead the radio market within a year; a person will be slower. Say where it drags or rushes.
- **Difficulty.** Easy, normal and hard only change how good the rivals' shows are (×0.6, ×0.7, ×0.8).
- **The desktop app on Windows and Linux.** The installers are built on a Mac and have never been run. Look at the 3D office in particular: how smooth it is, and whether anything is missing or black.
- **A small or touch screen.** Not checked since Phase 12: the workplaces list, the small window of a piece of furniture, drawing a room with a finger.
- **Moving a piece of furniture to another room,** and everything about the long building in Amplify Hills and Aerial Fields, were checked by tests more than by hand.
