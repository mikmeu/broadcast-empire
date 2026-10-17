#!/usr/bin/env python3
"""Moves the requests in REQUESTS.md to GitHub: one issue each, with its kind and priority, on the
board in the Backlog. Once, when the pipeline starts.

    python3 pipeline/import-requests.py          show what would be made
    python3 pipeline/import-requests.py --go     make the issues

It uses the pipeline's settings (see dispatch.py) and skips a request that already has an issue
(one whose title ends in "(R74)").
"""

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from dispatch import GitHub, Settings  # noqa: E402

KIND = {'feature': 'feature', 'fix': 'bug', 'choice': 'choice', 'release': 'release'}


def requests(text: str):
    priority = None
    for line in text.splitlines():
        heading = re.match(r'^## (High|Medium|Low)\s*$', line)
        if heading:
            priority = heading[1].lower()
            continue
        if line.startswith('## '):
            priority = None
        row = re.match(r'^\| (R\d+) \| (\w+) \| (.*) \| (.*) \|$', line)
        if priority and row:
            number, kind, request, notes = row.groups()
            bold = re.match(r'\*\*(.+?)\*\*\s*(.*)', request)
            title, rest = (bold[1], bold[2]) if bold else (request, '')
            if title.endswith(','):
                # The bold part runs on into the sentence: the body gets the whole of it.
                rest = f'**{title}** {rest}'
            yield {'r': number, 'kind': KIND.get(kind, 'feature'), 'priority': priority,
                   'title': f'{title.rstrip(".:,")} ({number})',
                   'body': '\n\n'.join(part for part in (rest, f'**Notes:** {notes}' if notes.strip() else '',
                                                        f'*Was {number} in REQUESTS.md, as {kind}, priority {priority}.*') if part)}


def main() -> None:
    go = '--go' in sys.argv
    root = Path(__file__).parent.parent
    found = list(requests((root / 'REQUESTS.md').read_text()))
    settings = Settings(Path(os.environ.get('BROADCAST_EMPIRE_PIPELINE', '~/.config/broadcast-empire/pipeline.toml')).expanduser())
    gh = GitHub(settings)
    titles = {issue['title'] for issue in gh.json('issue', 'list', '--repo', settings.repo, '--state', 'all', '--limit', '2000', '--json', 'title')}
    todo = [r for r in found if not any(t.endswith(f'({r["r"]})') for t in titles)]
    print(f'{len(found)} requests in REQUESTS.md, {len(found) - len(todo)} on GitHub already, {len(todo)} to make.')
    if go:
        gh.load_project()
    for r in sorted(todo, key=lambda r: int(r['r'][1:])):
        print(f'  {r["r"]:5} {r["kind"]:8} {r["priority"]:7} {r["title"]}')
        if not go:
            continue
        number, url = gh.create_issue(r['title'], r['body'], [r['kind'], f'priority: {r["priority"]}'])
        item = gh.add_item(url)
        gh.set_field(item, 'Stage', 'Backlog')
        gh.set_field(item, 'Priority', r['priority'].capitalize())
        print(f'        → #{number}')
    if not go and todo:
        print('Nothing was made; add --go to make them.')


if __name__ == '__main__':
    main()
