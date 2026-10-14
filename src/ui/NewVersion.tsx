// A newer version of the game (0.13.0): asked of the desktop app once a
// session, if the player has not switched it off, and shown on the home screen.

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { desktop, type NewVersion } from '../persistence/desktop';
import { useGameStore } from './store';

let asked: Promise<NewVersion | null> | null = null;

/** The newer version, once the desktop app has answered; null in a browser, when switched off, or when this is the newest. */
export function useNewVersion(): NewVersion | null {
  const check = useGameStore((s) => s.settings.checkUpdates);
  const [found, setFound] = useState<NewVersion | null>(null);
  useEffect(() => {
    if (!check || !desktop?.latestVersion) return;
    asked ??= desktop.latestVersion().catch(() => null);
    let live = true;
    void asked.then((answer) => live && setFound(answer));
    return () => {
      live = false;
    };
  }, [check]);
  return check ? found : null;
}

/** **Bold** in a line of the changelog. */
function inline(text: string): ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}

/** The changelog's Markdown as the game shows it: version headings, the headings of their parts, lists and paragraphs. */
function Changes({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length) blocks.push(<ul key={blocks.length}>{items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>);
    items = [];
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) {
      items.push(line.slice(2));
      continue;
    }
    flush();
    if (line.startsWith('## ')) blocks.push(<h3 key={blocks.length}>Alpha {line.slice(3)}</h3>);
    else if (/^\*\*[^*]+\*\*$/.test(line.trim())) blocks.push(<h4 key={blocks.length}>{line.trim().slice(2, -2)}</h4>);
    else if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="new-version-changes">{blocks}</div>;
}

/** What is new in the newer version, and the way to get it. */
export function NewVersionPanel({ found }: { found: NewVersion }) {
  return (
    <div className="stack">
      <p>
        Alpha {found.version} is out. Your saves go along with it: a new version reads the games of an older one.
      </p>
      <div className="row">
        {/* The desktop app opens it in the browser. */}
        <button className="primary" onClick={() => window.open(found.url, '_blank', 'noopener')}>
          Download Alpha {found.version}
        </button>
      </div>
      {found.changes ? <Changes text={found.changes} /> : <p className="muted small">What changed is on the website.</p>}
      <p className="muted small">This check can be switched off in the settings.</p>
    </div>
  );
}
