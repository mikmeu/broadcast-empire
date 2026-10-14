# Broadcast Empire: art style

How the game looks, and why. It is drawn from the designer's reference pictures and notes, which were in `design/reference/` until version 0.8.0 and are still in the history (`git show phase-13g:design/reference/notes.md`). The tokens that carry it out are at the top of [src/ui/styles.css](../src/ui/styles.css); change a value there and every screen follows.

Status: applied to every 2D screen in Phase 5e, waiting for the designer's approval.

## The idea

An evening in the city. The title art shows a coral broadcasting house under a purple sky, with a navy skyline and a yellow neon sign. The interface is what hangs in front of that scene: white windows with tinted title bars, chunky cards that stand on a darker edge, and large toy-like icons with a shadow on the ground. Everything is flat color; nothing has a gradient except the sky.

## Color

| Token | Value | Used for |
|---|---|---|
| `--ink` | `#452a65` Darkpurple | Text, small icons, walls in the office |
| `--purple` | `#6631d2` Purple | The accent: primary buttons, the active state, links, the player's line in charts |
| `--purple-deep` | `#3c199b` | The edge under purple things (from the icons) |
| `--lavender` | `#b0a2f2` | The edge under white things, locked cards, the close button (from the icons) |
| `--lilac` | `#e5dcff` Lightpurple | Rules, borders, the shadow under icons |
| `--mist` | `#f7f5ff` | Title bars and sunken areas (from the icons) |
| `--green` / `--green-deep` | `#00b17a` / `#127554` | Good: fills and marks in the light shade, text and pills in the dark one |
| `--red` / `--red-deep` | `#ff7979` / `#aa4949` | Bad: fills and marks in the light shade, text in the dark one |
| `--yellow` / `--orange` | `#fcee21` / `#fbb03b` | The neon sign: the logo, highlights, warnings, the "Get on the air" billboard |
| `--navy` | `#0b2a4f` | The skyline: the news ticker and the edge under controls in the sky |

- The page behind the windows is a pale purple (`#e9e2ff`), a little lighter than Lightpurple so the windows' shadows read.
- Red and green come in two shades on purpose. The light shade is too faint for small text on white, so text uses the dark shade and shapes use the light one.
- **Dark theme** is the same scene later at night: near-black purple page, deep purple windows, lilac text, a lighter purple accent (`#9470f7`) so it still reads. It follows the player's system setting.
- Channel logo colors and the eight sponsor logos are content, not theme: they keep their own colors in both themes.

## Type

- **Headings: Fjalla One.** Window titles, section heads, big numbers, tab labels, table column heads. Small labels are set in capitals with a little letter-spacing.
- **Text: Assistant.** Running text is Extra Light (200) at 16px, as specified. Text smaller than that, numbers, and labels use Regular (400), because Extra Light breaks up below about 15px; emphasis uses SemiBold (600).
- Numbers that line up in columns use tabular figures. There is no monospace font.

## Shape

- **Windows** (every panel): square corners, a `--mist` title bar with a 4px `--lilac` line under it, a white body, a 4px line at the bottom, and a hard shadow offset 6px down and right. No blur anywhere.
- **Cards and buttons** stand on an edge: a 4px radius, a flat face, and a darker strip underneath (3px for buttons, 5–6px for cards). Pressing a button pushes it down onto its edge. White things stand on lavender, purple on deep purple, green on dark green.
- **Rules**, not boxes, separate rows: 3px lines in `--mist`, or `--lilac` under a heading. A total sits on a dark "sum line" with a small plus at its end, as in the Finances window.
- **Pills** are fully round and used only for states and tags ("researched", "On track", "Radio").
- **Meters** are five blocks, like the rating rows in the Info window.
- **Focus** is a 3px orange outline, visible on every surface.

## Icons

All icons are files in [src/assets/icons](../src/assets/icons), inlined by `src/ui/Icon.tsx` so that ink-colored parts and the ground shadow follow the theme.

- **Large icons** (the navigation): flat shapes about 30px tall, a darker copy offset 3.2 units upward to give thickness, and a lilac ellipse underneath as a shadow. Purple, lavender, white, yellow/orange and coral only.
- **Small icons** (the status bar, buttons): one color, solid, no outline.
- Supplied by the designer and used unchanged: calendar, channel, close-button, construction-helmet, contract, dollar-sign, downward-trend, edit, finance, happy-face, listeners, locked, move, open-window, people, policy, quality, research, sad-face, upward-trend.
- Drawn to match, because this game has screens the earlier one didn't: shows (microphone), schedule, content (film reel), marketing (megaphone), ratings, milestones (trophy), settings, wiki (an open book), and the small euro, viewers, rank and check marks.

| Screen | Icon | Screen | Icon |
|---|---|---|---|
| Office | construction-helmet | Sales | contract |
| Staff | people | Marketing | marketing |
| Channels | channel | Research | research |
| Licenses | policy | Ratings | ratings |
| Shows | shows | Finance | finance |
| Schedule | schedule | Milestones | milestones |
| Content | content | Settings | settings |
| Wiki | wiki | | |

## The frame

The office is the game's main view and is always on screen (Phase 6). There is no top bar: the evening sky from the title art left the game screen and comes back on the main menu (Phase 7). From top to bottom:

- The **stage**: the office in 3D, filling everything that is left. A **menu** of large icons runs down its left side. Floors and rooms are picked at the top left. The **settings cog** floats in the top right corner, large, on a white tile; saving, loading and starting a new game are in its window. The selected room or person shows on the right under the cog, and the view controls sit under the office.
- The white **bottom bar**, fixed to the bottom of the screen. From left to right: the date and, behind a thin line, the time at the office, with the day filling up along their lower edge; the speed controls, the small icon-and-value fields, and in the right corner the **news ticker** as a navy strip that takes the room that is left. What is on now scrolls along with the headlines as yellow pills. On a narrow screen the bar wraps into rows.

**Windows** open above the office, one per menu item: a purple title bar to drag them by, a close button, and a body on the page background that scrolls. Several can be open; the one last touched is in front. "On air" holds channels, shows, schedule, content and ratings as sections. On a phone a window fills the stage. The **Get on the air** checklist is a yellow window that folds up to its title bar.

**Not open yet**: a window the company has not reached stays in the menu at less than half strength with a small lock in a white circle at its corner. A locked tab is dimmed with a lock before its label. Where a panel would be, a line of muted text with the lock says which milestone opens it. Nothing that is locked is hidden, except the jobs in the hiring pool.

**News about one window** (a new sponsor offer, a campaign that has ended) is a white pop-up with a red edge at the top of the stage, under the row of room buttons: the window's icon, one line, a purple button that opens the window and a close button. It leaves by itself. The window's menu icon carries a **red dot** until the window is opened. The same dot, smaller, marks a tab inside a window.

## The home screen

The game opens on the designer's title art, redrawn in [src/ui/TitleArt.tsx](../src/ui/TitleArt.tsx): the purple evening sky, lavender clouds and a cloud bank, diamond stars, the navy skyline with yellow windows, and the coral studio building with its mast and yellow lamp. A few large, faint yellow circles are lights out of focus. It looks the same in both color schemes, like the sky did.

- The **logo** is a neon sign: Fjalla One in yellow with an orange edge underneath, "Empire" widely spaced.
- The **menu** is a column of large buttons in Fjalla One, each on a navy edge. The first is the purple primary button (Continue, or Back to the game) with a second line in small text. The open item turns yellow.
- What a menu item opens stands beside it as a **window** on the surface color with a navy hard shadow.
- **New game** is the widest of those windows and has two steps, named in pills at its top with the one at hand in purple. Step 1: the character creator on the left, your name on the right. Step 2, "Your headquarters": on the right the place itself, a live picture of the office and the town of the region between two arrow buttons, with the region's name on a white label in its corner and its facts under it; on the left the company's name, a small map of Etheria and the difficulty. The button to go on, or to start, is under both.
- The **application icon** ([build/icon.svg](../build/icon.svg)) is the same scene in a rounded square: the mast with its lamp over the building.

### The character creator

The first step of a new game, and a strip in Settings. The character stands in a sunken picture on the left with arrows under it to go through the characters; on the right are three rows of round color swatches, for skin, hair and clothes. The chosen swatch has a dark edge and a yellow ring. The colors are the kit's own swatches (`src/config/looks.ts`), not theme tokens: they are what the character is painted with, in light and in dark.

## Color scheme

Light is the design; dark is derived from it. The player picks "same as the system", light or dark in Settings. The game writes the scheme in use on the page as `data-theme`, and the dark values in `styles.css` hang on that alone.

## Screens with their own layout

- **Research** is a tree: one column per decade, cards joined by a line. Green is researched, purple can be researched now, pale lavender with a lock opens later.
- **Finance** shows monthly reports as columns side by side, newest on the right in full ink and older months paler, each with income, running costs, the running profit or loss in large type, what was bought and spent besides, and the month after all of it. An arrow shows whether an amount rose or fell against the month before; its color shows whether that is good.
- **Licenses** uses the designer's districts map with its own colors. The outlines are in `src/config/map.ts`, unchanged from the SVG.
- **Sales** shows each sponsor's logo next to its offers and contracts.
- **The schedule** has no dropdowns. Shows are pills in a tray above the five slots: a pill is dragged into a slot, or pressed (it turns purple) and then put in a slot with the button that appears there.
- **Tabs with a number** split a long list: the team by kind of staff, the shows by channel. A tab with something that needs the player carries the red dot.

## The office in 3D

Built in Phases 5f and 5g with Kenney's Furniture Kit, Mini Characters, City Kit (Commercial) and Train Kit. What each thing is made of is listed in [src/office/assets.ts](../src/office/assets.ts).

- **Models** look like the large icons: low-poly, flat-shaded, no textures, no outlines. The kit's materials are replaced by theme tokens (`--o3-*`): wood becomes lavender, fabric coral, metal mist or ink, lamps and sliders yellow. Characters keep their own colors.
- **Studio equipment** is built from simple shapes after the designer's reference photos: the shape of the real thing, in the palette's colors.
- **Rooms** have their own tints (mint office, coral radio studio, blue talk studio, violet TV studio, yellow library) on a lavender slab. Walls are ink and cut low; the two outer walls furthest from the camera stand tall in pale lavender, whichever way the view is turned. A selected room or piece of furniture is marked in orange.
- **Light** comes from the upper left, soft, with one hard-edged shadow. No bloom, no gradients, no tone mapping: a surface facing the light shows its token color.
- **Labels** on the view are small windows: white, with the lilac line underneath.
- **The town** around the office uses Kenney's City Kit (Commercial), tinted lavender by day and dark purple at night so it stays behind the office. Floor 1 stands at street level; the floors under floors 2 and 3 are drawn like the kit's buildings (pale walls, blue windows, a dark band per storey, the kit's awnings). Streets are dark purple, pavements lavender, cars are simple shapes in the accent colors.
- **A block in town is built up**: terraces of kit buildings wall to wall along the streets, fronts to the pavement, back to back where the block is deep enough; a tower, a large hall or a house with a garden has the block to itself.
- **Each region has its own surroundings** (`src/office/sites.ts`): the Commercial kit in Coaxia, the Industrial kit in Transponder Valley, the Suburban kit in Amplify Hills and Aerial Fields, and both by the sea in Skywave Beach. All get the same tint. Open land is flat color: grass, sand, water and field (`--o3-grass`, `--o3-sand`, `--o3-water`, `--o3-field`), with fields striped in grass and hills as low green domes. Where the town lies by water, a shore runs along the last street (sand, or grass with trees) and each side street ends in a covered car park: white walls, a dark flat roof and a white P on an accent board.
- **The railway** in front of the office uses Kenney's Train Kit with the same tint. The train is the kit's yellow double-decker, a Dutch one, in every year.
- **Portraits** of people are pictures of their 3D character on the mist background, in a small square frame standing on a lavender edge.
- **Drawing a room**: the floor that can be built on gets a faint green wash. The room being drawn is a see-through sheet with low walls, green where it can be built and red where it can't, with a label over it that gives its size and, in red, the reason. The door is a yellow dot in the wall; a paler dot follows the pointer along the walls. The panel on the right has the kinds of room as a grid of buttons, three across, each with a small picture (56 by 42, from `src/assets/rooms`, drawn from the catalog's own pictures on a clear ground) over its name, then the numbered steps, the − and + buttons for the four walls, and the cost beside the button that builds. Open floor is the corridor color everywhere. The building's own outer walls are low at the front of the view and tall at the back.
- **Life in the office** follows the clock beside the date, where a month is one day from 8 am to 10 pm. Everything that moves runs on the game's time: paused, the cars, the train and the people stand still; run faster, they hurry. People keep hours: most are in from 9 to 5, hosts around their shows; they come on foot, by bus or by taxi, walk in through the entrance and go home the same way, and others are out for a walk on the pavements. Inside, people find their own way across the floor: through the middle of a doorway, clear of the walls, straight across open floor and around furniture where there is room; they only cross furniture when it leaves no other way. Through the day hosts are in a studio only while their show is on, half the office goes to lunch in the canteen, and people slip out through the dark door marked WC at the end of the corridor. A studio that is on the air has a red pill under its label, a lit on-air light and lit camera lamps; off the air those are dark.
- **The reception block** stands at the head of every floor, west of the corridor. The stairs (grey steps) and the two lifts (low cabins with a yellow lamp) are in the two corners at the front, on every floor. On the ground floor the glass entrance doors are between them, in line with the corridor, with the hall behind in a warm cream floor (`--fp-reception`) and the technicians' and cleaners' rooms (a workbench, a cleaning cart) behind the stairs and the lifts. The floors above have a hallway between stairs and lifts and open floor behind them. **The building** is one of two: three floors of seven rooms in the towns, or two longer floors of ten rooms in Amplify Hills and Aerial Fields, where its block in town is one block wider and the view starts a little further out so that it fits. Small spaced capitals on the floor name each part, like the corridor.
- **Toilets** have a pale blue floor (`--fp-toilets`); each toilet stands in a stall of three grey panels, open to the front.
- **Equipment looks its age.** The mixing desk, the TV camera, the control desk and the server rack have a model for every tier, built after photos: each keeps the footprint and the palette, and changes shape and color with the decade.
- **The furniture catalog** is a window with a tab for each kind of room, the pieces down the left and the chosen one in full on the right: a turning picture of it on a sunk panel, then what it is for and a list of facts. It folds up to its title bar while a piece from it is being placed. Rooms a piece can go in get a light green tint.
- **Control rooms** have a cool grey floor (`--fp-control`), apart from the warm colors of the studios.
- **Placing furniture** shows the piece itself, see-through, in green where it fits and red where it doesn't, on a plate of the same color. A yellow bar at the foot of the office names the piece; keys are drawn as small keycaps. A piece that is being moved looks the same and is left out where it stood. The floor in front of a door, where nothing may stand, is marked red for as long as a piece is on the pointer; when the piece can't go where it is, the yellow bar says why.
- **Workplaces** in the panel of an office are a list of rows with a rule between them: a small numbered button, the name in strong with the job muted after it, and one small button at the end (“Give to…”, or “Change” once the place is somebody's). The list of people that opens under a row is a sunk box of full-width buttons with a small portrait each, no taller than about seven of them; it scrolls inside itself. A room's label in the office gets one more line for how many places are taken.
- **The window of a piece** is the one small panel that is drawn in the office itself, above the piece that was clicked: white with an accent edge and the hard shadow of every panel, 21 rem wide. It holds the name, the condition if the piece wears, one muted line on what it is worth, and a row of four buttons with the one that undoes it (“Cancel”) as a link at the end. It never covers the bar at the top or the room's panel; on a narrow screen it sits at the top in the middle.
- **Traffic** is a small simulation (`src/office/traffic.ts`): every vehicle has its own speed and comes into town at its own moment, brakes for the one in front and gives way at crossings, so no two ever touch. Cars, vans and trucks take a body color from the palette; yellow is kept for taxis, which carry a sign on the roof. The bus is white above a blue skirt with a band of dark windows, after its reference photo, and stands at the stop in front of the office at a quarter to every hour of the clock. All are drawn from simple shapes. There is no road under the railway but a paved strip with the pillars on it.
- **The view** can be zoomed (between a view of the town and a close-up of a few desks), turned in quarter turns and moved a little, with the keys or by dragging it. From the three turned sides, town buildings that would stand in front of the office are left out.

## Sound

Short and dry, like the flat shapes: clicks from Kenney's UI Audio, knocks from Impact Sounds, and for the few moments that matter a jingle of a second on plucked strings from Music Jingles. Which clip plays for what is in [src/audio/sounds.ts](../src/audio/sounds.ts).

- **Controls** each have one sound by kind: an ordinary button, the main button of a panel, a tab, a checkbox, a changed list or slider, a window opening, something closing. Nothing sounds on hover.
- **A refusal** is one low clip, in place of the button's click.
- **Furniture** sounds like what it is made of when it is put down: wood or metal, light or heavy, from five takes. Turning and selling have their own.
- **Jingles** are for a new company, a milestone, good news, bad news, news from the country and bankruptcy: one at a time, never for routine news, and always the one that fits the message on screen.
- Interface sounds are quieter than furniture; nothing is louder than a knock on a desk.

## The tutorial

- **Two people from outside the office.** Uncle Tabby and Penny Cash are taller, less blocky models than the staff (`src/office/StoryFigure.tsx`). They only appear beside what they say, never in the office.
- **The welcome is a conversation in front of the game:** a white card on the scrim, the speaker standing at its left, one short paragraph at a time, one primary button.
- **Penny's window is the yellow of a note stuck on the screen** (`--highlight`, title bar `--highlight-deep`), above every other window. It holds her from the waist up, what she says, the clicks that do it on a paler patch (`--guide-note`), and at most two buttons.
- **The ring** around the control to click is the accent color with a yellow halo that breathes. It never takes a click, and with motion reduced it stands still.
- **Her voice:** dry, short sentences, one joke per line at most. She says what to do and why it pays; she never says "simply" or "just".

## The wiki

- **Set like an encyclopedia:** a contents list on the left, the article on the right at a reading width of about 78 characters, a title with a rule under it, a one-line summary in italics, and a box of facts floated to the right of the lead.
- **Links are the accent color, underlined,** in the wiki and nowhere else in the game; everything else that can be clicked is a button.
- **Tips** have a bar of `--highlight-deep` on the left and the word TIP in the display face. Description stays out of them, and advice stays in them or in the articles under "How to do well".
- **The help icon** is a question mark in a 20px circle beside a panel's title. One per panel at most.
- **The voice** is the plain one of the rest of the game: what a thing is, what it costs, what it does. No jokes; those are Penny's.

## Rules for new work

1. Use a token for every color, font, weight and radius. If none fits, add one at the top of `styles.css` with a light and a dark value.
2. A new panel is a window; a new thing to click stands on an edge; a new state is a pill.
3. A new icon is an SVG file in `src/assets/icons`, in one of the two styles above.
