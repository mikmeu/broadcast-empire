import { useEffect } from 'react';
import { MAX_MESSAGES } from '../../config/balance';
import { readAllMessages, readMessage } from '../../sim/actions';
import { formatDate } from '../../sim/calendar';
import { addressOf, letterOf, priorityOf, subjectOf, unreadCount, yourAddress, type Priority } from '../../sim/inbox';
import type { GameState, Message } from '../../sim/state';
import type { ScreenProps } from '../App';
import { SenderAvatar } from '../Avatar';
import { HelpLink } from '../HelpLink';
import { Empty } from '../components';
import { useInbox, type InboxFilter } from '../inbox';
import { useGame, useGameStore } from '../store';

const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'high', label: 'High' },
];

const PRIORITY_NAMES: Record<Priority, string> = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' };

const shows = (filter: InboxFilter) => (m: Message) => (filter === 'unread' ? !m.read : filter === 'high' ? priorityOf(m) === 'high' : true);

/** The mark beside an e-mail that matters: red for high, amber for medium; low has none. */
function PriorityMark({ message }: { message: Message }) {
  const priority = priorityOf(message);
  if (priority === 'low') return null;
  return <span className={`priority ${priority}`} role="img" aria-label={PRIORITY_NAMES[priority]} title={PRIORITY_NAMES[priority]} />;
}

/**
 * The inbox (0.17.0): every message of the simulation as an e-mail to you, the
 * CEO, from whoever in the company it is about. The list is on the left and the
 * e-mail on the right; on a narrow screen, one or the other.
 */
export function InboxScreen({ onGo, labelOf }: ScreenProps) {
  const game = useGame();
  const { open, filter, read, setFilter } = useInbox();
  const run = useGameStore((s) => s.run);
  const mail = [...game.messages].reverse();
  const listed = mail.filter(shows(filter));
  const message = game.messages.find((m) => m.id === open);
  const unread = unreadCount(game);

  // An e-mail that is open has been read.
  useEffect(() => {
    if (message && !message.read) run((s) => readMessage(s, message.id));
  }, [message?.id, message?.read]);

  return (
    <div className={message ? 'inbox reading' : 'inbox'}>
      <section className="inbox-list" aria-label="E-mails">
        <div className="inbox-tools">
          <div className="segmented" role="tablist" aria-label="Show">
            {FILTERS.map((f) => (
              <button key={f.id} role="tab" aria-selected={f.id === filter} className={f.id === filter ? 'active' : undefined} onClick={() => setFilter(f.id)}>
                {f.label}
                {f.id === 'unread' && unread > 0 ? ` (${unread})` : ''}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => run(readAllMessages)} disabled={unread === 0}>
            Mark all as read
          </button>
          <HelpLink article="inbox" />
        </div>
        {listed.length === 0 ? (
          <Empty>{mail.length === 0 ? 'No e-mail yet. Your staff write when there is news.' : filter === 'unread' ? 'Nothing unread.' : 'Nothing of high priority.'}</Empty>
        ) : (
          <ul className="inbox-mails">
            {listed.map((m) => (
              <li key={m.id}>
                <button type="button" data-sound="tab" className={['inbox-entry', m.read ? '' : 'unread', m.id === open ? 'active' : ''].filter(Boolean).join(' ')} aria-current={m.id === open ? 'true' : undefined} onClick={() => read(m.id)}>
                  <SenderAvatar sender={m.from} size={36} />
                  <span className="inbox-entry-text">
                    <span className="inbox-entry-top">
                      <span className="inbox-from">{m.from.name}</span>
                      <span className="muted small">{formatDate(m.day)}</span>
                    </span>
                    <span className="inbox-subject">
                      <PriorityMark message={m} />
                      {subjectOf(m.text)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">The last {MAX_MESSAGES} e-mails are kept.</p>
      </section>
      <section className="inbox-mail" aria-label="E-mail">
        {message ? <Mail game={game} message={message} onBack={() => read(null)} onGo={onGo} labelOf={labelOf} /> : <Empty>Pick an e-mail on the left to read it.</Empty>}
      </section>
    </div>
  );
}

function Mail({ game, message, onBack, onGo, labelOf }: { game: GameState; message: Message; onBack: () => void } & Pick<ScreenProps, 'onGo' | 'labelOf'>) {
  const { from, about } = message;
  const priority = priorityOf(message);
  return (
    <article>
      <button type="button" className="inbox-back" onClick={onBack}>
        ‹ Back
      </button>
      <h2 className="inbox-title">{subjectOf(message.text)}</h2>
      <div className="inbox-head">
        <SenderAvatar sender={from} size={56} />
        <dl>
          <div>
            <dt>From</dt>
            <dd>
              <strong>{from.name}</strong> <span className="muted">· {from.title}</span>
              <br />
              <span className="inbox-address">{addressOf(from, game.companyName)}</span>
            </dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>
              {game.playerName} <span className="muted">· CEO</span>
              <br />
              <span className="inbox-address">{yourAddress(game)}</span>
            </dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>
              {formatDate(message.day)}
              {priority !== 'low' && (
                <>
                  {' · '}
                  <PriorityMark message={message} /> {PRIORITY_NAMES[priority]}
                </>
              )}
            </dd>
          </div>
        </dl>
      </div>
      <div className="inbox-body">
        {letterOf(game, message).map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
      {about && (
        <button type="button" className="primary" onClick={() => onGo(about)}>
          Open {labelOf(about)}
        </button>
      )}
    </article>
  );
}
