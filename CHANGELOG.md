# Changelog

What changed in each version of Broadcast Empire, newest first. What is still wanted is in [REQUESTS.md](REQUESTS.md).

Version numbers are `0.minor.patch` until the game is finished: the minor number goes up with a bundle of requests, the patch number with fixes only.

## 0.18.0 (21 October 2026)

The world around the company, and a company that streams: a streaming service for the last twenty years, radio and TV awards every five years, presidents with names, music that pays royalties and needs records on the shelves, the sounds of the office and the town, and a wiki that tells the story of Uncle Tabby, the sponsors and the regions.

**New**

- **A streaming service (#17).** Research Streaming (2012), keep two server racks and ten shows or titles, and open a service in On air → Streaming. You set the monthly price; subscribers come for a big, good, fresh catalogue at a fair price and leave when it slips. EPB+ (2014) and the foreign Nimbus (2017) compete with you, and the service takes some viewers from your own TV channels. Radio shows count once Podcasting is researched.
- **Radio and TV awards (#35).** Every five years from 1975, with nominations on 1 October and the night on 1 November: best show and best host, for radio and for TV, yours and the rivals'. A nomination and a win bring prestige, fame, reputation and morale. A winning host asks for a raise and you choose to pay or say no. There is a new milestone, “And the winner is…”.
- **Social media accounts (#22).** Once Social media is researched, each channel can have an account run by a marketer. It costs €1,000 a week, builds a following over months and makes the channel more appealing, mostly to the young, on top of campaigns.
- **Elections with people in them (#19).** Every game makes up its own presidents and vice-presidents. A president serves two terms at most, and now and then the government falls and a snap election follows. The wiki lists who holds office and who did before.
- **Music rights and record shelves (#33).** Top 40, rock and classical shows pay royalties, a small share of what they earn. Record shelves in a radio studio make those shows better.
- **A library needed for music (#43).** A music show only airs when the library holds the records of its genre, bought once and kept on the shelves.
- **A music scheduler (#44).** A new job at a scheduling desk in the music scheduling office. A scheduler looks after one music radio station and makes its music shows more appealing. The desk follows the office years: typewriter, screen, laptop.
- **A workshop and a talent manager (#48).** A new room with a trainer's desk, training seats and a whiteboard on wheels. With a talent manager there, courses are given in-house, cheaper, for several people at once, and the talent programme is run from there.
- **Security (#41).** A security room and guards. A host with fame 50 or more attracts fans: an unguarded one loses morale, and now and then a fan gets in. The monitors on the desk are old tube screens, so they fit any year.
- **Sounds in the office (#39).** Typewriters and later keyboards, phones, the studio audience, the canteen, repairs, the town (city, industry, farmland, sea), gulls, and the train as it passes. They are louder where the camera looks, and have an Office volume of their own in Settings.
- **An inventory (#67).** Store a piece of furniture for nothing and place it later in any room on any floor. Changing floor no longer drops a piece you are carrying.
- **Floors five and six (#110).** The standard building goes up to six floors, opening at a company value of €8,000,000 and €15,000,000. The long building has four.
- **A wiki with more in it (#14, #16, #18).** Uncle Tabby has his backstory. Every region has a picture of its town and writes about its people, sport, capital and sights, and Etheria has a Government section. Each of the eight sponsors has a page with its logo and how well your company knows it, linked from Sales.
- **More cheat codes (#9).** `event` moves to the next World Cup, Olympics, election or recession, `auction` puts a license up for auction, and `bankrupt` and `bankrupt soon` test the bank.
- **A 1970s master control desk (#104).** Until Personal computer, the desk is a long console of buttons, faders and tube monitors, after a photo of the real thing. After that it is today's desk.

**Changed**

- **A tidier Staff window (#113).** Three tabs, Staff, Teams and Hiring, with strike warnings and poach offers above them. The jobs are grouped under Hosts, Content, Management, Business and Support, in the list and in the hiring pool.
- **A tidier Rooms window (#103).** The tabs are grouped into Offices, Studios, Production and Morale, with a second row for the kinds in each.
- **Gentler for older games (#110).** The time to meet the rules of 0.16.0 is 90 days. Extra desks are bought back at their full price, and a game that has already been through the change is paid back what its required rooms cost to build.
- **The dividend gets a pop-up (#73).** On 1 January Uncle Tabby says what he took and why, or why he took nothing, and the Finance window explains what a dividend is.
- **The source files are split (#91).** The 3D office, the office screen and the game's actions are in smaller files. Nothing changes in play.

**Fixed**

- Tables in the wiki wrap inside the text column instead of scrolling sideways (#108).

**Saves**

- Saves are at version 46. Older games load: royalties, records, storage, accounts, awards and politics are worked out from the game or start empty, and a game that went through the 0.16.0 change gets its refund.

## 0.17.0 (20 October 2026)

An office that knows its people: an inbox where every piece of news is an e-mail from the person it concerns, recruiters, promotion to head of a department, channel managers who lead their channel's production team, and a Staffing report that says whether a show has enough people. Windows can be resized, and names are made from new lists.

**New**

- **An inbox (#60).** Every message is an e-mail from the person it concerns, with their name, picture and a made-up address like `jan.van.dijk@mvdm-media.eth`, and a priority of high, medium or low. A channel's news comes from its channel manager, a broken machine from a technician, and milestones, the dividend and the bailout from Uncle Tabby (`tabby@loid-enterprises.eth`). The Inbox window sits after Office in the menu, with the number unread on its icon, the filters All, Unread and High, and a button to the window an e-mail is about. The last 300 are kept, and low-priority news no longer gets a toast. Tabby's and Penny's pictures are still to come: their initials stand in.
- **Recruiters (#36).** A new job at an ordinary workstation. Each recruiter at a desk adds better candidates to the hiring pool every month (two at most count), and when a host is working out their notice they find a replacement within a week. They can arrange the talent programme in place of a channel manager.
- **Promotion (#49).** Someone in production, writing, editing, sales, marketing or research can be made head of their department, after a warning that names the shows, campaign and desk they leave. They are paid at least a manager's salary.
- **A staffing overview (#68).** A new section of On air, “Staffing”: each studio's day, every show with its host, producers, writers and editor and their skills, and who has room for another show. A show on the air with too few producers at work gets a tag on the schedule, a dot on the tab and a warning e-mail from its channel manager.
- **Windows can be resized (#62).** Drag the right edge, the bottom edge or the corner; a double-click on the corner brings the normal size back. The screens inside follow the window's width, so two windows fit side by side. Sizes last until the game is closed.
- **Search and sort in the Staff window (#70).** Find someone by name, sort by skill, morale, shows, salary or the day hired (fame for hosts), and show only those who need attention or have low morale.
- **Your hosts on the schedule (#64).** A panel beside the schedule lists each host's skill, what they are best at and what they present; a host's tile in the show form lists their genres, and each genre names the best free host for it.
- **A phone on every desk (#38).** A dial phone on workstations and writers' desks until 1982, a push-button phone after that, none once the desks have laptops. The managers' and the CEO's desks keep theirs.
- **New ways to make names (#92).** People, rival companies, rival channels and rival shows get names put together from two lists, so no two games read alike. A dice button beside the channel name and the company name suggests one.
- **Penny and the television chapter (#50).** She also mentions the Cables view in the master control step (#46) and has a new step, “A post room”, before the library (#42). Her lines for the studio, the master control room, the TV manager and the post room have new words, and all four are recorded.

**Changed**

- **A post room before the library (#42).** A library, and buying titles on the content market, need a post room with its sorting case, until a library has a server rack. A game that already has a library gets 30 days.
- **The channel manager leads the production team (#47).** Production staff on a channel's shows meet with that channel's manager. The hosts have no meetings any more.
- **Television is offered later, and always carried on (#50).** Penny offers it after six monthly reports, the last three in the black. Auctions, rights and low titles wait until the chapter is done, and after any hint that cuts in she goes back to the same step and says so. “Walk me through television” in Settings starts it again.
- **Everyone has a name (#72).** The audience, the receptionist, guests and contestants have made-up names, and the person who comes by bus keeps the name of their seat.
- **Eyes and mouths keep their color (#61).** Choosing a hair color no longer repaints them.
- **A Staff row no longer overlaps (#71)** in a narrow window; the pay and tags move to a line of their own.
- **The choices of 0.15.0 and 0.16.0 and of Phases 12 and 13 stay as built (#8, #37, #40),** and are written down in Decisions.md.

**Fixed**

- The tests had too short a time limit on slow machines; it is 30 seconds now.

**Saves**

- Saves are at version 37. Older games load: the hosts lose their meetings, every old message becomes a read e-mail with a sender, and a game with a library and no post room gets 30 days to build one.

## 0.16.0 (17 October 2026)

From the studio to the antenna, and a clearer start: a master control room that every channel goes out through, a control room of its own for every TV studio, the cables between them, a recording booth, one desk to a room for managers, editors and audio engineers, decor that does something and cartoons. From the playtest: the game runs four times slower, a channel or show off the air for a week gets a warning, the CEO's office and the reception desk come first, the dark screen is explained, and the furniture window is called Rooms.

**New**

- **A master control room (R45).** Every channel goes out through it: a narrow room with a master control desk, a long curved desk after the designer's photo, and a wall of monitors. One room serves every channel, and a technician works its desk for half of their day. Without it, or without a technician, nothing goes on the air. Penny has it built after the studio, and the technician hired after the cleaner.
- **A control room of its own for every TV studio (R131).** The control desk and a new audio mixer, a console of lit buttons and faders after the designer's photo, stand in a control room wall to wall with the studio, which belongs to that studio alone. A technician works it while the studio has shows on the schedule, half of a day for each control room, after the master control room; a studio whose control room nobody works goes out at 75% of its level. Build a control room on a floor with a TV studio and the game proposes the place beside it. A radio studio keeps its own mixing desk, which can still stand in a control room next door.
- **Cables (R127).** “Cables”, beside the floors, shows the cables of the building, laid by themselves: from every studio, or a TV studio's control room, to the master control room, and from the master control room up a shaft by the stairs to the antenna and the dish. Green carries a channel on the air, red one that can't go out, grey nothing; a list beside says where each one goes.
- **A recording booth (R130)** in the audio room, padded, with a window and a microphone. The audio engineer at the desk beside it records jingles and promos as well, and the shows they look after are 5% better.
- **Decor that does something (R128).** A production calendar (production staff in its office +5%), a sales chart on an easel (sales +5%), a big printer (campaigns 10% cheaper), a bin (a room gets dirty a fifth more slowly), a dishwasher (a canteen gets dirty half as fast) and a flip chart (meetings lift morale a quarter more); a filing cabinet and a dresser with certificates are comfort pieces, and an aquarium counts as three. Several are after the designer's photos.
- **Cartoons (R134),** a new kind of title on the content market, four a month, for children and so for families.
- **A warning after a week off the air (R138).** A channel that has not been on the air for seven days in a row, or a show on the schedule that has not gone out for as long, gets a warning in the news with the reason. It is said once, until it goes out again.
- **Penny has seven new lines:** a look around the office first, with how to turn, zoom and move the view; your own office and the reception; the master control room after the studio; a technician after the cleaner; day and night on the office clock, once the game runs; and a hint for a channel without a master control room. They have no recording yet; their words are on screen.
- **A wiki article on headquarters and master control,** and the articles on the screen, time, the office, furniture, studios, managers, writers and engineers, upkeep, morale, channels and the content market say what changed.

**Changed**

- **The game runs four times slower (R135):** a day takes 16 seconds at normal speed, so 1970 to 2030 is about 97 hours. The speeds are still 1×, 2× and 4×; 4× is what normal was. The office clock and the day of the people in it slow down with it; the cars, the buses and the people in the street keep their pace, and a bus still comes at a quarter to every hour of the clock.
- **A CEO's office and a reception desk come first (R136).** Nothing goes on the air without them, and they are the first two steps of Penny's first weeks.
- **One desk to a room (R132)** in a management office, an editing room and an audio room: every manager, video editor and audio engineer has a room of their own. The usual size of a management office and an editing room is 3 by 5 now.
- **The dark screen is explained (R137):** Penny says why after the game starts running, the clock in the bar and the color scheme in Settings say how the office clock goes, and a new game opens in the light of a January morning.
- **“Furniture” is called “Rooms” (R139),** and each of its tabs starts with the room itself: its picture, its usual size and what it needs.
- **Technicians** work the desks of the control rooms and the master control room before they repair, so a company with television needs more of them. The test players build the CEO's office, the reception desk and a master control room with their first station, a control room beside every TV studio, a room for every manager, and hire technicians for the desks.

**Saves**

- Saves are at version 32. In a game from 0.15.0 the desks beyond the first in a management office, an editing room or an audio room are sold back, for what they are worth; a channel manager keeps theirs before anyone else, and whoever lost a desk takes a free one or needs a room of their own. A game on the air that has no CEO's office or reception desk or no master control room, or that has a TV studio without a control room of its own, gets 30 days to put it right, and the news says until when.

## 0.15.0 (15 October 2026)

A better place to work: morale has to be earned now, with a cook, a post room and team meetings, and a team that is neglected for too long goes on strike. Also an audio engineer for the radio shows, a roof with an antenna, and a color scheme that follows the time of day.

**New**

- **A cook (R48).** A stove in the canteen and a cook at it make hot meals, for 30 people a day for a cook of average skill. Everyone who gets one gains 8 morale. A cook is a new job, two a month in the hiring pool, and needs a stove of their own in a canteen that has all it needs.
- **A post room (R105).** A clerk at a sorting case sorts the post of 40 people. Everyone whose post is sorted gains 4 morale, and fan mail makes the hosts famous one and a half times as fast. Clerks are a new job, two a month in the pool.
- **A meeting room (R106).** A manager calls their team to the meeting table: the manager of Production for the production staff, writers, editors and audio engineers, the managers of Sales, Marketing and R&D for theirs, and a channel manager for the hosts. A meeting lifts the team's morale by 8 for 30 days, by less if the team has more people than there are seats, and costs half of the team's work that day. A team meets once a month at most; tick “Every month” and it meets by itself. The buttons are in a new Teams panel in the Staff window.
- **Strikes (R122).** A team whose morale stays under 35 for 14 days threatens to strike and names the day; if its morale is still under 35 then, it walks out for 7 days. On strike it does nothing: hosts present nothing and their shows go to reruns, production makes no shows, the support staff neither clean nor repair, and the strikers stay at home. A bonus of half a month's salary each ends a strike at once. Either way the team comes back 15 points happier. Morale back at 40 calls a threat off.
- **Audio engineers and the audio room (R47).** An engineer at an audio desk looks after three radio shows on the air, the ones with the most listeners first, and makes them lose up to half as much freshness a day. The audio desk is after the designer's photo, on the radio equipment line. Engineers are a new job, two a month in the pool.
- **The roof (R44).** “Roof” above the floors shows the top of the building: an antenna mast in red and white, after the designer's photo, and once the satellite uplink is researched a big dish beside it. They are for looking at.
- **The color scheme follows the time of day (R125),** by the clock of the game: light while the sun is up, dark before sunrise and after sunset. The sun sets early in winter and not before the office closes in midsummer. Light and dark can still be chosen; “Same as the system” is gone.
- **Penny has two new lines:** a cook, once the canteen is complete and the staff are fifteen, and a team that threatens to strike. They have no recording yet; their words are on screen.
- **The wiki** has the meetings, the post, hot meals and strikes in the article on morale, the audio engineers with the writers and editors, and the new jobs and rooms where they belong.
- **A cheat code `strike`** that has a team walk out at once, for testing.

**Changed**

- **A canteen lifts morale by 20, not 40.** With comfort pieces and toilets it no longer reaches 100 by itself: the cook, the post and the meetings do the rest.
- **The test players** set up a stove and a cook with their canteen, and a growing one builds a post room and a meeting room and has its teams meet every month.

**Saves**

- Saves are at version 31. A game from 0.14.0 has no meetings and nobody unhappy yet. Its morale drifts to the new levels by itself over a few weeks: about 20 points lower where only a canteen lifted it.

## 0.14.0 (15 October 2026)

Making shows, and room for them: writers and video editors, a studio for every kind of staged show, a cast on the set, a dressing room, a bigger building, a month's notice and a talent programme.

**New**

- **Writers and the writers' room (R110).** Writers are a new job, three a month in the hiring pool. They work in a writers' room, at a writer's place each, around a story board; places side by side make one long table. A writer writes two shows at most. They make a kids' show and a radio drama up to 10% better, and they make the sitcom, the soap and reality TV (below).
- **A sitcom, a soap opera and reality TV have no host (R87).** A cast plays them, and their writers count in a show's quality where a host would: two writers each. While such a show is on, its cast is on the set; on reality TV one of them sits in the confession booth.
- **Video editors and the editing room (R46).** Editors are a new job, three a month in the pool, each at an editing desk in an editing room: a console with small monitors and tape machines, with flat screens once HD broadcasting is researched. A produced TV show can have one editor, who edits two shows at most and makes them up to 10% better.
- **A dressing room (R111)** with a make-up table under a mirror of bulbs and a clothes rail. Every make-up table gets two hosts of TV shows ready, the most famous first, and their shows are 5% better for it.
- **The talent programme (R108).** A host of skill 40 or less can go away for a year, for six months of their salary, and comes back 20 to 30 skill points better. They present nothing meanwhile. A channel manager arranges it, one host at a time.
- **A studio of its own for the sitcom, kids' shows and reality TV (R68).** The sitcom studio is built around the coffee house the soap opera had; the soap opera has a pub now, after the designer's photo. The kids' studio has a playroom in red, yellow and blue, and the reality studio a house with a hot tub, a corner sofa and a teddy bear, with a confession booth beside it. The reality decor and the booth are researched with Reality format. The production studio is gone.
- **A month's notice (R107).** A host who signs with a rival works out 30 days first, presenting their shows as before, so there is time to hire someone in their place. The Staff window says when they leave.
- **Penny has three new lines:** that a sitcom needs writers, that a host who is leaving works out a month, and that the top floor is open. They have no recording yet; their words are on screen.
- **A wiki article on writers and editors,** and the articles on the office, studios, staff, hosts, television and poaching say what changed.

**Changed**

- **Bigger buildings (R109):** four floors in town instead of three, three longer floors in the country instead of two. The fourth floor opens at a company value of €4,000,000; the others open as before.

**Saves**

- Saves are at version 30. In a game from 0.13.0 a production studio becomes the studio of the kind most of its shows are (a sitcom studio if it made none), keeps a name it was given, and gets that decor for free where it fits; a show of another kind made there loses its studio, and a message says so. The host of a sitcom, a soap or a reality show is free for another show, and the show needs writers. Rival sitcoms, soaps and reality shows have no host any more.

## 0.13.0 (14 October 2026)

Seeing how the game works, after the playtest of 0.12.0: where the money comes from, why a show gains or loses its audience, what to put in which slot, and the way to the top.

**New**

- **Why a show draws what it draws (R100).** A show's card on the schedule has its quality, how well it suits who is tuned in, its freshness, the channel's reputation, the host's fame, marketing and bonuses, each with an arrow against a week ago, and the strongest rival in its slot. When a show loses much of its audience in a week, the news says why: it went stale, a stronger rival came, its marketing faded.
- **What to put in which slot (R101).** Each slot on the schedule names who is tuned in. Press a show and every slot says how well it suits it: good, fair or poor. An empty slot names the genres that would suit it best. The channel says whether it is specialized, and when one more slot of a kind would do it.
- **Becoming the biggest (R102):** a wiki article on winning the audience slot by slot, specializing, second channels for other audiences and more regions, and a word from Penny about who is listening once the first weeks are over. A new test player that grows this way, with a talk station beside its music station, draws more listeners and earns more than one whose second station plays the same music.
- **Repeat or extend a campaign (R90).** A campaign can be set to start again when it ends, and a running one can be made longer. The news says a week before a campaign ends.
- **A studio audience counts (R91):** audience seating makes a sitcom, a kids' show or a game show 5% better for each block, up to two. It is still not needed.
- **Contestants (R92):** two people play at the game show while it is on.
- **A new version, said on the main menu (R96).** The desktop app asks the game's releases on GitHub when it starts, and if there is a newer version the main menu says so, with what changed and a button to the download page. It can be switched off in the settings; nothing about you or your games is sent.

**Changed**

- **Where the money comes from (R99).** Finance has ad revenue, what sponsors add on top of the ads, and teleshopping fees on lines of their own, in the month so far, the month ahead and the monthly reports. A show's card says what it earns a day and what its sponsor adds; a contract in Sales says what it brings a month.
- **Bought titles that run out or go stale (R88, R89).** The news warns a week before a programme's titles run out, and again when they have; the slot says so too. A programme's card lists its titles with their freshness, says for how many days they last and how many titles keep it fresh; a slot whose title is stale says so. Penny has a word for both, the first time.
- **The Finance window no longer shows a profit while the money goes down because of marketing.** Campaigns are paid every day but are not a running cost, and they stood below the running result without a total. "This month so far" now ends with the result after all spending, the same figure as in the status bar, and "The month ahead" lists what the campaigns that run will still cost, with what is left after them.

## 0.12.0 (14 October 2026)

The money, after the playtest of 0.11.0: a company makes enough to grow, the bills come when they are made, and easy is easy (R85).

**Changed**

- **Bills are paid every day,** not all on the 1st: salaries, rent and license fees leave a day's share at a time, so the money in the status bar is what you have. The 1st only brings the loan installment and the monthly report. A game saved before pays what had built up that month when it is opened.
- **A bought title is paid by the airing.** Taking a title from the market costs nothing; each airing costs its share of the price on the day it airs, and a title thrown out costs nothing more. The market shows the price per airing. The Finance window counts the airings among the running costs, so its profit is the real one, and "The month ahead" includes them.
- **Titles last twice as long and cost less per airing:** series have 24 to 52 airings, films 10 to 20, documentaries 8 to 16. An airing costs about half what it did (a title about the same as before, for twice the airings).
- **Lower costs:** rent is €30 a tile instead of €40, and a TV license costs €8,000 a month in the Capital instead of €12,000 (the price stays).
- **The difficulty sets the money:** easy starts with €250,000 and everything costs a quarter less (rent, salaries, license prices and fees, titles and sports rights); hard starts with €125,000 and costs 5% more. Normal is as it was, with the lower costs above. The new-game page says so, and the wiki has a table.
- **Uncle Tabby pays for milestones:** €5,000 to €250,000 each (more on easy, half on hard), said in the milestone's pop-up and on the Milestones window, and in the Finance window as a gift. The dividend milestones bring nothing.
- **Penny suggests television a little later,** once the money covers the license and €100,000 more, so the first months of a TV channel can be paid. What she says is unchanged.

**Fixed**

- **The mouths of Uncle Tabby and Penny sit lower,** where a mouth goes: his sat just under his nose.
- **Renaming a room:** while the name was being typed, the Save button stood half outside the room's panel.

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
