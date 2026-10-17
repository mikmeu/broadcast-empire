#!/usr/bin/env bash
# Sets up GitHub for the pipeline, once: the labels, and the project "Broadcast Empire" with its
# fields. Run it as Mike, with the project scope: gh auth refresh -s project
# Running it again changes nothing that is there already.
set -euo pipefail
REPO=mikmeu/broadcast-empire
OWNER=mikmeu

label() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null; echo "label: $1"; }
label "bug" d73a4a "Something is wrong"
label "feature" 6631d2 "Something new that fits the game as it is"
label "big feature" 3c199b "Needs a design of its own first"
label "balancing" f2b84b "Costs, incomes, difficulty"
label "content" b0a2f2 "The wiki, the lore, Penny's words"
label "art & sound" e58fb0 "Models, rooms, sounds, music, voice"
label "interface" 5bc0de "Windows, controls, readability"
label "performance" 0e8a16 "Speed and smoothness"
label "release" 452a65 "Installers, the website, platforms"
label "choice" fbca04 "Built one way: yours to confirm or change"
label "question" cccccc "Not a request: support answers it"
for p in critical high medium low; do label "priority: $p" ededed "Priority $p"; done
for s in XS S M L XL; do label "size: $s" f7f5ff "Size $s (see PIPELINE.md)"; done
label "needs: Mike" ff6f61 "Waits for you"
label "from: player" c5def5 "Came in from a player"
label "from: Mike" c5def5 "Came in from Mike"
label "bundle" 000000 "The release issue of a version"

NUMBER=$(gh project list --owner "$OWNER" --format json --jq '.projects[] | select(.title == "Broadcast Empire") | .number' | head -1)
if [ -z "$NUMBER" ]; then
  NUMBER=$(gh project create --owner "$OWNER" --title "Broadcast Empire" --format json --jq .number)
  echo "project: made number $NUMBER"
fi
gh project link "$NUMBER" --owner "$OWNER" --repo "$REPO" >/dev/null 2>&1 || true
FIELDS=$(gh project field-list "$NUMBER" --owner "$OWNER" --format json --jq '.fields[].name')
field() {
  if grep -qx "$1" <<<"$FIELDS"; then echo "field: $1 is there"; return; fi
  if [ -n "${3:-}" ]; then
    gh project field-create "$NUMBER" --owner "$OWNER" --name "$1" --data-type "$2" --single-select-options "$3" >/dev/null
  else
    gh project field-create "$NUMBER" --owner "$OWNER" --name "$1" --data-type "$2" >/dev/null
  fi
  echo "field: $1"
}
field Stage SINGLE_SELECT "Inbox,In review,Backlog,Planning,Plan review,Ready to build,Building,Result review,Ready to release,Released,On hold"
field Priority SINGLE_SELECT "Critical,High,Medium,Low"
field Size SINGLE_SELECT "XS,S,M,L,XL"
field Estimate TEXT

echo
echo "The project is number $NUMBER: put that in project_number in the pipeline's settings."
echo "By hand, once, on https://github.com/users/$OWNER/projects/$NUMBER :"
echo "  - a Board view grouped by Stage (View options, Column by: Stage), showing Priority, Size, Estimate and Milestone;"
echo "  - Settings, Manage access: invite the bot account as a writer."
