# Broadcast Empire

A tycoon game about building a radio and TV company from 1970 onward. It runs in a browser and as a desktop app for Mac, Windows and Linux. This is **Alpha 0.10.0**, a build for playtesting.

| File | What it is |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | What is in each version |
| [REQUESTS.md](REQUESTS.md) | What is still wanted, by priority, and where playtest notes go |
| [Decisions.md](Decisions.md) | How the game is put together, and why, where that goes beyond the brief |
| [prompt.md](prompt.md) | The design brief, and the roadmap of Phases 0 to 14 the game was built by |

## Installing the alpha

The installers are in `release/` after `npm run dist:mac`, `dist:win` or `dist:linux`. None of them is signed, so each system asks before it runs the game.

| System | File | To open it |
|---|---|---|
| Mac (Apple silicon and Intel) | `Broadcast Empire-0.10.0-universal.dmg` | Open the .dmg and drag the game to Applications. If macOS says the app is damaged or from an unidentified developer, run `xattr -cr "/Applications/Broadcast Empire.app"` in Terminal once, then open it. |
| Windows (64-bit) | `Broadcast Empire Setup 0.10.0.exe` | Run it. When SmartScreen warns, choose "More info" and then "Run anyway". |
| Linux, Debian and Ubuntu (64-bit) | `broadcast-empire_0.10.0_amd64.deb` | Open it with the software installer, or run `sudo apt install ./broadcast-empire_0.10.0_amd64.deb`. The game is then in the applications menu. Build it on Linux: on a Mac, electron-builder may fail to make a .deb, and the release workflow builds it anyway. |
| Linux (64-bit) | `Broadcast Empire-0.10.0.AppImage` | Make it executable (`chmod +x`) and run it. Some systems need `libfuse2` for an AppImage, or the flag `--no-sandbox`. |

The build is named on the home screen and at the bottom of Settings. Quote it with a playtest note.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the game at http://localhost:5173 |
| `npm test` | Run the simulation unit tests |
| `npm run coverage` | Run the tests with a coverage report (open `coverage/index.html` for line-by-line detail) |
| `npm run typecheck` | Type-check everything |
| `npm run simulate -- --bot growth --years 10 --yearly` | A bot plays N years headless and prints results, including market position (balance check). Bots: `sensible` (one channel in the Capital), `capital` (the same channel run well: sponsors, a production manager, a researcher), `neglectful`, `growth` (expands, sponsors, second channel), `nosupport` (like growth, but never hires cleaners, technicians or maintenance staff), `tv` (grows radio, then launches a TV channel and bids on TV licenses), `research` (like growth, but researches every tech as early as it can). Add `--seed N` to vary the game and `--difficulty easy|normal|hard` to change how strong the rivals are |
| `npm run town-maps` | Read the town drawings in `design/towns/*.svg` and write `src/config/townMaps.ts`; it reports edges that are off the 10 px grid |
| `npm run build` | Production build into `dist/` |
| `npm run desktop` | Build the game and open it as a desktop app (Electron) |
| `npm run desktop:dev` | Open the desktop app on the running `npm run dev` server, for working on it |
| `npm run dist:mac` · `dist:win` · `dist:linux` | Build the game and make an installer in `release/`: a .dmg, a setup .exe, or on Linux a .deb and an AppImage. Unsigned; see "Installing the alpha" above |
| `npm run website` | Build the game's website into `website/dist`; see "The website" below |

**Controls:** Space pauses and resumes; 1, 2 and 3 pick normal, fast and fastest speed. In the office, dragging or W, A, S and D move the view (two fingers move and zoom it on a touch screen; while a room is being drawn, drag with the right or middle button), Q and E turn it, + and − (or the mouse wheel) zoom, 0 puts it back, and R turns a piece of furniture. Escape closes the window in front. Ctrl+Alt+C opens the cheat console for testing (`money 50000`, `year 2000`, `help` for the rest). Ctrl+S (Cmd+S on a Mac) saves.

**Saves.** The game opens on a home screen: continue the newest save, load or delete any save, start a new game (first your character and your name, then the headquarters: a region picked from a live preview of each, the company's name and the difficulty), or change the settings. Saves have names; the autosave is kept apart and is written at the start of every month, and in the desktop app also when you quit. In a browser, saves live in that browser (IndexedDB). In the desktop app each save is a JSON file in the system's folder for the game:

| System | Save files |
|---|---|
| Mac | `~/Library/Application Support/Broadcast Empire/saves` |
| Windows | `%APPDATA%\Broadcast Empire\saves` |
| Linux | `~/.config/Broadcast Empire/saves` |

Settings on the home screen shows the folder and opens it.

## Releasing a version

The pipeline does this for a bundle of issues (see [PIPELINE.md](PIPELINE.md)); by hand it goes:

1. Move the requests that are done from [REQUESTS.md](REQUESTS.md) to a new section at the top of [CHANGELOG.md](CHANGELOG.md).
2. Set the version in `package.json` (and the two lines at the top of `package-lock.json`). The game reads it from there.
3. `npm test`, then `npm run dist:mac`, `npm run dist:win` and `npm run dist:linux`.
4. Commit on `main`.
5. Push `main` and put the installers on GitHub as the release of the version (see "The website" below); the release makes the tag.

## The website

The site people download the game from, at https://broadcastempire.online: a home page, Download, Media, Changelog and feature requests, and Thank you. `npm run website` writes it to `website/dist` as plain HTML, with a `sitemap.xml` and a `robots.txt`. To look at it first: `npx vite preview --outDir website/dist`.

It is hosted on GitHub Pages from the public repository https://github.com/mikmeu/broadcast-empire: the workflow `.github/workflows/website.yml` builds and publishes it on every push to `main`. The installers are not in the repository but attached to the GitHub release of their version (`v0.10.0` and so on), and the Download page links to them there, with the sizes GitHub gives. Publishing a version, after step 4 above:

```sh
git push
gh release create v0.11.0 --target main --title "Alpha 0.11.0" --notes "See https://broadcastempire.online/changelog/" \
  "release/Broadcast Empire-0.11.0-universal.dmg" "release/Broadcast Empire Setup 0.11.0.exe" "release/Broadcast Empire-0.11.0.AppImage" "release/broadcast-empire_0.11.0_amd64.deb"
git fetch --tags
gh workflow run website.yml
```

The last line builds the site again once the installers are up, so the Download page has their links and sizes. Until a version has its release, its download buttons lead nowhere: `npm run website` warns about it.

The public repository starts at version 0.10.0 with one commit. The history before it (the `phase-*` and `release-*` branches, the `website` branch, and the old tags under `refs/history/tags/`) is only on this Mac and stays private: `git push` here sends `main` and nothing else, so never push those branches by name or with `--all`.

| File | What it is |
|---|---|
| `website/site.json` | The site's address, where the installers are (`downloads`: the GitHub release of the version, or a folder of the site), and for every page its address, title and description |
| `website/layout.html` | The frame around every page: the head with its tags for search engines, the menu, the foot |
| `website/pages/` | The text of each page. `{{version}}`, `{{mac.url}}` and the like are filled in when the site is built |
| `website/assets/site.css` | The look, with the game's own colors and typefaces |
| `website/media/` | The screenshots and, later, videos (.mp4 or .webm) of the Media page. Every file in the folder is shown; `media.json` gives the order, a title and a caption, and a file it does not name comes after the others under its file name |

The version number and the names of the installers come from `package.json`, the changelog from [CHANGELOG.md](CHANGELOG.md) (without the request numbers) and the art in the sky from the game's home screen (`src/ui/TitleArt.tsx`).

## Layout

| Folder | Contents |
|---|---|
| `src/config/` | All balance numbers and game data (`events.ts` holds the calendar of sports events and recessions and the rules for elections; `map.ts` the outlines of Etheria's regions; `guide.ts` every line of the tutorial) |
| `src/sim/` | Pure, deterministic simulation: `tick` advances one day, `actions.ts` lists every player command (they live by theme in `commands/`), `broadcast.ts` the ratings model, `auctions.ts` the license auctions and renewal rounds, `ownEvents.ts` the events the player stages, `content.ts` the TV content market and library, `tech.ts` research and equipment tiers, `upkeep.ts` the living office (cleanliness, equipment condition, building faults, morale, support staff), `events.ts` sports events, elections, recessions and the news ticker, `politics.ts` the presidents and snap elections, `poaching.ts` host poaching, `milestones.ts` the milestones, `bots.ts` the test players |
| `src/office/` | The office view: `Office3D.tsx` (isometric 3D, with zoom, quarter turns and WASD; its parts are in `scene/`: floor, rooms, people, town, street life, cables and previews), `assets.ts` (the asset registry: which model and colors each thing uses), `layout.ts` (where everyone is) and `city.ts` (the town around the office) |
| `src/assets/` | Icons (SVG), sponsor logos and staff portraits (drawn from the 3D characters by `scripts/avatars.html`) |
| `public/models/` | 3D models: Kenney's Furniture Kit, Mini Characters, City Kit (Commercial) and Train Kit (CC0, kenney.nl) |
| `design/voice-over.md` | The script for the tutorial's voice-over: every line Uncle Tabby and Penny Cash say. Written by `npm run voice-over` |
| `public/models/story/` | Uncle Tabby and Penny Cash in 3D: Quaternius's Animated Man and Animated Woman (CC0, quaternius.com) |
| `public/sounds/` | Sound clips: the ones the game uses from Kenney's UI Audio, Impact Sounds and Music Jingles (CC0, kenney.nl) |
| `src/audio/` | Sound: `sounds.ts` (which clip plays for what), `jingles.ts` (which jingle a day of the game deserves), `player.ts` (plays them, and gives every control on the page its sound) and `voice.ts` (says the tutorial's lines) |
| `public/voice/` | The voices of the tutorial: one mp3 per line, named after the line |
| `design/` | The art style guide (`style.md`) and the voice-over script |
| `src/persistence/` | Saves (`storage.ts`: named slots, in IndexedDB in a browser and as files in the desktop app), the player's settings in local storage, and `desktop.ts`, the interface to the desktop app |
| `electron/` | The desktop app: `main.cjs` (the window, the save files, the menu) and `preload.cjs` (what the game's page may ask of it) |
| `build/` | The application icon |
| `src/wiki/` | The wiki: its articles (`game.ts`, `tips.ts`, `lore.ts`), written as text with the game's own figures filled in, and how to find one (`articles.ts`) |
| `src/ui/` | React screens, the tutorial (`Guide.tsx`), game store (`store.ts`), what is selected and being placed in the office (`officeView.ts`), real-time loop |
| `src/version.ts` | Which build this is; the number comes from `package.json` |
| `scripts/` | Headless tools |
| `website/` | The game's website; see "The website" above |
