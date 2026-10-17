# Broadcast Empire: notes for Claude

A tycoon game (React, three.js, Electron) built for a designer, Mike (`mikmeu` on GitHub). The work goes by issues and versions: see [PIPELINE.md](PIPELINE.md). Read before changing anything: [Decisions.md](Decisions.md) (how the game is built and why), [CHANGELOG.md](CHANGELOG.md) (what is released) and the README (commands, releasing, the website).

## Before acting

- **Look at the graph first.** `graphify-out/` (gitignored, so local only) holds a knowledge graph of the code: read `graphify-out/GRAPH_REPORT.md`, or `graphify query "<question>"`, `graphify explain "<node>"`, `graphify path "A" "B"` for the parts a request touches. Check it is not stale (`Built from commit` against `git rev-parse HEAD`); `graphify update .` refreshes it at no cost.
- **Numbers live in `src/config/balance.ts`** and the office in `src/config/office.ts`; they are not repeated in Decisions.md.

## Rules

- **Commits:** in a session with Mike, only when he asks. The pipeline's agents commit only on their issue's branch (`issue/<n>-<name>`) or the version's branch (`next/<version>`), and never push: the dispatcher does. Never push with `--all` or `--mirror`, or any branch other than `main`, `issue/*` and `next/*`: the history before 0.10.0 (`phase-*`, `release-*`, `website`, `refs/history/`) exists on Mike's Mac only and stays private.
- **Never commit `design/references/`.** Those are other people's photos, used as references only; it is excluded through `.git/info/exclude`, so never `git add -f` it. Saying a model is "after the designer's photo" is fine.
- **`lore.md` and `website.md` are Mike's,** untracked: read them, edit them only when asked, never commit them.
- **Recorded voice lines** (`public/voice/`) must not change their words without asking. A changed or new line goes on `TO_RECORD` in `src/config/voiceOver.ts` until its recording is in, and `npm run voice-over` rewrites `design/voice-over.md` (a test holds both).
- **A change to what is saved** bumps the save version with a migration in `src/persistence/`, so older games load.
- **Balance:** the test players (`src/sim/bots.ts`, `npm run simulate`) guard the economy. When a change moves them (a bot goes bankrupt, a start no longer reaches the black), measure it, say so in the issue, and relax a guard only with the reason in the test.
- **Text in the game and the docs** is plain, short and concrete, in the voice of the existing text; British spelling; the player is "you".

## Tests

- `npm run typecheck`, and `npx vitest related <files> --run` for the tests of what you touched. The full suite (`npm test`, about 700 tests, minutes on all cores) runs on GitHub Actions for every pushed branch; on the server and Mike's laptop run it only when asked.
- Never wrap vitest in a timeout that kills only `npx`: its workers keep spinning. After killing a run: `pkill -9 -f experimental-import-meta-resolve`.
- A test loop like `while (s.day < N)` needs a bankruptcy check, or it never ends when a bot goes bankrupt.
- Checking in a real browser: `npm run dev` and playwright-core; on Mike's Mac use Microsoft Edge (`/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`), Chromium.app there is broken.
