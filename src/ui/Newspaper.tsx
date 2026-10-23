import { useEffect } from 'react';
import { formatDate } from '../sim/calendar';
import { Icon } from './Icon';
import { issueNumber, type Paper } from './paper';
import { useGameStore } from './store';

/** How long a paper stays up when nobody touches it. */
const PAPER_MS = 8000;

/**
 * The news, as a small newspaper in the bottom right corner (#129): the title,
 * the date and issue number, the headlines, and grey bars where the text would
 * be, so that only the headlines can be read. It goes by itself, or on a click.
 */
export function Newspaper() {
  const paper = useGameStore((s) => s.paper);
  if (!paper) return null;
  return <Sheet key={paper.day} paper={paper} />;
}

function Sheet({ paper }: { paper: Paper }) {
  const close = () => useGameStore.setState({ paper: undefined });
  useEffect(() => {
    const timer = setTimeout(close, PAPER_MS);
    return () => clearTimeout(timer);
  }, []);

  const [first, ...more] = paper.headlines;
  return (
    <aside className="newspaper" role="status" aria-live="polite" onClick={close}>
      <button className="window-button newspaper-close" onClick={close} aria-label="Put the newspaper away" title="Put it away">
        <Icon name="close-button" size={14} />
      </button>
      <h2 className="newspaper-title">The Media Times</h2>
      <div className="newspaper-rule">
        <span>{formatDate(paper.day)}</span>
        <span>No. {issueNumber(paper.day).toLocaleString('en-GB')}</span>
      </div>
      {first && <p className="newspaper-headline">{first.text}</p>}
      <Bars rows={3} />
      {more.map((h) => (
        <div key={h.text}>
          <p className="newspaper-minor">{h.text}</p>
          <Bars rows={1} />
        </div>
      ))}
    </aside>
  );
}

/** Grey bars standing for text nobody is meant to read. */
function Bars({ rows }: { rows: number }) {
  return (
    <div className="newspaper-bars" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} style={{ width: i === rows - 1 ? '62%' : '100%' }} />
      ))}
    </div>
  );
}
