# Setting up the pipeline

How the pipeline of [PIPELINE.md](../PIPELINE.md) is put on the Linux server, step by step. Once only. Everything is free.

| File | What it is |
|---|---|
| `dispatch.py` | The dispatcher: watches the mailbox and the board, starts the agents, does the git, GitHub and e-mail work. Python 3.11 or later, nothing to install. |
| `pipeline.example.toml` | Its settings, to copy to `~/.config/broadcast-empire/pipeline.toml`. |
| `broadcast-empire-pipeline.service` | The systemd user service that keeps it running. |
| `setup-github.sh` | Makes the labels and the project board on GitHub. |
| `import-requests.py` | Moves the requests in REQUESTS.md to issues on the board, in the Backlog. |
| `google-form.gs` | Sends the website form's answers to the support address. |
| `../.claude/agents/` | The agents: support, planner, developer, artist, sound, release. |
| `../.github/workflows/test.yml`, `release.yml` | The tests on every branch, and the installers before a release, on GitHub's machines. |

## 1. Accounts (on your laptop, in a browser)

Done on 17 October 2026; kept here in case one has to be made again.

1. **Gmail:** broadcastempiregame@gmail.com, with two-step verification and an app password (typed without its spaces). IMAP is on.
2. **Namecheap:** Domain List, broadcastempire.online, Redirect Email: `support` forwards to that Gmail address.
3. **Gmail, "Send mail as":** `support@broadcastempire.online`, through smtp.gmail.com, port 465, SSL, the Gmail address and the app password; it is the default, and replies go from the address a mail was sent to. Office 365 marks these mails as unverified, because Gmail signs them as gmail.com: mark support@ (and notifications@github.com) as a safe sender. Before the pipeline mails players or a newsletter goes out, the mail should go through a service that signs it for the domain (Brevo, for one, is free up to 300 mails a day), with its records added in Namecheap.
4. **GitHub, the bot:** `broadcastempire-bot` (with the Gmail address and two-factor authentication), a writer on the repository and on the board.
5. **GitHub, you:** notifications by e-mail to mike@mvdm.media for "Participating, @mentions and custom" and "Watching", and the repository watched for all activity. A reply to a notification mail becomes your comment on the issue.
6. **ElevenLabs:** not used by the pipeline. Penny and Uncle Tabby are library voices, which the free plan lets only the website use, so Mike records new lines there. With paid credits, `npm run record-voice` records them with the same voices, model and settings, given the key in `ELEVENLABS_API_KEY`.

## 2. GitHub (on your laptop)

```sh
gh auth refresh -s project
pipeline/setup-github.sh
```

It prints the project's number. Then on the project's page, as it says: a Board view by **Stage**, and the bot invited as a writer.

## 3. The server

As the user the pipeline will run as. A user of its own (`sudo adduser broadcast`) is safer: the agents can then reach nothing but this.

```sh
# Node 22, git, Python 3.11+, and gh: from the distribution or nodesource.com and cli.github.com
curl -fsSL https://claude.ai/install.sh | bash      # Claude Code
claude                                               # log in once with your subscription, then /exit
curl -LsSf https://astral.sh/uv/install.sh | sh && uv tool install graphifyy && graphify install --platform claude
gh auth login                                        # as the bot, with HTTPS; gh auth setup-git

git clone https://github.com/mikmeu/broadcast-empire.git ~/broadcast-empire
cd ~/broadcast-empire
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
sudo npx playwright-core install-deps chromium       # the libraries the browser needs, once
npx playwright-core install chromium                 # the browser for npm run screenshot, as the pipeline's user
graphify .                                           # the graph, once (or copy graphify-out/ from your Mac)
git config user.name broadcastempire-bot
git config user.email <the bot's e-mail address>

mkdir -p ~/.config/broadcast-empire
cp pipeline/pipeline.example.toml ~/.config/broadcast-empire/pipeline.toml
chmod 600 ~/.config/broadcast-empire/pipeline.toml
nano ~/.config/broadcast-empire/pipeline.toml        # the project number and the mailbox

python3 pipeline/dispatch.py check                   # gh as the bot, the board, claude, the mailbox
```

Copy what the agents may read but that is not in the repository, from your Mac: `design/references/` into `~/broadcast-empire/` (it stays out of git: add `design/references/` to `.git/info/exclude` on the server too). The dispatcher copies it into every agent's worktree.

**Pictures.** The pictures that come with an issue are saved in `design/references/<issue>/` on the server, private: those attached to a mail (support looks at them first, in `design/references/mail-<uid>/`), and those attached to the issue or a comment on GitHub, which the dispatcher downloads, since the agents can't open a link. Files attached on GitHub with a `.json`, `.txt`, `.csv`, `.tsv`, `.md` or `.yaml` name are saved there too. Every agent working on the issue is told they are there.

**Updating the server** after a change to the pipeline or the packages: `git pull` and `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` in `~/broadcast-empire`, then `systemctl --user restart broadcast-empire-pipeline`.

## 4. The requests, and the start

```sh
python3 pipeline/import-requests.py          # see what it would make
python3 pipeline/import-requests.py --go     # 40 issues, in the Backlog

cp pipeline/broadcast-empire-pipeline.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now broadcast-empire-pipeline
loginctl enable-linger $USER
journalctl --user -u broadcast-empire-pipeline -f
```

`python3 pipeline/dispatch.py status` shows what is running and where every issue stands. To pause it: `systemctl --user stop broadcast-empire-pipeline`.

## 5. The form

Open the form on the website in Google Forms, then Apps Script, and follow the steps at the top of `google-form.gs`.

## Watching the agents

- **From VS Code:** Remote - SSH to the server, open `~/broadcast-empire-work/issue-<n>`: that is where the developer is working. `~/.local/state/broadcast-empire/jobs/` has each agent's prompt and answer.
- **Taking over:** stop the service, then `claude --resume <session id>` in the issue's worktree (the session ids are in `state.json`) to go on with the agent by hand.
- **Tokens:** `~/.local/state/broadcast-empire/usage.jsonl` has every run; the planner reads the totals for its estimates.

## What to know

- **The agents share your Claude usage limits** with your own sessions. When the limit is reached the pipeline waits until it lifts (the time in Claude's message, or half an hour when there is none), and the stopped agent goes on in its own session where it stopped, with any comments you made meanwhile. `status` shows until when it waits; to keep the limit for yourself when it lifts, stop the service. `max_jobs` in the settings sets how many agents work at once.
- **What the agents may do** is listed in `dispatch.py` (`AGENTS`); everything else is refused. The developer can run node and npm scripts, which is as good as any program, so it should run as a user that has nothing else. It cannot push, switch branches or use gh: the dispatcher does that.
- **Leftover files.** The developer can't delete files. What it leaves uncommitted after a build (a scratch test it measured with, say) is put aside by the dispatcher with `git stash` in the worktree, and listed under its result.
- **Players' text is untrusted.** The support agent only reads and answers in a fixed form; it cannot change files or run commands. Nothing a player wrote is built until you have approved the issue and its plan.
- **Releases from your Mac** still work the old way (README, "Releasing a version"), but don't mix the two for one version: the pipeline expects to make the version's commit on main itself.
