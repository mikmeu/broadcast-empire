# Broadcast Empire: Game Design & Build Brief

## How to use this document (instructions for the builder)

You are building a browser-based tycoon game from this brief.

- **Build one phase at a time** (see [Roadmap](#14-roadmap)). Finish a phase, check it against its acceptance criteria, then stop and summarize what was built before you start the next one.
- **Keep the simulation separate from rendering.** The simulation is pure TypeScript with no React or Three.js imports.
- **Put every balance number in one config file** (`src/config/balance.ts`). The numbers in this document are starting values for tuning, not final values.
- **Write unit tests for the simulation formulas** (section 7).
- **Don't invent major systems** that aren't described here. If something is unclear, follow the "keep it simple" option and list the question in your phase summary.

---

## 1. Pitch

You are the CEO of a media company, starting in **1970** with almost nothing. You rent office space, furnish it, hire staff and hosts, create radio (and later TV) channels, and plan their daily schedules. You compete for audiences with four rival broadcasters. Over five decades, technology changes from typewriters and AM radio to computers, satellites and streaming. R&D lets you adopt new technology before your rivals do.

Reference games: *Mad TV* (1991) and its open-source remake *TVTower* for the scheduling and economy, and *Two Point Hospital* for the office-building feel.

## 2. Core loop & time

**Core loop:**
Plan the schedule → broadcast → ratings come in → money, RP and staff XP → hire, build, research, market → adjust the schedule.

**Time:**
- The game runs in real time with speeds **Pause / 1× / 2× / 4×**.
- **1 in-game day ≈ 4 seconds at 1×**, so 1 year ≈ 24 minutes and 1970–2030 ≈ 24 hours of play.
- Each day has **5 time slots**: Morning, Lunch, Afternoon, Evening, Late night.
- The schedule is **daily**: a channel's schedule repeats every day until the player changes it.
- **Monthly** (on the 1st): salaries, rent, license fees and loan payments are charged, the hiring pool refreshes, and a financial report is generated.
- **Weekly**: ratings report.
- Use a real calendar starting **1 January 1970**.

**Start and end:**
- Starting money: **€150,000**, with one small empty floor available to rent.
- **Bankruptcy:** if money is below €0 at three consecutive month-ends, the game is over (show warnings from the first month).
- **No hard win condition** (sandbox until 2030). Milestones give a sense of progress, for example "First profitable month", "#1 radio channel in a region", "Market leader in all regions", "First TV channel".

## 3. Tech stack & architecture

| Concern | Choice |
|---|---|
| Language | TypeScript (strict) |
| Build | Vite |
| UI (menus, schedules, reports) | React |
| UI state | Zustand |
| Office view | React Three Fiber + drei, fixed isometric orthographic camera |
| Charts | Recharts |
| Saves | IndexedDB (via `idb-keyval`), versioned save schema, autosave monthly |
| Tests | Vitest |

**Architecture rules:**
- `src/sim/`: pure simulation. Its main entry point is `tick(state): state`, which advances one day. It must be deterministic and use a **seeded RNG** whose state is stored in the game state (and so in the save).
- `src/config/`: balance numbers, genre definitions, tech tree, audiences, regions.
- `src/ui/`: React screens. They read state and dispatch player actions (`hireStaff`, `scheduleShow`, …) to the sim.
- `src/office/`: the 3D office view only.
- `scripts/simulate.ts`: a **headless balance check**. A simple bot plays 10 in-game years and prints yearly money, listeners and market share, so the economy can be tuned without playing by hand.

## 4. World

### 4.1 Regions

The country is the fictional **Etheria** and has 5 regions; see [lore.md](lore.md) for their character. Population grows every year. Each region has three main audiences, which become part of the simulation in Phase 5c.

| Region | Was called | Population 1970 | Growth / year | Main audiences |
|---|---|---|---|---|
| Coaxia | Capital | 2,500,000 | 1.5% | Teens, Students, Professionals |
| Transponder Valley | Industrial North | 1,800,000 | 0.5% | Workers, Professionals, Students |
| Skywave Beach | Coast | 1,200,000 | 1.2% | Professionals, Families, Seniors |
| Aerial Fields | Heartland | 800,000 | 0.3% | Teens, Workers, Families |
| Amplify Hills | Highlands | 500,000 | 0.8% | Families, Seniors, Workers |

The code keeps the old names as internal ids (`capital`, `north`, `coast`, `heartland`, `highlands`).

### 4.2 Audiences

The population of each region is split into **6 audience segments** that add up to 100%. Segment shares shift slowly over the decades (for example, Seniors grow).

| Audience | Share 1970 | Sponsor value | Description |
|---|---|---|---|
| Teens | 12% | 0.8× | Music, trends, late nights |
| Students | 8% | 0.7× | Young adults, music, culture |
| Families | 25% | 1.2× | Parents with children, entertainment |
| Workers | 25% | 1.0× | Mainstream adults, sports, music, entertainment |
| Professionals | 12% | 1.5× | Highbrow, news, documentaries, classical |
| Seniors | 18% | 0.9× | News, talk, drama, soaps |

### 4.3 Who is tuned in per slot (share of each audience listening/watching)

**Radio**

| Audience | Morning | Lunch | Afternoon | Evening | Late night |
|---|---|---|---|---|---|
| Teens | 0.15 | 0.05 | 0.25 | 0.20 | 0.20 |
| Students | 0.15 | 0.10 | 0.15 | 0.20 | 0.30 |
| Families | 0.35 | 0.15 | 0.15 | 0.15 | 0.05 |
| Workers | 0.45 | 0.25 | 0.30 | 0.10 | 0.05 |
| Professionals | 0.40 | 0.10 | 0.20 | 0.10 | 0.05 |
| Seniors | 0.35 | 0.30 | 0.25 | 0.15 | 0.05 |

**TV**

| Audience | Morning | Lunch | Afternoon | Evening | Late night |
|---|---|---|---|---|---|
| Teens | 0.05 | 0.05 | 0.30 | 0.45 | 0.25 |
| Students | 0.05 | 0.10 | 0.20 | 0.40 | 0.35 |
| Families | 0.10 | 0.05 | 0.25 | 0.60 | 0.10 |
| Workers | 0.05 | 0.05 | 0.10 | 0.60 | 0.20 |
| Professionals | 0.05 | 0.05 | 0.05 | 0.50 | 0.20 |
| Seniors | 0.15 | 0.20 | 0.30 | 0.55 | 0.10 |

## 5. The company

### 5.1 Office

- The player rents **rooms** in an office building. Floors are **pre-divided into rooms** of different sizes; the player does not draw walls. Rent is charged per room per month, based on room size.
- A rented room gets a **type**, and the player places furniture on its tile grid.
- More floors become available to rent as the company grows (based on company value).

**Room types:**

| Room | Purpose | Required furniture |
|---|---|---|
| Department office | Workstations for Production, Marketing, Sales, R&D staff | Workstations |
| Manager office | One manager each | Workstation |
| Radio studio | Music, morning show, drama | Mixing desk, microphones, on-air light |
| Radio talk studio | News, talk, sports commentary | Mixing desk, microphones, table, on-air light |
| TV talk show studio | Talk shows, game shows | Cameras, lights, set, control desk |
| TV news studio | News, sports | Cameras, lights, news desk, control desk |
| TV production studio | Sitcoms, soaps, kids, reality | Cameras, lights, set, control desk |
| Library | Stores licensed content (movies, series, …) | Shelving (later: servers) |
| Canteen (Phase 4) | Improves morale | Tables, coffee machine |

**Workstation** = desk + chair + typewriter/computer + phone. A staff member without a complete workstation produces **nothing**.

**One studio can host one show per time slot.** Two channels can't use the same studio in the same slot.

### 5.2 Staff

All staff have: name, **skill** (1–100), **salary**, **XP**, **morale** (0–100), department.

- **XP:** staff earn XP every working day. Each level raises skill by a few points, and the staff member asks for a higher salary after leveling up.
- **Hiring:** a candidate pool refreshes monthly. Higher skill costs more salary.
- **Firing:** costs one month's salary as severance.

**Hosts** are a special kind of staff:
- **Skill** (1–100): how well they present.
- **Fame** (0–100): how well-known they are. Fame rises when their shows have high listener numbers and slowly decays otherwise.
- **Genre specialties** (1–2 genres): their skill counts fully in those genres and at 70% in other genres.
- A host can present at most 2 shows per day.

### 5.3 Departments

| Department | Output | How it works |
|---|---|---|
| **Production** | Production quality of shows | Production staff are assigned to shows. See `ProductionSkill` in section 7. |
| **Marketing** | Marketing campaigns | Staff generate marketing capacity. The player runs campaigns (target: a channel or show + an audience, with a budget and duration). This raises `Promotion`, which decays after the campaign ends. |
| **Sales** | Sponsor offers | More and better sales staff mean more offers and higher rates. See section 8. |
| **R&D** | Research points (RP) | RP per day = sum of researcher skill / 100. RP is spent on the tech tree (section 10). |
| **Management** | Team bonus | Each department can have **one manager**: +up to 20% effective skill for up to 8 team members (scaled by manager skill). |

**Channel manager:** every channel **needs** one to broadcast. Their skill speeds up channel reputation growth. If a slot is empty, the channel manager automatically fills it with a rerun (low appeal).

### 5.4 Support staff (Phase 4)

Support staff are **assigned automatically**. They walk to the worst room or item without player micromanagement.

- **Cleaner:** each room has **cleanliness** (0–100), which drops with use. Low cleanliness lowers staff morale and output.
- **Technician** (renamed **IT technician** after the Personal Computer is researched): each workstation item and studio item has a **condition** (0–100), which decays over time. At 0 the item is **broken**. A broken workstation means that staff member produces nothing; broken studio equipment halves the studio level.
- **Maintenance:** repairs building issues (lighting, heating) that affect morale in a whole room.

## 6. Channels & shows

### 6.1 Channels

- A channel has a **name**, a **logo**, a **medium** (radio or TV), a **channel manager**, and one or more **regional licenses** (it broadcasts in every region it holds a license for).
- **Logo:** the player picks a shape, a color and initials (no image uploads needed).
- **Specialization:** derived automatically from the schedule. If 3 or more of the 5 slots belong to the same **genre group**, the channel gets that specialization (for example "News & Talk") and a **+10% appeal bonus** for those shows.
- Genre groups: Music, News & Talk, Entertainment, Fiction, Sports, Factual.

### 6.2 Shows

There are two kinds of content:

- **Produced shows:** the player creates them by choosing a name, genre, host, production staff and studio. A produced show needs a time slot on a channel and its studio must be free in that slot.
- **Licensed content** (movies, series, documentaries, music videos, teleshopping): bought from a **content market** as titles with a fixed number of airings. No host or production staff is needed, but it requires a Library. Each title has its own quality.

### 6.3 Genres

Audience fit: **H** = 1.0, **M** = 0.6, **L** = 0.25. "Staff" is the number of production staff needed for full production quality.

**Radio**

| Genre | Group | Type | Room | Staff | Unlock | Teens | Stud | Fam | Work | Prof | Sen |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Top 40 | Music | Produced | Radio studio | 1 | 1970 | H | H | M | M | L | L |
| Rock | Music | Produced | Radio studio | 1 | 1970 | H | H | L | M | L | L |
| Classical | Music | Produced | Radio studio | 1 | 1970 | L | L | L | L | H | H |
| Morning show | Entertainment | Produced | Radio studio | 2 | 1970 | M | M | H | H | M | M |
| Radio drama | Fiction | Produced | Radio studio | 3 | 1970 | L | L | M | M | M | H |
| Talk / call-in | News & Talk | Produced | Radio talk studio | 2 | 1970 | L | M | M | M | M | H |
| News | News & Talk | Produced | Radio talk studio | 3 | 1970 | L | M | M | M | H | H |
| Sports commentary | Sports | Produced | Radio talk studio | 2 | 1970 | M | M | M | H | M | M |
| Podcast-style talk | News & Talk | Produced | Radio talk studio | 1 | 2015 | M | H | M | M | H | L |

**TV**

| Genre | Group | Type | Room | Staff | Unlock | Teens | Stud | Fam | Work | Prof | Sen |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Movies | Fiction | Licensed | Library | – | 1970 | H | H | H | H | M | M |
| Series | Fiction | Licensed | Library | – | 1970 | M | H | H | H | M | M |
| Documentary | Factual | Licensed | Library | – | 1970 | L | M | M | L | H | H |
| Sitcom | Entertainment | Produced | TV production studio | 5 | 1970 | H | H | H | M | L | M |
| Soap opera | Fiction | Produced | TV production studio | 5 | 1970 | L | L | H | M | L | H |
| Kids | Entertainment | Produced | TV production studio | 3 | 1970 | M | L | H | L | L | L |
| Talk show | News & Talk | Produced | TV talk show studio | 3 | 1970 | L | M | M | M | H | M |
| Game show | Entertainment | Produced | TV talk show studio | 3 | 1970 | M | M | H | H | L | H |
| News | News & Talk | Produced | TV news studio | 4 | 1970 | L | L | M | M | H | H |
| Sports | Sports | Produced (needs broadcast rights) | TV news studio | 4 | 1970 | M | M | M | H | M | M |
| Music videos | Music | Licensed | Library | – | 1981 | H | H | L | L | L | L |
| Teleshopping | Factual | Licensed | Library | – | 1988 | L | L | L | M | L | M |
| Reality TV | Entertainment | Produced | TV production studio | 4 | 2000 | H | H | M | M | L | L |

Produced shows need a **host** (for fiction, the "host" is the lead actor). **Teleshopping** has a low quality cap (0.3) but pays a fixed daily fee instead of ad revenue.

## 7. Simulation model

All factors are on a 0–1 scale unless noted. Calculate per **show × region × audience × day**.

```
Reach(region, slot, audience)
    = RegionPopulation × AudienceShare × TunedIn[medium][audience][slot]

ProductionSkill(show)
    = avg(skill of assigned production staff, incl. manager bonus) / 100
      × min(1, assignedStaff / requiredStaff[genre])

StudioLevel(studio)
    = avg(tech tier of studio equipment) / maxTierAvailableInCurrentYear
      × (0.5 if any studio item is broken, else 1)

Conditions(show)
    = CleanlinessFactor (0.7–1.0) × MoraleFactor (0.8–1.1)        // Phase 4; = 1 before that

Quality(produced show)
    = (HostSkill^0.4 × ProductionSkill^0.3 × StudioLevel^0.3) × Conditions
      // weighted geometric mean: one weak link hurts, but doesn't zero everything

Quality(licensed title)
    = TitleQuality × LibraryLevel

Appeal(show, audience)
    = Quality
      × AudienceFit[genre][audience]
      × (1 + Promotion[show or channel][audience])     // 0–0.5 from marketing
      × (1 + 0.5 × HostFame / 100)                     // produced shows only
      × Freshness                                      // 0.5–1
      × (0.5 + ChannelReputation[region])              // 0–1 reputation → 0.5–1.5
      × SpecializationBonus                            // 1.1 or 1.0

Share(show, region, slot, audience)
    = Appeal^k / ( Σ Appeal^k of ALL shows (player + rivals) in that region, slot and medium
                   + Baseline^k )
      // k = 2 (tuning). Baseline = 0.3 = "doing something else / switched off"

Listeners(show) = Σ over regions & audiences: Reach × Share
```

**Freshness:**
- Produced shows lose 0.002 per day on air (minimum 0.6). A **revamp** costs money and resets freshness to 1.
- Licensed titles are multiplied by 0.7 per airing and recover 0.01 per day off-air.

**Channel reputation** (per region) moves slowly toward the channel's average quality-weighted share:
`rep += (target − rep) × 0.01 × (1 + ChannelManagerSkill / 200)` per day.

**KPIs in the top bar:**
- **Money**
- **Listeners**: sum over the player's channels of the average listeners across the channel's 5 slots.
- **RP**
- **Reputation**: average channel reputation, shown as 0–100.

## 8. Economy

**Revenue per show per day:**
```
Revenue = Σ over audiences: (Listeners[audience] / 1000) × CPM × AudienceSponsorValue[audience]
```
- Shows **without a sponsor** earn baseline spot ads: CPM €1.50 (radio) / €5 (TV) in 1970.
- **Sponsor contracts** come from Sales. Each contract has:
  - a CPM rate (higher than baseline)
  - optionally a preferred audience (×1.5 on that audience)
  - a minimum listener count
  - a duration in weeks
  - a penalty if the show averages below the minimum

  The player attaches a contract to a show.

**Expenses (monthly):** salaries, room rent, license fees, loan payments, content purchases (one-off), marketing budgets, revamps, broadcast rights.

**Starting prices (1970, no inflation, kept constant to keep it simple):**

| Item | Price |
|---|---|
| Staff salary | €800–2,500 / month by skill |
| Host salary | €1,000–6,000 / month by skill + fame |
| Manager salary | €2,000–4,000 / month |
| Room rent | €40 / tile / month |
| Radio license (per region) | €20,000 one-off + €2,000 / month |
| TV license (per region) | €200,000 one-off + €15,000 / month |
| Workstation (1970 tier) | €1,500 |
| Radio studio equipment set | €15,000 |

Sanity check: a radio channel in the Capital with decent shows should earn roughly €25–35k/month against roughly €20–25k/month in costs. Tight but profitable.

**Loans:** the player can borrow up to 50% of company value at 1% interest per month over 24 or 48 months. Only one loan at a time.

## 9. Licenses

- Licenses are **per region, per medium**.
- Each region has a **limited number** of radio and TV licenses (for example, the Capital starts with 3 radio and 1 TV license). More become available as the population grows.
- **Phase 2:** licenses are bought at a fixed price if available.
- **Phase 3+:** when a new license opens up, it is **auctioned** for one week (sealed bid against rivals).

## 10. Competition

- There are **4 rivals** with randomly generated names and logos.
- Rivals are simulated **abstractly**: they have channels, schedules, shows with a genre, a quality and a famous host, but no offices or staff.
- Each rival has a **personality** that drives what it schedules:
  1. News-focused
  2. Cheap entertainment
  3. Highbrow public-broadcaster style
  4. Youth / music
- Rival show quality follows the technology of the **historical year**, × a difficulty factor (default **0.8**) ± random noise. They adopt new tech at its historical year, so a player who researches ahead gets a real edge.
- Every season, rivals replace their weakest show.
- **Phase 4:** rivals occasionally try to poach a famous host, and the player can poach theirs.

## 11. R&D, eras & events

**Tech tree.** Each tech has a historical year. The player can research a tech **up to 5 years before** its historical year, at cost × (1 + 0.3 × years early). After its historical year it costs the base amount.

| Year | Tech | Effect |
|---|---|---|
| 1970 | Manual typewriter, rotary phone, AM transmitter, color TV studio tier 1 | Starting tech |
| 1972 | FM stereo | Radio studio tier 2 |
| 1975 | Electric typewriter | +10% office output |
| 1977 | Videotape library | Cheaper library, licensed content +10% quality |
| 1979 | Satellite uplink | TV studio tier 2, sports rights cheaper |
| 1981 | Music video format | Unlocks Music videos |
| 1982 | Personal computer | Replaces typewriter, +25% office output, Technician → IT |
| 1984 | Cable distribution | TV reach +15% |
| 1988 | Teleshopping format | Unlocks Teleshopping |
| 1990 | Digital radio studio | Radio studio tier 3 |
| 1993 | Digital editing | +15% ProductionSkill |
| 1995 | Internet | Marketing +20%, sales offers +1 |
| 1998 | Digital library | Library tier 3, content cheaper |
| 2000 | Reality format | Unlocks Reality TV |
| 2005 | HD broadcasting | TV studio tier 3 |
| 2008 | Social media | Marketing +30%, host fame grows faster |
| 2012 | Streaming | Extra revenue stream (+10% on all licensed content) |
| 2015 | Podcasting | Unlocks Podcast-style talk |

New furniture and equipment tiers become buyable when their tech is researched. Old equipment keeps working, but `StudioLevel` drops relative to the best tier available.

**Events (Phase 4):**
- **World Cup / Olympics** (real years: 1970, 1972, 1974, …): sports appeal ×1.5 for the event period, and broadcast rights go to auction.
- **Elections:** news ×1.3 for a month.
- **Recessions:** sponsor CPM −20% for a year.

Show events in a **news ticker**.

## 12. UI screens

- **Top bar:** date, speed controls, Money, Listeners, RP, Reputation, notifications.
- **Office view (3D):** rent rooms, set room type, place and move furniture, see staff working (simple idle/working animations).
- **Schedule:** grid of channels × 5 slots. Drag show or title cards into slots. Shows projected listeners per slot vs. rivals.
- **Shows:** create, edit and revamp produced shows.
- **Content market:** buy licensed titles and sports rights.
- **Staff:** overview, hiring pool, fire, assign to department/show.
- **Channels:** create a channel (name, logo builder, medium), assign a manager, manage licenses.
- **Licenses:** map of the 5 regions with available, owned and rival licenses.
- **Sales:** sponsor offers and active contracts.
- **Marketing:** create and track campaigns.
- **Research:** tech tree.
- **Finance:** monthly profit-and-loss report, money-over-time chart, loans.
- **Ratings:** weekly report with share per slot, per region, per audience, vs. rivals.

## 13. Art & assets

- **Art style:** defined in Phase 5e from the designer's reference files in [design/reference/](design/reference/) and written down in `design/style.md`. For 3D, use free CC0 low-poly assets from **Kenney.nl** (Furniture Kit, Mini Characters) as placeholders, tinted to fit that style.
- Load all 3D models through **one asset registry** (`src/office/assets.ts`) so they can be swapped later without code changes elsewhere.
- **UI style:** clean, slightly retro (70s-inspired colors and typography) was the starting direction; Phase 5e replaces it with the designer's style. Keep it easy to re-theme: every color, font and radius is a token.

## 14. Roadmap

### Phase 0: Skeleton
Vite + React + TS project, sim loop with pause and speeds, date display, save/load to IndexedDB, headless `simulate.ts` stub.
**Done when:** time runs at all speeds, and a save survives a page reload.

### Phase 1: MVP (radio, one region)
- Capital region only, 1 radio license, **1 rival**.
- Rent rooms; place workstations and a radio studio (simple top-down or 3D placement is fine).
- Hire hosts, production staff and a channel manager.
- Create 1 radio channel; create shows (Top 40, Morning show, Talk, News); schedule them.
- Full section 7 model (with Conditions = 1); baseline spot ad revenue only; monthly expenses; bankruptcy.
- Weekly ratings and monthly finance reports.

**Done when:**
- You can play from Jan 1970 to Dec 1971.
- A sensible strategy is profitable within 6 months, and a neglectful one goes bankrupt.
- `simulate.ts` confirms both.

### Phase 2: Full radio economy
All 5 regions and licenses, 4 rivals with personalities, multiple channels, all radio genres, Sales (sponsor contracts), Marketing (campaigns), department managers, staff XP and levels, loans, channel specialization.
**Done when:** a 10-year headless run shows the player able to become market leader in radio without it being trivial.

### Phase 3: TV
TV licenses, TV studios, library and content market, all 1970 TV genres, sports rights, license auctions.
**Done when:** TV is a meaningful but expensive mid-game step up from radio.

### Phase 4: Living office & history (split into 4a–4c)

#### Phase 4a: R&D and eras
R&D department and research points, the tech tree from section 11 (research up to 5 years early), new furniture and equipment tiers, `StudioLevel` relative to the best tier available, rivals adopting tech at its historical year, and rival quality improving over the decades. Formats that are now unlocked by year (music videos, teleshopping, reality TV, podcasts) move to research.
**Done when:** a headless run plays 1970–2030 without errors; a player who researches ahead gets a measurable quality edge over rivals; every decade unlocks something new.

#### Phase 4b: Living office
Morale, cleanliness and equipment condition (with breakdowns); cleaners, technicians (IT technicians after the PC) and maintenance staff with auto-assignment; the canteen; the `Conditions` factor in the quality formula.
**Done when:** neglecting support staff visibly lowers quality and output, and a bot that hires support staff outperforms one that doesn't.

#### Phase 4c: Events and rivalry
World Cup / Olympics (with sports-rights auctions), elections, recessions, a news ticker, and host poaching in both directions.
**Done when:** a full 1970–2030 game is playable, and each decade feels different.

### Phase 5: Polish (split into 5a–5h)

The order matters: balance comes first because milestones, difficulty and the tutorial all lean on stable numbers, the art style comes before the 3D office so the models are chosen to fit it, and the tutorial comes last because it points at the finished screens.

#### Phase 5a: Balancing pass
Tune the economy over the full 60 years. Stop money piling up in the late game, revisit the balance numbers marked "worth revisiting" in Decisions.md, and turn rival difficulty into a setting with easy, normal and hard values. No new systems unless a number can't fix it; if one is needed, list it as a question first.
**Done when:** in headless 1970–2030 runs on several seeds, a growing company's cash stays within about three years of its revenue, one radio channel in the Capital is still tight but profitable, TV is still an expensive mid-game step, and neglecting the office still fails.

#### Phase 5b: Milestones and settings
Milestones from section 2 ("First profitable month", "#1 radio channel in a region", "Market leader in all regions", "First TV channel", and a few per decade), announced when reached and listed on their own screen. A settings screen: difficulty (new games), autosave, reduced motion, and sound and music volume (used in 5g).
**Done when:** each milestone fires once and is stored in the save, and settings survive a page reload.

#### Phase 5c: Charts, screens and regional audiences
What section 12 describes but earlier phases simplified: Recharts for money over time and for ratings, drag-and-drop on the schedule with projected listeners per slot against rivals (the dropdowns stay as a fallback), and the licenses map of Etheria's five regions, drawn from lore.md.

**Regional audiences.** Until now every region had the same audience mix. Each region gets the three main audiences from section 4.1: they make up a clearly larger share of its population than elsewhere. The national totals shift a little as a result (more professionals, fewer seniors); keep them within a few points of section 4.2. The map and the license screens show a region's main audiences, ratings can be read per region, and rivals start in regions that suit their personality.
**Done when:** every screen in section 12 exists as described, the same show draws a visibly different audience in different regions, and the earlier phases' balance checks still pass.

#### Phase 5d: Events and license renewals
Two things worth spending money on, so that a big company's cash has a use. The dividend from 5a stays as it is for now.

- **Your own events.** The player stages a concert, gala or telethon on one of their channels for a large one-off sum, in a few sizes. It lifts the channel's reputation in its regions and the host's fame, both of which fade again, and earns prestige. Prestige is shown next to the dividends paid as a second score.
- **License renewal rounds.** Every license, the player's and the rivals', runs for a fixed term and then goes back to auction. Rivals bid according to what the license earns, the current holder has an advantage, expiry dates are staggered, and the player is warned well ahead. A rival's license coming up is a chance to take over its region.

Buying out rivals is out of scope here; see "Later ideas" below.
**Done when:** in headless 1970–2030 runs a bot that stages events and defends its licenses spends at least a quarter of its profit on them, a well-run single channel in the Capital keeps its license through two renewals, and every expiry is announced at least a year ahead. Then decide whether the dividend should be softened or dropped.

#### Phase 5e: Art style and UI rework
Define how the game looks, then restyle the 2D interface to match. The designer supplies SVG files and screenshots in [design/reference/](design/reference/); nothing here starts before they are in.

- **Style guide.** Read the references and write the style down in `design/style.md`: palette for light and dark, typefaces and type scale, spacing, corner radii, borders and shadows, icon style, and how panels, buttons, tables, tabs, meters, tags and charts look. It also says how 3D models should look (palette, level of detail, outlines, lighting), so 5f and 5g follow the same style. The designer approves the guide, with one or two restyled screens as a sample, before the rest is reworked.
- **UI rework.** Apply the guide to every screen, the top bar, the news ticker, the floor plan, the map of Etheria and the charts. Supplied SVGs that are meant for the game (logo, icons, illustrations) are used as they are; the rest is reference. Layout may change where the references ask for it; what each screen does stays the same.

No simulation changes.
**Done when:** the designer has approved the style guide, every screen follows it in light and dark, no color, font or radius is set outside the theme tokens, and all tests still pass.

#### Phase 5f: 3D office
The React Three Fiber office from sections 3, 12 and 13: fixed isometric orthographic camera, renting rooms and placing furniture in 3D, staff at their desks and support staff walking to their work with simple idle and working animations. All models load through the asset registry (`src/office/assets.ts`), with colors and lighting from the style guide (5e).

**Models.** Kenney's **Furniture Kit** for furniture and **Mini Characters** for people (both CC0, in `public/models`). The kit has no studio equipment, so mixing desks, microphones, cameras and lights are built from simple shapes in the registry until real models replace them. The Roguelike packs were considered and dropped: they are 2D pixel tiles and cannot be used in a 3D view. Animated Characters was dropped because it has no walking or sitting.

The 2D floor plan stays as a second view of the same office, for the keyboard and for small screens.
**Done when:** everything the 2D floor plan does works in the 3D view, and swapping a model only takes a change in the asset registry.

#### Phase 5g: 3D polish
- [x] It doesn't look like the characters are sitting on their chairs. Can you fix that? *Done: they sat too low. The sit pose in the character files is for sitting on the ground, so seated people are now raised onto the seat and placed on the cushion.*
- [x] Also can you use City Kit (Commercial) to make it look like the office is in the middle of the bustling town. *Done: the office is an upper floor of its own building, with the kit's buildings, streets and traffic around it. Higher floors look further down.*
- [x] Items should have the ability to be rotated. *Done: a Turn button and the R key, while placing and for a selected piece, in 3D and on the plan.*
- [x] Is it possible for me to give you some photographic references for items so you can generate a new modal? For example: I give a photo of a camera, you made a new camera modal. *Yes, within limits: see Decisions 5g.6. Put photos in `design/reference/models/`.*

- [x] Put the office on the ground floor. I do not like the orange building. Or use art from the City Kit so that it looks more like a building that it surrounds. *Done, both: floor 1 stands at street level, and floors 2 and 3 stand on floors drawn like the kit's buildings, with its awnings and parasols. The orange building is gone.*
- [x] Make sure the city is randomly generated on each new game. *Done: every game's town follows from its seed, so a new game has a new town and a saved game keeps its own.*
- [x] Please add Train Kit to let a train go by every now and then. *Done: an elevated railway in front of the office, with a train about every half minute. The train changes with the era: diesel, electric from 1990, high-speed from 2010.*
- [x] Microphones should be placed on tables in the radio studio. *Done: a desk microphone on a small table, with the host standing behind it.*
- [x] Staff/hosts/managers/etc. should have avatars based on their 3D-model *Done: portraits drawn from the 3D characters, shown for your team, the hiring pool and rival hosts.*
- [x] You should be able to select a character on a floor and see its info. *Done: click someone in the office to see who they are and what they are doing.* 

### Phase 6: UI and game view overhaul
Remove the 2D plan and make sure that the 3D view is the central view of the game. All other UI elements open in different Windows. A player can rotate, zoom in and out the view (not too close and not too wide). Use WSAD to go in either direction (with a limit). Channels, shows, schedule, content and ratings should be in one view.
Settings should be in the top right corner. Remove the 'Broadcast Empire' logo and place the time controls next tot the date. Make the kpis smaller in width so it can all fit and place the kpis fixed on the bottom of the screen.
'Get on the air' should be a seperate window you can minimize/maximize.

To-do's, in the order they are built (the game keeps working after each one):

- [x] **6.1 Top bar.** Remove the 'Broadcast Empire' logo, put the time controls next to the date, and put Settings in the top right corner. *Done: the date stands at the top left with the time controls beside it; Settings is the cog at the top right.*
- [x] **6.2 Status bar.** Narrower KPIs in one bar fixed to the bottom of the screen. *Done: one row along the bottom that stays put while the rest scrolls. On a narrow screen the row scrolls sideways.*
- [x] **6.3 Office in the middle.** The 3D office fills the screen between the top bar and the status bar and is always visible. *Done: the office and its town fill everything between the two bars.*
- [x] **6.4 Windows.** Every other screen opens in a window above the office: open from a menu, move, close, and bring to the front. *Done: a menu down the left side opens the windows. Drag a window by its title bar, click it to bring it to the front, close it with its button or Escape. On a phone a window fills the screen.*
- [x] **6.5 Broadcasting window.** Channels, shows, schedule, content and ratings together in one window. *Done: the 'On air' window, with the five as sections along its top.*
- [x] **6.6 'Get on the air' window.** Its own window that can be minimized and maximized. *Done: it starts at the bottom left, folds up to its title bar and remembers that, and can be moved or hidden.*
- [x] **6.7 Office tools.** Renting rooms, furniture and the person panel as panels over the 3D view. *Done: floors and rooms are picked at the top left; the room or person you select shows on the right and can be closed. Desks and upkeep moved to the 'Office' window.*
- [x] **6.8 Zoom and rotate.** Zoom in and out between two limits, and turn the view in quarter turns. *Done: the mouse wheel, + and −, or the buttons under the office zoom between a town-wide view and a close-up of a few desks. Q and E (or the buttons) turn the view a quarter; 0 puts it back. The tall back walls follow the view, and town buildings that would end up in front of the office are left out from that side.*
- [x] **6.9 Move with WASD.** Move the view in four directions, within a limit. *Done: hold W, A, S or D; the view stops nine tiles from the middle of the floor.*
- [x] **6.10 Remove the 2D plan.** Take out the plan and the 3D/Plan switch, and keep the office usable with the keyboard. *Done: the plan and the switch are gone. With the keyboard you pick a room with the room buttons and a piece of furniture from a list in the room panel; placing on an exact tile needs a mouse or a finger.*
- [x] **6.11 Check.** Dark theme, small screens, tests, style guide and Decisions up to date. *Done: 253 tests pass, the build works, the style guide and Decisions 6.1–6.10 are written. Looked at in the browser: light and dark, a wide screen and a phone. Not looked at: floors 2 and 3 from the turned sides, the reduce-motion setting with the new camera, and a window open on a phone.*
- [x] **6.12 Bottom bar.** Date and time controls left of the KPIs; news ticker right of them, in the bottom right corner. *Done. On a screen too narrow for one row, the ticker gets a row of its own.*
- [x] **6.13 Settings.** Save, Load and New move into Settings; the old Settings icon, larger. *Done: they are in the "This game" panel of the Settings window. The cog is the toolbar's icon at 44 pixels, alone in the sky at the top right.*
- [x] **6.14 No sky strip.** Remove the sky strip and float the cog; the art style comes back in the main menu (Phase 7). *Done: the office now reaches the top of the screen, with the cog on a tile in its top right corner.*

#### Phase 6b: cheat codes
In order for me to test certain things I want you to include some cheat codes. For example Control + Alt + C opens a field where I can type something to control the game. For example: 'money 50000' adds 50.000 cash. 'year 2000' sets the year to 2000. Add other codes you think are handy.

*Done: Ctrl+Alt+C (Control+Option+C on a Mac) opens the console. Codes: `money`, `year`, `days`, `rp`, `research all`, `reputation`, `prestige`, `floors`, `morale`, `skill`, `repair`, `seed` and `help`. The console lists them with what each does. See Decisions 6b.*

### Phase 7: Saving, loading and running the application
The application should have a homescreen where the player can choose to continue (loads the last saved game if any), load a game or save a game. This is also the place where the player can change sound settings and if they want their system's default dark/light color scheme or their own. Now I want the game to be placed on both Mac, Windows and Linux, so I think the application should be wrapped in something so it can be a .dmg, .exe and so on. (please find out what is the best way) And with that a way for the save files to be stored.

To-do's, in the order they are built:

- [x] **7.1 Choose the wrapper.** Compare the ways to turn the game into a .dmg, .exe and a Linux package, and pick one. *Done: Electron. It brings its own browser engine, so the 3D office looks and runs the same on all three systems, and it needs nothing installed beyond what the project already uses. Tauri makes much smaller installers but needs Rust and draws with each system's own engine, which is weakest for 3D on Linux. See Decisions 7.1.*
- [x] **7.2 Save slots.** Several named saves beside the autosave, which can be listed, loaded, overwritten and deleted. *Done: saves have a name and their own slot; the home screen lists them newest first with the game date and the money. The autosave is one slot apart. The one save from before this phase still loads.*
- [x] **7.3 Home screen.** The game starts on a home screen in the title-art style: Continue, New game, Load game, Save game and Settings. *Done: the evening city from the title art, the logo as a neon sign, and a menu with Continue, New game, Load game, Save game and Settings (and Quit in the desktop app). The cog in the game has a Main menu button; the game waits, paused, until you come back.*
- [x] **7.4 Settings on the home screen.** Sound and music volume, and the color scheme: the system's, light or dark. *Done: sound and music volume, the color scheme (same as the system, light or dark), autosave and reduce motion. The same options are in the Settings window in the game.*
- [x] **7.5 Works offline.** Nothing is loaded from the internet while playing (the fonts come with the game). *Done: the two fonts are part of the game now; nothing else was loaded from the internet.*
- [x] **7.6 Desktop app.** The game runs in its own window as an application. *Done: `npm run desktop` builds the game and opens it in its own window, with its own menu and icon.*
- [x] **7.7 Save files on the desktop.** Saves are files in the player's own folder for the game, and the game saves when its window is closed. *Done: one JSON file per save in the system's folder for the game (on a Mac `~/Library/Application Support/Broadcast Empire/saves`); Settings on the home screen shows the folder and opens it. Closing the window or choosing Quit saves the game to the autosave first.*
- [x] **7.8 Installers.** The setup for a .dmg, an .exe and Linux packages; build the Mac one and start it. *Done: `npm run dist:mac`, `dist:win` and `dist:linux` make a .dmg, a setup .exe and an AppImage in `release/`. All three were built on this Mac; the Mac app was started and played from its build. The Windows and Linux installers are built but not run. None are signed: see Decisions 7.8 for what that means and what is needed.*
- [x] **7.9 Check.** Tests, light and dark, style guide, README and Decisions up to date. *Done: all tests pass and the build works; looked at in light and dark, wide and phone width, in the browser and in the desktop app.*

### Phase 8: Final models, sound and music


### Phase 8a: quick fixes on the models
- [x] Cars should not run into each other. *Done: cars keep one speed per street and take turns at the crossings, so they never meet. A test checks every pair of cars.*
- [x] There shouldn't be a road under the train tracks as the cars drive into the support beams. *Done: under the railway is a paved strip with the pillars on it, and no cars. The cross streets still pass under the line.*
- [x] Talk table: put two sets of microhpones on the table. *Done: a desk microphone on the table for each of the two seats.*
- [x] Give the mixing desk a chair *Done: the presenter sits behind the desk on a chair and faces you. The desk was turned around for this; desks you placed earlier may need a turn.*
- [x] Let the characters walk around to the canteen and the toilets *Done: the office has a slow day of its own. At lunch half of the office staff eat in the canteen on their floor, the other half the next day. There are no toilets to build, so every corridor got a door marked WC where people slip out for a moment. See Decisions 8a.5–8a.8.*
- [x] Let the studios be used based on their schedule *Done: a host is in the studio only while their show is on in the current slot; the room's label says "On air" with the show and the on-air light is lit. Between shows they sit in the canteen or wait in the corridor.*
- [x] Placing an item I can't see which way it is facing or what I am placing - nor do I know that I can rotate it. *Done: the piece itself is shown see-through at the pointer, turned as it will stand, green where it fits and red where it doesn't. A yellow bar names it and has Turn (R) and Done (Esc) buttons.*

### Phase 8b

- [x] On a new game, the player fills in their own name (they are the CEO) and the company's name. *Done: New game asks for your name and the company's name; both are needed to start. The company's name is on the corridor of the office, in the ratings and in the name of a save; your name is at the top of the Staff window. Both can be changed in Settings.*
- [x] On a new game, the player selects a region where the headquarters are situated *Done: you pick the region on the map of Etheria when you start. A channel that starts broadcasting in your home region begins with some reputation there; that is its only effect for now (Decisions 8b.3). The Licenses window opens on your home region and marks it HQ.*
- [x] To be place furniture can be looked up in a catalog, with tabs for the various rooms. *Done: the Furniture catalog button above the office opens a window with a tab for each kind of room. A piece shows a turning picture of itself, what it is for, its price, size and upkeep, and can be placed from there, in any room on the floor that takes it.*
- [x] A control desk or a mixing desk can also be placed in a smaller adjacent room. *Done: a new kind of room, the control room. A desk there serves a studio next door that has none of its own, and that studio works 5% better. Any room next door can be the control room, not only a smaller one (Decisions 8b.6–8b.8).*

#### Phase 8c - sounds
Add UI Audio (for UI elements) and Impact Sounds (for placement of furniture) to the game.
*Done: every button, tab, checkbox, list and window has a sound from UI Audio, and an action that fails has its own. Putting furniture down, turning it and selling it use Impact Sounds, by what the piece is made of. The Sound volume in Settings sets how loud; 0 is off. I picked the clips by measuring them and could not listen: see Decisions 8c.2. Added after: short jingles from Music Jingles for a new company, milestones, good news, bad news, news from the country and bankruptcy (Decisions 8c.11–8c.15).*

### Phase 9: Tutorial
A guided storyteller (Penny Cash, see lore.md)  that replaces the "Get on the air" checklist, plus a short hint the first time a later system matters (support staff, research, TV, auctions, poaching, events, license renewals). I want to do the voice-over myself, so after you have completed the tutorial, give me the text script. This tutorial can be canceled by the player, but prompts at every new game. Would it be interesting to use Animated Woman Pack for this as the person who's talking to the player? Use Animated Man Pack for the Uncle who starts up the game by welcoming the player and introducing them to the lore.
**Done when:** a new player who only follows the tutorial gets on the air and reaches a first profitable month, confirmed by a scripted browser run.
*Done: Uncle Tabby welcomes every new game and Penny Cash asks whether she is wanted. She then leads through 18 steps, from renting a studio to the first month in the black, with a ring around what to click, and later gives a hint the first time something new matters (19 of them). She can be sent away and called back in Settings. Both use the packs you named. A scripted browser run that only clicks what Penny points at gets on the air and reaches a profitable February, and a test does the same for every region and difficulty. The script for your voice-over is design/voice-over.md. See Decisions 9.1–9.13; the bail-out from lore.md is not built (9.12).*



### Phase 10a: Wiki
A Wikipedia-style help guide that explains all the different aspects of the game and also holds some of the lore of the country. In different menus there are also little help icons that link directly to their relevant Wiki article. There are also some hints in here on how to win the game, but nothing too crazy. Tie in the Wiki also in the tutorial (when a user wants more info on the step they're currently on.)
*Done: the Wiki is a window in the game, opened from the menu: 51 articles on how everything works, on the five regions and the people of Etheria, and three with advice on doing well. The numbers in it are the game's own. Question marks beside the titles in the other windows open the article about what you are looking at, and every step and hint of the tutorial has "More about this". It has a contents list, links between articles, back and forward, and a search. See Decisions 10a.1–10a.9.*

### Phase 11: Various
- Add a character creator for the player at the start of the game. That character will be added to the game as CEO
- New room type: management office. All managers need one. Needs at least a desk and a single chair
- The cars are driving too predictable now, but still shouldn’t run in to each other.
- Next to the current date, add a hour clock. The days start at 8 am and end at 10 pm. (8 am being equal to the first of the month and 10pm being the end of the month).
- Add a new car type: bus, that stops every 15 minutes before the new hour. And a taxi cab. Switch the train for the yellow train from the pack, because it is a Dutch train and I like the nod to the game’s creator.
- All staff, apart from production staff and hosts, will work every day from 9 to 5. They will arrive on time, randomly by either walking, taking the bus or arriving by taxi. They will try to eat when seating is available somewhere between 11 am and 2 pm. And leave work at the end of the day.
- Hosts will arrive shortly before their show and leave shortly after. First show starts at 8.30am, last show ends at 9.30pm. They only arrive by taxi.
- Production staff will either start earlier or work late based on the shows thats assigned to them. If it is late, they will eat around or before dinner time in the canteen.
- Add random people to the world that walk around.
- Audience for a show will arrive before the show start, go to the right studio and leave shortly thereafter.
- In the main menu, when creating a new game, after character selection and naming the CEO, make the next step choosing the location of the main headquarters and giving it a name. Start with Coaxia, let the user with arrow buttons switch between the different regions, give them region info and a preview of the location (with animations of cars, people and trains)
- For the Transponder Valley, use the Industrial City Pack to create the world and use the industrial train. Traffic would consist mostly of trucks. Building same size as Coaxia.
- For Amplify Hills and Aerial Fields use the Suburban City Pack. Use the Dutch train, low traffic and not a lot of people wandering about. Building is bigger in size, but only two stories. To differentiate between Amplify Hills and Aerial Fields see if you can add lakes, rivers and hills to Amplify and farm fields to Aerial. Maybe from another free pack or generate based on the Suburban pack.
- For Skywave beach I want a combination of the Commercial City Pack mixed with the Suburban Pack: large houses on a beach front with large building behind it.
- When the game is paused, also pause the animation of the cars, train

Split into sub-phases, in the order they are built (the game keeps working after each one):

- [x] **11a The clock.** An hour clock next to the date: a month is one day at the office, from 8 am to 10 pm. The office follows that clock, and a paused game also stops the cars, the train and the people. *Done: the time stands beside the date and moves in steps of five minutes. The shows are on between 8:30 am and 9:30 pm; point at a slot's name in the schedule for its hours. Paused, everything in the office and the street stands still; at a higher speed it all moves faster. People are still in the building all day until 11e. See Decisions 11a.1–11a.6.*
- [x] **11b Traffic.** Cars that drive less predictably and still never run into each other. A bus that stops a quarter of an hour before every hour, a taxi, and the yellow Dutch train. *Done: every vehicle now has its own speed and its own moment, brakes for the one in front and gives way at crossings; tests check that no two ever touch. There are cars, vans, trucks, yellow taxis and a bus that stands at the new stop in front of the office at a quarter to every hour. The train is the yellow double-decker. Taxis only drive by until 11e. See Decisions 11b.1–11b.9.*
- [x] **11c Management office.** A new kind of room that every manager needs, with at least a desk and a chair. *Done: "Management office" is a kind of room now. Channel managers and department managers work there, each at a manager's desk (a desk with its chair, €2,500); a manager without one does nothing, and a channel whose manager has none is off the air. One room holds four to six managers: I read "all managers need one" as a place in such an office, not a room each. Penny has a step for it, and older saves get the office for nothing. See Decisions 11c.1–11c.7.*
- [x] **11d The CEO.** A character creator at the start of a new game; that character is in the office as the CEO. *Done: New game starts with your character: one of the eleven office characters, with a skin, hair and clothes color of your choice, standing beside the choices. That character is in the office as the CEO, with a star over the head: at a manager's desk that no manager needs, or else in the reception. It can be changed later in Settings. See Decisions 11d.1–11d.7.*
- [x] **11e The working day.** Office and support staff work 9 to 5, arrive on foot, by bus or by taxi, have lunch between 11 and 2 and go home. Hosts come by taxi shortly before their show and leave after it. Production staff start early or stay late with their shows. An audience arrives before its show and leaves after it. Other people walk around town. *Done: everyone keeps hours. Office and support staff, managers and you are in from 9 to 5 and come on foot, by bus or by taxi, differently each day; they walk in through the entrance, eat in the canteen at a moment of their own between 11 and 2 if a seat is free, and go home the way they came. Hosts come by taxi before their first show and leave after their last. Production staff work eight hours around their shows, and eat again around dinner time when they work late. An audience comes by bus before its show and leaves after it. Fourteen people are out for a walk around the blocks. The morning show's host and crew are in before the clock starts at 8, and bus riders are at the door about a quarter past: see Decisions 11e.1–11e.13.*
- [x] **11f The regions.** Each headquarters has its own surroundings: Coaxia as now, Transponder Valley industrial with trucks and the industrial train, Amplify Hills and Aerial Fields suburban with a larger building of two floors (hills and water against farm fields), Skywave Beach with large houses on a beach front and large buildings behind. *Done, but for the building: each headquarters has its own surroundings. Transponder Valley is industrial, with yards of containers, trucks on the road and a goods train. Amplify Hills and Aerial Fields have houses with gardens, quiet roads and few people about, with hills and a lake for the one and fields for the other. Skywave Beach has large houses towards a beach and the sea, and the big buildings behind. Coaxia is as it was. Not built: the larger building of two floors in the two rural regions; the office is the same everywhere. See Decisions 11f.1–11f.10, and 11f.9 for a proposal.*
- [x] **11g Choosing the headquarters.** In a new game, after the character and the CEO's name: pick the region with arrow buttons, starting at Coaxia, with what the region is like and a moving preview of the place, and name the headquarters. *Done: the second step of a new game shows the place itself, alive, between two arrow buttons: the office from outside with the town of that region, its cars, its train and its people. It starts at Coaxia. Under it stand a line about the place, its people and the price of a license; beside it the company's name (which is the name of the headquarters), a small map and the difficulty. See Decisions 11g.1–11g.8.*

### Phase 12: Playtest notes
- Skywave Beach and Amplify Hills have streets in the water.
- Hosting two shows on a day is not something that happens in real life.
- The tutorial should also introduce sales and marketing.
- You unlock events and prestige at a later point (for example through milestones). Also with sports rights and content market.
- Come to think of it, I think unlocking everything at once can be too overwelming for the player, so things live ‘marketing’, ‘sales’ and ‘research’ should only be unlocked after a certain milestone.
- Buying licenses for all regions at the start also seems a bit too much, it should also be unlocked later.
- The freshness of a show decreases too fast. A radio show that runs two months should be at 80% already
- The chairs of the canteen table are facing the wrong way.
- Every square in the city only has one building, I think a block can consist of multiple buildings put together.
- The morale keeps hanging on 60 with the text “a canteen would raise it” while I already placed both a canteen and a toilet block.
- In the ‘Staff’ window I think it would be better to have separate tabs for the different types of staff, because it would be a too big of a scroll when the company gets larger. ‘Cleaners’, ‘Maintenance’ and ‘Technician’ can have their own category ‘Other’.
- Toilet cubicles are missing a door.
- We should see shows filtered by channel, not a list that contains all of them.
- At the schedule page, remove the dropdown an only use the drag and drop system.
- When accepting a sales offer, the dropdown stays on the already selected show, prompting it with a message that that show already has a sponsor.
- Showing the ‘Furniture & licenses bought’ in the monthly report is not useful. The player would wanna know if the running costs will turn in a profit.
- Every time a new sales offer appears or when a marketing campaign is over, show a pop-up stating that. Also place a red dot (or something) next to the relevant icon.

Split into sub-phases, in the order they are built (the game keeps working after each one):

- [x] **12a Fixes.** No streets in the water in Skywave Beach and Amplify Hills. The chairs of the canteen table face the table. Toilet cubicles get a door. Morale no longer hangs at 60 asking for a canteen that is already there. After accepting a sales offer, the next offer does not start on a show that already has a sponsor. *Done: the sea and the lake are one piece, with a beach or a green bank along the last street; the side streets end there in a covered car park, because cars cannot turn a corner yet. The canteen chairs and the people on them face the table, and a cubicle has a door. A sponsor offer moves on to the best show that is still free. Morale: with a complete canteen it does rise; what was wrong is that the Office window asked for a canteen whenever one was there but lacked a piece. It now says what is missing. See Decisions 12a.1–12a.8, and 12a.4 if your canteen was complete.*
- [x] **12b Town blocks.** A block of the town can hold several buildings put together instead of one. *Done: a block in town holds up to four buildings, in terraces wall to wall along the streets and back to back. Towers, large halls and the large houses by the sea still fill a block alone, and a house in the country keeps its garden. Nothing stands in front of the office that hides it. The town of a running game looks different than before. See Decisions 12b.1–12b.7.*
- [x] **12c Windows.** Staff: a tab per kind of staff, with cleaners, maintenance and technicians together under "Other". Shows: shown per channel instead of one list of all of them. Schedule: drag and drop only, no dropdown. Monthly report: whether the running costs turn a profit, instead of "Furniture & licenses bought". A pop-up when a new sales offer comes in and when a marketing campaign is over, with a red dot at the icon of the window it is about. *Done: the team has tabs (Hosts, Production, Managers, Sales, Marketing, R&D, Other), with a dot on a tab where someone needs you. Shows are listed per channel, with a tab for those not on the air. The schedule has no dropdown: drag a show into a slot, or press the show and then the slot, which is what works on a touch screen. The monthly report leads with the running profit or loss; what you bought stands under it, and Finance has a new “The month ahead”. New sponsor offers and an ended campaign give a pop-up with a button to the window, and a red dot on its icon until you open it. See Decisions 12c.1–12c.13; 12c.2 and 12c.6 are readings of mine.*
- [x] **12d Balance.** Freshness falls more slowly: a show that is on the air for a year dips just below 50%. A host presents one slot a day, not more. *Done: a show loses 0.14% a day on the air, so it is at 92% after two months and at 49% after a year; the lowest is now 40%. A host presents one show a day. Because a full day then takes five hosts instead of three, hosts cost about three fifths of what they did; without that Penny's opening lost money on hard. Penny asks for five hosts, which changes two of her spoken lines (`hosts` and `full-day`). Older games keep hosts on the two shows they had. See Decisions 12d.1–12d.8; 12d.4 and 12d.8 are choices of mine.*
- [x] **12e Unlocking step by step.** A new company starts with less to look at. Sales, marketing and research open at a milestone each; licenses in other regions, the content market, sports rights, events and prestige open later, at milestones of their own. Which milestone opens what is proposed when this sub-phase starts. Older saves keep what they have. *Done: a new company starts with what it takes to make radio. More regions open after one month on the air, Sales with the first profitable month, Marketing with the first sponsor, Research with a second region (or with the biggest radio channel in one region), the content market with a TV license and events with “Radio market leader”. A locked window is dimmed with a lock and says what opens it; when something opens there is a pop-up and a dot. Older games keep everything open. See Decisions 12e.1–12e.15; 12e.3 is a change of mine to what you approved.*
- [x] **12f Penny.** The tutorial also introduces sales and marketing, and follows the order in which things are unlocked. The voice-over script changes with it. *Done: Penny has 23 steps. After the month in the black she has you hire someone in sales, sign a first sponsor, hire someone in marketing and start a small campaign, each as the step before opens it; then she says goodbye. Three hints became steps. The voice-over script has three new lines (`sales`, `sponsor`, `campaign`), two changed (`marketing`, `finish`) and two removed (`sponsors`, `offer`); the six you have recorded are untouched. See Decisions 12f.1–12f.11.*

### Phase 13: Build your own rooms
The fixed rooms A–U make way for rooms the player draws: drag a rectangle on the empty floor, pick what kind of room it is and place the door. What is left over is corridor. Rooms stay rectangles. A room costs rent per tile, as now, plus a sum once for building it; corridor is free.

The playtest notes that belong here:

- The CEO should get their own office
- The cleaners and technicians should not have rooms at every floor. Maybe move the stairs and elevators to the front so there is just a small hallway on higher floors.
- We should be able to see how many office workspaces are already occupied.  I think we should be able to assign staff to a certain workspace. In a larger company the marketing department have their own office and the marketing manager is in a room next door.
- Remove the ‘piece’ dropdown menu from the ‘Room list’.
- Selecting a piece of furniture should open a small window with the options to ‘sell’, turn, move or cancel. The worth of a piece of furniture should decrease over time. If someone places something by mistake now they get a penalty.
- The ‘buy what’s missing’ button is a bit strange to me, it places stuff in the room at random. Remove it from the game.
- The room type selector should be a button group, not a drop-down. Per room type show a relevant image of that room.

Split into sub-phases, in the order they are built (the game keeps working after each one):

- [x] **13a Rooms in the save.** The 21 fixed rooms become part of the game itself instead of the building. Nothing looks different yet; older saves keep their rooms where they are. *Done: every room in a game now carries its own name, floor, rectangle and door, and everything that needs to know where a room is asks the game instead of the building. Nothing looks or plays differently: games played by the test bots end exactly as they did before. Rooms A to U are still rented by clicking them, until drawing replaces that in 13d. Older saves load with their rooms where they were. See Decisions 13a.1–13a.9; 13a.4 is a choice of mine about the reception.*
- [x] **13b Finding the way.** People find their own route across the floor, around rooms and furniture, instead of following the one corridor. *Done: people find their own way from where they are to where they are going: through the middle of a doorway, never through a wall, straight across open floor and around furniture. Where furniture leaves no way around (a row of desks from wall to wall, a desk in front of the door) they still get there, through as little of it as they can. With the rooms as they are today the way between two rooms is still the corridor; the difference shows inside the rooms and in the hall, and it is what drawn rooms need in 13d. See Decisions 13b.1–13b.9.*
- [x] **13c The building.** Stairs and lifts move to the front. Cleaners and technicians have a room on the ground floor only; the higher floors have a small hallway. The size of a floor can differ per region, which gives Amplify Hills and Aerial Fields their larger building of two floors (left open in 11f). *Done: the stairs and the lifts stand in the two corners at the front, beside the entrance, on every floor. The technicians' and the cleaners' rooms are behind them on the ground floor only; the floors above have a hallway between the stairs and the lifts and open floor behind them, which becomes room to build on in 13d. A new company in Amplify Hills or Aerial Fields gets a longer building of two floors with ten rooms each, where the towns have three floors of seven; its block in town is one block wider. Games you already have keep the building they are in. See Decisions 13c.1–13c.12; 13c.5, 13c.6 and 13c.9 are choices of mine.*
- [x] **13d Drawing rooms.** Drag a rectangle on empty floor, choose the kind of room from a group of buttons with a picture of each, and place the door. A room can be made larger or smaller and taken away. A room has a smallest size, may not overlap another, and must be reachable from the entrance, the stairs and the lifts. *Done: “Build a room” above the office starts a room: choose its kind from eleven buttons with a picture each, drag a rectangle on the floor, and click one of its walls for the door (the game proposes one, which you can move). The fixed rooms A to U are gone; whatever floor you leave open is corridor. A room is at least 3 by 3 tiles, may stand wall to wall with another but not through it, and the game refuses a room or a door that would leave any room out of reach of the stairs and the lifts. Building costs €50 a tile once, on top of the rent. A room can be given another shape or door, or taken away when it is empty. “Propose a place” puts a room of the usual size in the next free place along the hall, for those who would rather not draw. Penny's three lines about rooms changed with it. Games you already have keep their rooms. See Decisions 13d.1–13d.16; 13d.3, 13d.6, 13d.9 and 13d.12 are choices of mine.*
- [x] **13e Furniture and the room panel.** Selecting a piece opens a small window: sell, turn, move or cancel. A piece is worth less as it gets older; one that is sold straight after it was placed gives its money back. The "piece" dropdown in the room list and "Buy what's missing" are removed. Furniture may not be placed in front of a door, and a door may not be put where furniture stands in front of it. *Done: clicking a piece opens a small window beside it with “Sell”, “Turn”, “Move” and “Cancel”. “Move” picks the piece up and puts it down wherever its kind can go, for nothing. A piece gives its whole price back for a week after it was placed; after that it brings 75% of its price, falling to 25% over five years. The “Piece” list and “Buy what's missing” are gone: every open line of a room's checklist has its own “Place” button, and you pick the spot. Nothing can be placed, moved or turned onto the floor in front of a door, and those tiles show red while a piece is on the pointer. A piece can also be placed with the arrow keys and Enter. Two of Penny's lines changed with it. The catalog's “Put one in …” went as well. See Decisions 13e.1–13e.16; 13e.2, 13e.10 and 13e.11 are choices of mine.*
- [x] **13f Who sits where.** An office shows how many of its workplaces are taken and by whom. Staff can be given a workplace, so that a department can have its own office with its manager next door. The CEO gets an office of their own. *Done: under an office's name stands how many of its places are taken, and its panel lists every workplace with who works there. “Give to…” beside a workplace gives it to someone as their own; the buttons under the list give every place that is nobody's to one job at once, so a department has the room to itself, and its manager gets a desk in a management office the same way. Whoever has no place of their own is seated as before. The CEO's office is a new kind of room with a CEO's desk: with it you work there, without it you stand in the reception; a company has one. See Decisions 13f.1–13f.11; 13f.4, 13f.6, 13f.8 and 13f.9 are choices of mine.*
- [x] **13g Penny, the test bot and the wiki.** The tutorial's steps on rooms, the bot that plays in the tests and the wiki follow the new way of building. The voice-over script changes with it. *Done: the bots in the tests build where the game proposes a place and furnish piece by piece, with the actions a player has; the old short cuts (lettered rooms, buying what is missing in one go) are out of the game and kept in a file for tests only. The balance tests pass unchanged. Penny's line about the second floor says "build" instead of "rent", and she has one new hint, `places`, about giving people a place of their own once there is a second office. The wiki and the game's messages no longer speak of renting a room. See Decisions 13g.1–13g.6; the new hint (13g.5) is mine.*

### Phase 14a: Release & Playtesting
Release the Alpha Build. We will defer from phases now and use version numbers (maybe stop using the Roadmap and using a new file for feature updates/requests. Clean up other things that are no longer nescessary e.g. old pictures and reference material). From Decisions.md keep only what you need for memory purposes, turn open questions into feature requests with several prio's (high, medium, low). Bundled feature requests can then be part of a new version number.

I will be playtesting the game on Mac, Windows and Linux and give more feedback.

*Done: the game is at version 0.8.0, the first alpha, and says so on the home screen and in Settings ("Alpha 0.8.0"). The roadmap stops here: what is still wanted is in [REQUESTS.md](REQUESTS.md), 38 requests in three priorities with an inbox for playtest notes, and what each version brings is in [CHANGELOG.md](CHANGELOG.md). Decisions.md is cut down from 623 lines to the 80 that are needed to keep building; every open question in it became a request, and the full log is still in the history (`git show phase-13g:Decisions.md`). The installers for Mac, Windows and Linux are in `release/`, unsigned; the README says how to open them. Cleaned up: the reference pictures and photos in `design/reference/`, the first version of the brief (`prompt-v1.md`), the furniture list (`furniture.md`, which had fallen behind the game), one unused model and the old installers. What was in git is still in its history. The cheat console stays in.*

##### Phase 14b: Insert the voice-over at the tutorial
Get the mp3-files and place them where needed.
**Done when:** the tutorial has voice-over every time a new step is reached.

*Done in version 0.9.0 (request R1): every line of Uncle Tabby and Penny Cash is said aloud when it comes up, from the 46 recordings in `public/voice/`, with a Voice volume in Settings. See [CHANGELOG.md](CHANGELOG.md).*

### Later ideas (not scheduled)

- **Takeovers.** Buying a rival out of a region, or outright, and taking over its channels and hosts. Rivals have no money, value or staff today, so this needs its own design first.
- **Surroundings.** Use City Kit (Industrial) and City Kit (Suburban) for different locations. For example: if the user choses a different region as their main office, the surroundings will change.

## 15. Open questions (for the designer)

1. Which web framework do you know best? (This brief assumes React; Svelte or Vue would work equally well for the UI.) React.
2. Art style: to be uploaded.
3. Currency and country: a fictional country with euros for now. Should it be inspired by a real country? No, fictional.
4. Optional opening: in much of Europe, commercial broadcasting was illegal in the 1970s and pirate radio stations broadcast from ships. Should the game optionally start as an offshore pirate station that later goes legal? Not for now.
5. Game language(s): English only, or also Dutch? English is fine
