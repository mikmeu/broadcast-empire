#!/usr/bin/env bash
# Decides whether the long tests (*.long.test.ts) run for this push: the "changes" job of test.yml.
# Prints run=true or run=false (to $GITHUB_OUTPUT when it is set). In any doubt the answer is true.
#
#   issue/<n>-<name>  the whole branch against the next/<version> branch it was made from (the one it is
#                     fewest commits ahead of), so a docs commit after a commit to src/sim hides nothing
#   next/<version>    against the commit of the branch's last green run (a cancelled or failed run is no
#                     starting point, so what it left unplayed is made up on the next push)
#   anything else     true (a run by hand, say)
#
# Needs the full history (fetch-depth: 0). On the second kind it needs GH_TOKEN, for `gh run list`.

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mapfile -t paths < <(grep -v -e '^#' -e '^[[:space:]]*$' "$here/long-tests-paths.txt")

say() {
  echo "long tests: $2 ($1)" >&2
  echo "run=$2" >> "${GITHUB_OUTPUT:-/dev/null}"
  echo "run=$2"
  exit 0
}

# Do the paths changed since $1 include any of the long tests' paths? Any failure counts as yes.
touched() {
  local files
  files="$(git diff --name-only "$1" HEAD -- "${paths[@]}")" || say "git diff failed against $1" true
  if [ -n "$files" ]; then
    say "changed: $(echo "$files" | head -3 | tr '\n' ' ')" true
  fi
  say "nothing the long tests run on changed since ${1:0:12}" false
}

branch="${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD)}"

if [ "${GITHUB_EVENT_NAME:-}" = workflow_dispatch ]; then
  say "run by hand" true
fi

case "$branch" in
  issue/*)
    base=""
    best=""
    while read -r ref; do
      ahead="$(git rev-list --count "$ref..HEAD")" || continue
      if [ -z "$best" ] || [ "$ahead" -lt "$best" ]; then best="$ahead"; base="$ref"; fi
    done < <(git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/next/*')
    [ -n "$base" ] || say "no next/* branch found" true
    # From where the branches parted (as `git diff base...HEAD` does), so what the version branch has since is not counted.
    touched "$(git merge-base "$base" HEAD)"
    ;;
  next/*)
    sha="$(gh run list --workflow test.yml --branch "$branch" --status success --limit 1 --json headSha --jq '.[0].headSha // empty')" \
      || say "could not read the earlier runs" true
    [ -n "$sha" ] || say "no earlier green run of $branch" true
    git cat-file -e "$sha^{commit}" 2>/dev/null || say "$sha is no longer in the history" true
    touched "$sha"
    ;;
  *)
    say "branch $branch" true
    ;;
esac
