# Changelog

What changed in each version of Broadcast Empire, newest first. What is still wanted is in [REQUESTS.md](REQUESTS.md).

Version numbers are `0.minor.patch` until the game is finished: the minor number goes up with a bundle of requests, the patch number with fixes only.

## 0.11.0 (14 October 2026)

The fourth alpha: finding your way in the interface, and what a public build needs.

**New**

- **The On air window, reworked around the channels (R82).** Its menu has Channels, Content and Ratings. With radio and TV channels both, the list can show one kind. Every channel has a Schedule button that opens its own schedule, with buttons to add a show: "Radio show" and "Radio talk show" on radio, "Produced TV show" and "From the library" on TV. Beside the slots stand the shows that are in no slot yet, and those on your other channels. Pressing a show shows it in full next to the schedule: that is where it is changed, revamped and cancelled. A new show is pressed at once, so the slots offer to take it. The channel manager is chosen from tiles with a portrait and a name.
- **A milestone gets a pop-up with confetti (R79),** with what it was for and what it opens, and a button to go there. The game waits until it is closed and then carries on at the speed it had. With "reduce motion" on it comes without confetti.
- **Credits (R83),** on the main menu and in the Settings: who made the game, the art style, the free kits and typefaces it is built from, the voices, and a link to broadcastempire.online.
- **Prestige does something (R73):** hosts would rather work for a company people talk about. Rivals court your hosts less often, up to 60% less, and hosts in the hiring pool ask less, up to 10% below the going rate. Both grow with prestige and are at their full size from 200 prestige. The wiki says so.
- **Traffic lights, turning and overtaking (R28).** Every crossing of two busy streets has traffic lights, which give the other street green once someone waits there, and give it sooner to a bus or taxi that is due. Cars, taxis and vans turn right now and then, round the corner of the kerb, when the street they turn into has room. A car or a van overtakes a bus or a taxi that stands at the kerb on the other side of the road; whoever comes the other way stops short of it. In a town by the water the side streets end at the street along the shore, where the traffic turns: the car parks on the shore are gone.

**Changed**

- **No more room buttons above the office (R81).** A room is picked by clicking it in the office, or its name. The Office window lists every room of the building, by floor, which is also the way to a room with the keyboard. Penny's ring goes around the room's name in the office when she asks for a room.
- **The furniture catalog is in the menu on the left (R80),** as "Furniture", with an icon of its own. With a room selected it opens at that kind of room. It also still opens from a room's panel.
- **The map of Etheria in the colors of the game (R62):** the regions are tints of the palette's yellow, green, orange and red and its lavender, on a sea of pale navy, with the game's ink for lines and names. A proposal: say if you want other colors.
- **The canteen "serves" (R77):** a table with four chairs serves eight people over the day, since people do not all eat at once. The game used to say "seats", which read as a chair each. Nothing changed in the rule.
- **Penny's instructions** for the steps that used the Shows and Schedule pages and the room buttons point at the Schedule button of a channel and at the room in the office. What she says aloud is unchanged.

**Fixed**

- **The wiki no longer lists the recessions of the future (R72).** "World events" shows the recessions that have happened in the game that is open; World Cups, Olympics and regular elections are still listed ahead, as on a calendar. On the first of December before a recession the news says one is coming.
- **The question mark beside a title stays visible under the pointer (R78).**

**Changed under the hood**

- No change to saves: this version reads and writes version 27.
- The traffic is tested over every town for vehicles touching (also at four times the frame length), for nobody standing still long, and for the bus being at its stop on time.

**Known limits**

- The colors of the map are a proposal.
- An ordered taxi is now and then a second late at the door; a little more often than before the traffic lights.
- Checked in a browser (Edge, light and dark): a test player followed Penny's ring through her first weeks and her chapter on television on the new On air window, the room names in the office and the catalog in the menu; the milestone pop-up, the credits, the map, the recessions in the wiki and the traffic lights were looked at.
- The installers are not signed. The Windows and Linux installers were built on a Mac and have still not been run on those systems. No music yet.

## 0.10.0 (13 October 2026)

The third alpha: what the first two playtests of 0.9.0 got stuck on, and more to do in the first years.

**New**

- **Television, the small way (R64).** Once the company can pay for it, Penny offers to walk the player through a first TV channel: the channel, a manager of its own, a license, a library, bought series and one program of them in the evening. No studio, no host. She asks once; "Not now" is an answer. A TV license costs a fifth less: €160,000 and €12,000 a month for a region of 2.5 million people. Tested with the test players: after a few months such a channel pays for its series, its license fee and its manager.
- **A second station (R50).** After the first weeks, with one channel and the money for another, Penny points out the listeners that music does not reach, and what a talk station takes.
- **A studio of its own kind for every staged show (R60).** There is now a TV game show studio and a TV soap opera studio beside the TV talk show studio. Each is built around its set, which is on the room's checklist and stands in no other kind of room. The production studio is for sitcoms, kids' shows and reality TV and needs no set. A studio whose decor still has to be researched is dimmed with a lock in "Build a room", and says what it waits for.
- **A TV sports show without rights (R63).** It can be made and goes on the air: it talks about sport, and draws 60% of what it otherwise would. Sports rights make it show the games, as before. The show's card says "No sports rights: talk only" while that is so.
- **A new "Create a show" form (R56),** without drop-down lists. First the sort of show (live radio, talk radio, produced TV, TV from the library), then the genre from a list, the host as a tile with portrait, skill and star, the producers, and the studio as a picture of its kind with its name. Only genres that can be made today are offered; what is not there yet is named in one line with what it waits for ("build a radio talk studio", "research Game shows"). A studio is chosen by itself when there is only one.
- **Courses (R49).** A host or someone in production, sales, marketing or research can be sent on a course from the Staff window: 30 days away, for two months of their salary, and 5 to 8 skill points better on return. A stand-in does their work meanwhile at three quarters of their skill. The head of the department arranges it (for a host a channel manager), one person at a time.
- **Getting to know a sponsor (R58).** The sales staff look after the sponsors under contract, and each relationship has six levels: a sponsor pays 20% over the normal ad rate at level 1 and 10% more with every level, up to 70%. A new level counts at once on the contracts that run. Sponsors you know come back with offers; a contract that ends in a penalty costs a level. The Sales window lists the sponsors you know. While every show has a sponsor, the team works on them at twice the pace.
- **Uncle Tabby and Penny move while they talk (R40).** An arm comes up and gestures while their line is heard, the head moves along, and each has a mouth that opens with the loudness of the recording. With "reduce motion" on they stand still.
- **A name for a room (R61):** the pencil beside a room's name in its panel.
- **Icons for Sell, Turn and Move (R53)** in the small window of a piece of furniture; Turn and Move have no words any more.
- **"Build a room" says more with less (R51, R52).** Picking a kind puts its outline on the floor at once, at the usual size for that kind, with a door. The chosen kind says what it is for, what is made there, how large it usually is and what it needs. The size of the outline stands beside the price and on the outline itself, with the usual size when it differs. Whatever still stands in the way of building is in a yellow box above the Build button, and the outline turns red with the reason on it.

**Changed**

- **Penny has the five shows made first, and the schedule after (R55).** Her steps are now "Your first show", "Four more shows" and "The schedule". The line `schedule` has new words, recorded anew.
- **An extra producer always helps (R54).** The best producers on a show count, as many as its genre needs; every one beyond that adds 5%, for up to two of them. A second, weaker producer used to pull the average down.

**Fixed**

- **Penny and the monthly report agree about January (R42).** Both go by the running result: what came in less what the company costs to run, without the furniture and the license. A January that pays its way finishes her step "Into the black" on 1 February and opens Sales that day; nobody sits through February for nothing. The milestone "First profitable month" counts the same way. Two of her lines have new words, and their new recordings are in: `first-month` and `black`.
- **The view no longer goes white when a piece is picked up (R43).** The whole floor used to wait while the model of a piece that had not been shown before was fetched. Now only that piece waits.
- **The first hiring pool has the hosts Penny asks for (R41):** one for a morning show, three for Top 40 and one for rock, in every new game. Who they are, how good and how dear is left to chance, like every later pool.
- **No sponsor offers for shows that are not there (R57).** Sales brings none for radio or for TV while every show there has a sponsor, and the Sales window says so. An offer that is still open with no show to go to says that too, in place of an empty list.
- **A canteen needs one counter (R59),** not two.
- **Penny's line `bailout` is recorded (R39).**
- What Penny points at is scrolled into view when it is out of sight in its window, and a piece that is still on the pointer is put away when she goes on to the next step.

**Voices**

- All 55 lines of Uncle Tabby and Penny Cash are recorded. Thirteen recordings are new in this version: `first-month`, `black`, `schedule` and `television` with their new words, `bailout`, and the new `talk-station`, `tv-channel`, `tv-manager`, `tv-license`, `tv-library`, `tv-titles`, `tv-show` and `tv-finish`.
- A line that waits for a recording is shown and not heard (the list `TO_RECORD` in `src/config/voiceOver.ts`, empty now), so an old recording never says other words than are on screen.

**Changed under the hood**

- Saves are at version 27. In a game from 0.9.0, a talk show studio that only made game shows becomes a game show studio and a production studio that only made soaps becomes a soap opera studio, furniture and all; where one studio made both kinds, the game show or the soap loses its studio and a message says so. Nobody is on a course, the sponsors under contract are known at level 1, and a company that heard Penny's old word about television is not walked through it unasked.
- Room kinds in the middle of a sentence keep their capitals ("a TV news studio", not "a tv news studio").

**Known limits**

- The balance moved, and playtesting has to say how far: Sales opens on 1 February where it used to open on 1 April for the test players; sponsors you know pay up to 70% where every sponsor paid 10% to 50%; a TV license is a fifth cheaper. A single well-run radio channel now keeps up to 29% of its income over ten years, where it stayed under 25%.
- A talk station as Penny suggests it was not played through by the test players.
- A loaded 0.9.0 game with TV studios, the Sales window with every show sponsored, and a course from start to finish were checked by tests and not by hand.
- The installers are not signed. The Mac app from the installer's build was started on an Apple-silicon Mac and checked for its version, the thirteen new recordings, building a room and the new show form; the Windows and Linux installers were built on that Mac and have still not been run on those systems. No music yet.

## 0.9.0 (13 October 2026)

The second alpha: the tutorial has its voices, and the first answers to the open requests are in.

**New**

- **Voice-over in the tutorial (R1).** Uncle Tabby and Penny Cash say each of their lines aloud when it comes up, from the 46 recordings in `public/voice/`. A line is said once; the words stay on screen. Settings has a Voice volume of its own.
- **A bail-out (R6).** The first time the bank would close the company down, Uncle Tabby pays in €50,000 and the bank starts counting again. He does it once; it is a gift, in no report. Penny has a line for it, `bailout`, which is not recorded yet (R39).
- **Drag the view (R14).** The office is moved by dragging it with the mouse or a finger; two fingers move and zoom it. While a room is being drawn, drag with the right or middle button, or two fingers.
- **More news with a pop-up and a dot (R15):** a rival's offer to one of your hosts (Staff), a license that runs out and its renewal round (Licenses), and a technology that comes within reach of your research points (Research). A loaded game gets its dots back for what is still waiting.
- **One Mac installer for every Mac (R21):** Apple silicon and Intel in one .dmg.

**Decided, and off the list**

- The application id stays `media.mvdm.broadcastempire` (R3) and the cheat console stays in the game (R4).
- The CEO's office and sitting next door to one's manager are for looks only (R7, R8).
- The dividend stays (R11), research keeps its two ways in (R12), managers keep their management office (R17) and the models built after the photos stay (R19).

**Changed under the hood**

- Saves are at version 25. Older saves load as before and still have the bail-out to come.

**Known limits**

- The installers are not signed. The Windows and Linux builds have not been run on those systems yet. The Mac build was run on an Apple-silicon Mac, its Intel half through Rosetta there, not on an Intel Mac.
- Two fingers on a touch screen (move and zoom) were built but could not be tried here.
- No music yet.

## 0.8.0, the first alpha (13 October 2026)

The first build meant for playtesting on Mac, Windows and Linux. It holds everything built in Phases 0 to 13 of the roadmap in [prompt.md](prompt.md).

**In the game**

- A company from 1 January 1970 onward: radio first, television later, in the five regions of Etheria, against the public broadcaster and three commercial rivals.
- An office you build yourself: rooms drawn on the floor, furniture placed by hand, staff who can be given a place of their own, and a 3D view of it all with the town around it.
- Shows, schedules, hosts and production staff; sponsors and marketing campaigns; license auctions and renewals; research from the typewriter to the cloud; a content market for television; sports events, elections and recessions; events of your own.
- A living office: dirt, wear, faults in the building, morale, a canteen, and the support staff who deal with them.
- Things open step by step with milestones; 32 milestones, dividends and prestige as scores.
- A tutorial by Uncle Tabby and Penny Cash (text only for now) and a wiki of 51 articles.
- Named saves and an autosave; easy, normal and hard; light and dark; sound effects and jingles.

**New in this version**

- The game says which build it is: on the home screen and at the bottom of Settings ("Alpha 0.8.0"), in the browser as well as in the desktop app.
- The cheat code `year` no longer makes furniture decades older.
- Cleaned up: the reference pictures and photos, the first version of the brief, the furniture list and one unused model are out of the project. They are still in its history.

**Known limits**

- The installers are not signed. The README says how to open the game anyway on each system.
- The Mac build is for Apple-silicon Macs. The Windows and Linux builds are made on a Mac and have not been run on those systems yet.
- No voice in the tutorial and no music yet.
- The cheat console (Ctrl+Alt+C) is in the build, for testing.

## Before 0.8.0

The game was built phase by phase, each phase a commit on a branch of its own (`phase-0` to `phase-13g`); `git log` has the story. The desktop app carried the number 0.7.0 from Phase 7 on.
