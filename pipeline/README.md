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

1. **Gmail:** make an account for the game, for example broadcastempire.support@gmail.com. Turn on two-step verification, then make an app password (Google Account, Security, App passwords). Turn on IMAP in Gmail's settings.
2. **Namecheap:** in Domain List, broadcastempire.online, Redirect Email: forward `support` to that Gmail address. The forwarding is there already (the MX records point at it).
3. **Gmail, "Send mail as":** add `support@broadcastempire.online`, with smtp.gmail.com, port 465, the Gmail address and the app password. Gmail sends a code to support@, which the forwarding brings back to Gmail. Then add `include:_spf.google.com` to the SPF record in Namecheap, so the mail isn't taken for spam: `v=spf1 include:spf.efwd.registrar-servers.com include:_spf.google.com ~all`.
4. **GitHub, the bot:** sign out, make an account for the agents (for example `broadcastempire-bot`, with the Gmail address). GitHub allows one free machine account per person. As yourself, invite it to the repository (Settings, Collaborators, write access).
5. **GitHub, you:** in Settings, Notifications, choose e-mail for "Participating, @mentions and custom" and "Watching", with mike@mvdm.media as the address; on the repository, Watch, All activity. Then a reply to a notification mail becomes your comment on the issue.
6. **ElevenLabs:** the API key (Profile, API keys) and the voice ids of Penny and Uncle Tabby (Voices, the voice, its id). If you know the settings they were recorded with (stability, similarity), note those too.

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
graphify .                                           # the graph, once (or copy graphify-out/ from your Mac)
git config user.name broadcastempire-bot
git config user.email <the bot's e-mail address>

mkdir -p ~/.config/broadcast-empire
cp pipeline/pipeline.example.toml ~/.config/broadcast-empire/pipeline.toml
chmod 600 ~/.config/broadcast-empire/pipeline.toml
nano ~/.config/broadcast-empire/pipeline.toml        # the project number, the mailbox, ElevenLabs

python3 pipeline/dispatch.py check                   # gh as the bot, the board, claude, the mailbox
```

Copy what the agents may read but that is not in the repository, from your Mac: `lore.md` and `website.md` into `~/broadcast-empire/`, and `design/references/` (it stays out of git: add `design/references/` to `.git/info/exclude` on the server too).

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

- **The agents share your Claude usage limits** with your own sessions. When the limit is reached the pipeline waits half an hour and goes on. `max_jobs` in the settings sets how many agents work at once.
- **What the agents may do** is listed in `dispatch.py` (`AGENTS`); everything else is refused. The developer can run node and npm scripts, which is as good as any program, so it should run as a user that has nothing else. It cannot push, switch branches or use gh: the dispatcher does that.
- **Players' text is untrusted.** The support agent only reads and answers in a fixed form; it cannot change files or run commands. Nothing a player wrote is built until you have approved the issue and its plan.
- **Releases from your Mac** still work the old way (README, "Releasing a version"), but don't mix the two for one version: the pipeline expects to make the version's commit on main itself.
