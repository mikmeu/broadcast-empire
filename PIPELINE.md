# The pipeline

How a bug report, a feature or an idea becomes part of a release: who picks it up, where you approve it, and what runs where. It takes over from the tables in [REQUESTS.md](REQUESTS.md). Everything here is free: GitHub (issues, a project board, Actions on a public repository), a Gmail account, and Claude Code on your own subscription.

```
 players ─ e-mail ─┐
 Google Form ──────┼─▶ support ─▶ In review ─▶ Planning ─▶ Plan review ─▶ Ready to build ─▶ Building ─▶ Result review ─▶ Ready to release ─▶ Released
 GitHub issue ─────┘   (agent)     (you)       (agent)      (you)          (queue)          (agents)     (you)            (bundled per version) (you: /release, /publish)
```

## Where things live

- **One GitHub issue per request,** in github.com/mikmeu/broadcast-empire. The issue holds the summary, the plan, the discussion and links to the pull request. Issues are public, like REQUESTS.md was: they never carry a player's name or e-mail address. The player's own message stays in the support mailbox.
- **The project board "Broadcast Empire"** shows every issue in its **Stage** with its **Priority**, **Size** and **Estimate**. The Stage is what the agents go by; you can also move a card by hand.
- **A milestone per version** (0.17.0, 0.17.1 …) is the bundle. The planner proposes one, you confirm it when you approve the plan.
- **Labels** say what kind of request it is (below) and what it is waiting for. A `working: <agent>` label (`working: planner`, `working: developer`, ...) is on an issue for as long as that agent is actually running on it, and off it the moment the agent stops — so you can see who's doing what from GitHub itself (the web site, the mobile app, or its e-mail if you watch the repository), with no need to reach the server.
- **A branch per version** (`next/0.17.0`) collects the approved work of that version. Versions stack: a new version's branch starts from the open version before it (`next/0.18.0` from `next/0.17.0` while 0.17.0 is unreleased), else from `main`, and takes in whatever lands there as soon as it does, so work planned and built ahead is built on the code it will be released with. Versions go out in order: `/release` on a version waits for the ones before it. Once a version's release begins, it takes no more work: an issue approved, built or merged for it after that goes in the first open version after it instead, and the issue says so; its milestone is closed when it is out. Every issue is built on its own branch (`issue/123-short-name`) with a pull request into the version's branch. `main` gets one commit per version, as now.

## The stages

| Stage | Who | What happens |
|---|---|---|
| Inbox | support | A new message or issue that has not been read yet. |
| In review | **you** | Support has summarised it, given it a kind, a priority and a rough size, checked for duplicates and asked you. |
| Backlog | | Approved in principle, not planned yet. The requests from REQUESTS.md start here. |
| Planning | planner | The planner works out what to build, how big it is, what it costs, what it needs from you and which version it belongs in. |
| Plan review | **you** | The plan is a comment on the issue. Answer its questions, add references, or approve it. |
| Ready to build | | Approved; waiting for the developer (one build at a time). |
| Building | developer (with artist, sound) | Built on its own branch, with its tests, and checked by GitHub Actions. |
| Result review | **you** | A draft pull request with what changed, screenshots and how to try it. Approve it, or say what to change. |
| Ready to release | | Merged into the version's branch. Waits for the rest of its bundle. |
| Released | release | In a published version, in the changelog and on the website. |
| On hold | | Parked by you. |
| Rejected | | Closed as "not planned" by `/reject`. |
| Split | | Closed: too big, so planned instead as the smaller issues named in its last comment. |

An issue you turn down is closed as "not planned" and moves to the Rejected column.

## What you say, and where

You answer on the issue, **on github.com or by replying to the notification e-mail** GitHub sends you: a reply to that mail becomes a comment. Only comments from `mikmeu` count; anyone else's are read as information. A command goes at the start of a line (`/approve 0.18.0`), or at the end of a sentence ("That is right /approve").

| Comment | In | Does |
|---|---|---|
| `/approve` | In review, Backlog | Sends it to planning. |
| `/approve` | the plan's questions answered in the same comment | Accepts the plan with your answers, which the developer reads. |
| `/approve` | Plan review | Accepts the plan and the version it proposes; `/approve 0.18.0` puts it in another. |
| `/approve` | Result review | Merges the pull request into the version's branch (once its checks are green). |
| `/plan` | any open status | Plans it now (from the Backlog, say). |
| `/reject` *reason* | anywhere | Closes it as not planned. |
| `/hold`, `/resume` | anywhere | Parks it, and brings it back where it was. |
| `/priority high`, `/size M`, `/version 0.17.0`, `/kind balancing` | anywhere | Changes that field. |
| anything else | a stage that waits for you | Goes back to the agent of that stage as your feedback: In review to support, Plan review to the planner (a new plan follows), Result review to the developer (a new result follows). |
| `/retest` (or "try again") | Result review | Runs the branch's failed checks again, for a failure that isn't the build's own. |
| `/refs` | anywhere | Tells the agents there are references in `design/references/<issue>/` on the server. |
| `/release` | the release issue of a version | Starts the release of that bundle. |
| `/publish` | the release issue | Ships the draft release you tried. |
| `/pause`, `/unpause` | any issue | Stops (or lifts stopping) new agents from starting, anywhere, until you say `/unpause`. Jobs already running finish normally. The server's `pipeline/dispatch.py pause`/`resume` does the same. |

**Reference material** for a plan: attach pictures, or files such as lists and data (`.json`, `.txt`, `.csv`, `.md`), to a comment (they become public, as the issue is); the dispatcher saves them where the agents can read them. Pictures a player mails in stay private and go the same way. Pictures that must stay private, like the photos in `design/references/`, go in that folder on the server, in a subfolder named after the issue (`design/references/123/`); then say `/refs` and the agents look there.

## Kinds, priorities and sizes

**Kinds** (labels): `bug` (something wrong), `feature` (something new that fits the game as it is), `big feature` (needs its own design first, like takeovers or a streaming service), `balancing` (numbers: costs, incomes, difficulty), `content` (wiki, lore, Penny's words), `art & sound` (models, rooms, sounds, music, voice), `interface` (windows, controls, readability), `performance`, `release` (installers, website, platforms), `choice` (something built one way that is yours to confirm), `question` (not a request: support answers it).

**Priorities:** `critical` (a crash, a lost save, a game that can't be played: next patch), `high`, `medium`, `low`.

**Sizes.** The table below buckets a request by output tokens — what a build produces, regardless of which model builds it — measured from the sessions that built 0.14.0 to 0.16.0 (each a bundle of about ten requests, about 350 to 600 thousand output tokens, 1 to 1.5 million fresh input and 150 to 230 million cached reads, on Opus; `developer`, `artist` and `release` run on Sonnet now, so new bundles should cost noticeably less).

| Size | Is | Output tokens | Example |
|---|---|---|---|
| XS | a number, a word, a one-line fix | under 10k | a price in `balance.ts` |
| S | one system, a few files, a test | 10k to 40k | a decor piece, a warning in the news |
| M | a feature across sim, UI and tests | 40k to 120k | a recording booth, cartoons |
| L | a new system with a save version | 120k to 300k | strikes, master control |
| XL | split it first | over 300k | a streaming service |

The plan itself doesn't give you that token figure, though: it gives a **cost in dollars at list price** instead (shown in the issue's **Estimate** field too), because that's the unit the percentage meter in your Claude apps is actually denominated in, not a token count. It's a proxy, not an exact reading — Anthropic doesn't publish the conversion from list-price cost to a slice of your five-hour or weekly window, and that window is shared with whatever you do yourself in Claude Code or claude.ai. But it moves the same way: a bigger figure here uses up more of that window, faster, and the agents share your subscription, so what they spend is what you'd otherwise have for yourself. Each finished build adds its real cost to the planner's figures (`pipeline/dispatch.py`'s `calibration()`, from `usage.jsonl`), labelled by the model that built it, so the estimates get better and track a model change like the Sonnet one above. On a Claude subscription nothing is billed for this directly; it counts against your usage limits instead, which the agents share with your own sessions. That is why only one build runs at a time.

## The agents

They are Claude Code agents, defined in [.claude/agents/](.claude/agents/), so each can also be used by hand in a session. On the server a small program, [pipeline/dispatch.py](pipeline/dispatch.py), watches the mailbox and the board and starts the right one.

- **support** reads a message, splits it into requests, writes each as an issue without personal details, sorts it, looks for duplicates in the open issues and the changelog, and asks you. It has no tools that change anything: the dispatcher files what it writes.
- **planner** reads the issue, the graph (`graphify-out`), Decisions.md, the changelog and the code, and writes the plan: what changes and where, the risks (save version, balance tests, Penny's lines), size and tokens, questions and references it needs, and the version it fits.
- **developer** builds the approved plan on the issue's branch, with tests, and runs the type check and the tests of what it touched. It calls on:
  - **artist** for models, rooms, decor and anything drawn from shapes, after `design/style.md` and the references;
  - **sound** for sounds, and for Penny's and Uncle Tabby's new lines: it lists each with its file name and words, for you to record in the ElevenLabs website (the free plan doesn't let the API use library voices). Until you do, the game shows a line without playing it. Say "the recordings are in" in a session on your Mac, and they are taken off the list and committed.
  
  Work that moves on to an issue of its own (you agreed, or the plan leaves it for later) it lists in its answer, and the dispatcher files it in the Backlog and names it on the issue: the developer can't use GitHub itself.
- **release** puts a bundle together: changelog, version number, website text and screenshots, the release pull request, the draft release, and after `/publish` the merge, the release, the website and the e-mail with the release notes.

## Testing: what runs where

Your laptop runs nothing of this; the heavy work goes to GitHub's machines, which cost nothing for a public repository.

- **While building (server):** the developer runs the type check and only the tests of the files it touched (`npx vitest related`). The full suite never runs on the server, so the server stays as quiet as it is.
- **On every pushed branch (GitHub Actions, `test.yml`):** the type check, the build and the full suite, split over three machines so it takes minutes. A build goes to you for review only when these are green.
- **Before a release (GitHub Actions, `release.yml`):** the full suite again on the bundle, and the three installers built on a real Mac, a real Windows machine and Linux, as a draft release. You try the installers; nothing is published until `/publish`.
- **By hand (you):** playing it. A build you review can be tried in the browser (`npm run review -- 123` on your laptop starts that branch in a browser; nothing is installed or built).

## Releasing

1. When a version's issues are all **Ready to release**, the release issue of that version (opened with its first issue, a checklist of the bundle) says so. Say `/release`, or `/release` earlier to ship what is ready and move the rest to the next version.
2. The release agent writes the changelog section (with issue numbers in place of R-numbers), sets the version in `package.json`, updates the website pages and screenshots, and opens the release pull request into `main`. `release.yml` tests it and builds the draft release with the installers.
3. You try the installers and read the notes. Say `/publish`, or say what to change.
4. The pull request is merged as one commit ("Broadcast Empire, Alpha 0.17.0"), the release is published with its tag (only the last three releases stay on GitHub: older ones are deleted with their installers, their tags stay), the website workflow runs, the live site is checked, the issues are closed as Released, and support e-mails the release notes to mike@mvdm.media.

**Later: a newsletter.** A sign-up form on the website and a free mailing service (Buttondown is free up to 100 subscribers, MailerLite up to 1,000) that takes care of opt-in and unsubscribing, as the law asks. The release agent then writes each release as a draft newsletter with screenshots for you to send. Gmail is not for that: it is limited to a few hundred mails a day and lands in spam.

## Setting it up

What only you can do, once; the rest is in [pipeline/README.md](pipeline/README.md).

1. **A Gmail account for the game** (for example broadcastempire.support@gmail.com), with two-step verification and an app password. In Namecheap, forward `support@broadcastempire.online` to it; in Gmail, add support@ as a "send mail as" address, so replies come from it.
2. **A GitHub account for the agents** (for example `broadcastempire-bot`; GitHub allows one free machine account per person), invited as a collaborator to the repository and the project. The agents speak as that account, so GitHub notifies you of what they say; when they speak as you, it doesn't.
3. **On the server:** Claude Code logged in with your subscription, `gh` logged in as the bot, Node 22, Python 3.11, graphify, a clone of the repository and the pipeline service (`pipeline/README.md`).
4. **The Google Form:** the script in `pipeline/google-form.gs` sends each answer to the support address.
5. **Notifications:** on GitHub, watch the repository ("All activity") and have notifications e-mailed to mike@mvdm.media.
