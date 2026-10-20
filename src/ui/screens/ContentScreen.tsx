import { useState } from 'react';
import { GENRES, getGenre, type GenreId } from '../../config/genres';
import { EVENTS, SPORTS_RIGHTS } from '../../config/balance';
import { airingPrice, buyRights, buyTitle, discardTitle, placeRightsBid, rightsPrice, titlePrice, withdrawRightsBid } from '../../sim/actions';
import { formatDate } from '../../sim/calendar';
import { libraryCapacity, postRoomNeeded } from '../../sim/content';
import { eventRightsHolder, nextSportsEvent } from '../../sim/events';
import { PLAYER, type GameState, type RightsAuction } from '../../sim/state';
import { Empty, Meter, Panel, Tag } from '../components';
import { formatMoney, formatPercent } from '../format';
import { useGame, useGameStore } from '../store';

/** Licensed TV genres that have titles on the market this month. */
const LICENSED = GENRES.filter((g) => g.kind === 'licensed');

export function ContentScreen() {
  const game = useGame();
  return (
    <div className="two-col">
      <MarketPanel game={game} />
      <div className="stack">
        <EventRightsPanel game={game} />
        <LibraryPanel game={game} />
        <SportsPanel game={game} />
      </div>
    </div>
  );
}

function MarketPanel({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  const genres = LICENSED.filter((g) => game.market.titles.some((t) => t.genre === g.id));
  const [genre, setGenre] = useState<GenreId>(genres[0]?.id ?? 'movies');
  const titles = game.market.titles.filter((t) => t.genre === genre).sort((a, b) => b.quality - a.quality);
  const capacity = libraryCapacity(game);
  const noPost = postRoomNeeded(game);

  return (
    <Panel title="Content market" help="content-market">
      <p className="muted small">
        Licensed titles for TV: each comes with a number of airings. A library program on your schedule airs one title a
        day, and a title gets stale if it airs too often. Nothing is paid when you buy: each airing is paid on the day it
        airs. New titles arrive on the 1st of every month; what you don’t buy goes to other broadcasters.
      </p>
      {noPost ? (
        <Empty>The titles come by post: set up a post room with a sorting case on the Office screen before buying titles.</Empty>
      ) : (
        capacity === 0 && <Empty>Set up a library with shelving on the Office screen before buying titles.</Empty>
      )}
      {genres.length > 1 && (
        <div className="segmented" role="tablist" aria-label="Genre">
          {genres.map((g) => (
            <button key={g.id} role="tab" data-guide={`market-${g.id}`} aria-selected={g.id === genre} className={g.id === genre ? 'active' : undefined} onClick={() => setGenre(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
      )}
      {titles.length === 0 ? (
        <Empty>Nothing left this month.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Quality</th>
                <th scope="col" className="num">Airings</th>
                <th scope="col" className="num">Per airing</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {titles.map((t) => (
                <tr key={t.id}>
                  <th scope="row">
                    {t.name}
                    {t.fee > 0 && <div className="muted small">Pays {formatMoney(t.fee)} per airing</div>}
                  </th>
                  <td>
                    <span className="stat">
                      <Meter value={t.quality} label={`Quality ${formatPercent(t.quality)}`} /> {formatPercent(t.quality)}
                    </span>
                  </td>
                  <td className="num">{t.airings}</td>
                  <td className="num">
                    {t.price > 0 ? formatMoney(airingPrice(game, t)) : 'Free'}
                    {t.price > 0 && <div className="muted small">{formatMoney(titlePrice(game, t.price))} in all</div>}
                  </td>
                  <td className="num">
                    <button className="primary" data-guide={`buy-${t.genre}`} disabled={noPost || capacity === 0} onClick={() => run((s) => buyTitle(s, t.id))}>
                      Buy
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function LibraryPanel({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  const capacity = libraryCapacity(game);
  const titles = [...game.library].sort((a, b) => a.genre.localeCompare(b.genre) || b.quality - a.quality);
  return (
    <Panel title="Your library" actions={<span className="muted small">{game.library.length} of {capacity} shelf places</span>}>
      {titles.length === 0 ? (
        <Empty>No titles yet.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Freshness</th>
                <th scope="col" className="num">Airings</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {titles.map((t) => (
                <tr key={t.id}>
                  <th scope="row">
                    {t.name}
                    <div className="muted small">
                      {getGenre(t.genre).name} · quality {formatPercent(t.quality)}
                      {t.perAiring > 0 && ` · ${formatMoney(t.perAiring)} an airing`}
                    </div>
                  </th>
                  <td>
                    <span className="stat">
                      <Meter value={t.freshness} tone="yellow" label={`Freshness ${formatPercent(t.freshness)}`} /> {formatPercent(t.freshness)}
                    </span>
                  </td>
                  <td className="num">{t.airingsLeft}</td>
                  <td className="num">
                    <button
                      className="link danger"
                      onClick={() => window.confirm(`Throw “${t.name}” out of the library? Its airings that are left go back to the distributor.`) && run((s) => discardTitle(s, t.id))}
                    >
                      Discard
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Titles recover freshness on the days they don’t air. Used-up titles leave the library.</p>
    </Panel>
  );
}

/** The next World Cup or Olympics: who has its TV rights, and the sealed-bid auction for them. */
function EventRightsPanel({ game }: { game: GameState }) {
  const event = nextSportsEvent(game.day);
  const holder = eventRightsHolder(game, event);
  const auction = game.rightsAuctions.find((a) => a.eventId === event.id);
  const boost = Math.round((EVENTS.sportsAppeal - 1) * 100);
  const hasSportsShow = game.shows.some((s) => s.genre === 'tvSports' && game.channels.some((c) => c.schedule.includes(s.id)));
  const auctionOpens = event.startDay - EVENTS.auctionLeadDays;

  return (
    <Panel title="Event rights" help="sports-rights" actions={<span className="muted small">{event.name} · {formatDate(event.startDay).slice(4)} – {formatDate(event.endDay - 1).slice(4)}</span>}>
      <p className="muted small">
        During a World Cup or the Olympics, sports shows are {boost}% more appealing: on radio for everyone, on TV only for
        the broadcaster that wins the event’s rights. A rival that wins shows the event live in the evening.
      </p>
      {holder === PLAYER ? (
        <div className="row">
          <Tag tone="good">You hold the TV rights</Tag>
          {hasSportsShow ? (
            <span className="muted small">Your TV sports shows show the event while it is on.</span>
          ) : (
            <Tag tone="warning">Schedule a TV sports show to use them</Tag>
          )}
        </div>
      ) : holder ? (
        <Tag tone="warning">{game.rivals.find((r) => r.id === holder)?.name ?? 'A rival'} holds the TV rights</Tag>
      ) : auction ? (
        <RightsAuctionRow key={auction.id} game={game} auction={auction} />
      ) : game.day < auctionOpens ? (
        <Empty>The TV rights go to auction on {formatDate(auctionOpens)}.</Empty>
      ) : (
        <Empty>Nobody holds the TV rights to this event.</Empty>
      )}
    </Panel>
  );
}

function RightsAuctionRow({ game, auction }: { game: GameState; auction: RightsAuction }) {
  const run = useGameStore((s) => s.run);
  const [amount, setAmount] = useState(String(auction.bid ?? auction.reserve));
  return (
    <article className="deal-card">
      <header>
        <h3>TV rights · {auction.name}</h3>
        <span className="muted small">Closes {formatDate(auction.endsOn)}</span>
      </header>
      <div className="row muted small">
        <span>Reserve {formatMoney(auction.reserve)}</span>·
        <span>{auction.interested === 0 ? 'No rival has a TV channel yet' : `${auction.interested} rival${auction.interested === 1 ? '' : 's'} may bid`}</span>·
        <span>Sealed bids: you only pay if you win</span>
      </div>
      {auction.bid !== null && (
        <div className="row">
          <Tag tone="good">Your bid: {formatMoney(auction.bid)}</Tag>
          <button className="link danger" onClick={() => run((s) => withdrawRightsBid(s, auction.id))}>Withdraw</button>
        </div>
      )}
      {!game.channels.some((c) => c.medium === 'tv') && <p className="muted small">You have no TV channel to show the event on.</p>}
      <form
        className="row bid-form"
        onSubmit={(e) => {
          e.preventDefault();
          run((s) => placeRightsBid(s, auction.id, Number(amount)));
        }}
      >
        <label>
          Bid €{' '}
          <input type="number" min={auction.reserve} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <button className="primary" type="submit">{auction.bid !== null ? 'Change bid' : 'Place bid'}</button>
      </form>
    </article>
  );
}

function SportsPanel({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  const held = game.sportsRights.filter((r) => r.endDay > game.day);
  return (
    <Panel title="Sports rights" help="sports-rights">
      <p className="muted small">
        With broadcast rights a TV sports show shows the games. Without any it can only talk about sport (×{SPORTS_RIGHTS.talkOnly.toFixed(2)} appeal). Better competitions draw more.
      </p>
      {held.map((r) => (
        <div key={r.id} className="row">
          <Tag tone="good">{r.name}</Tag>
          <span className="muted small">
            ×{r.prestige.toFixed(2)} appeal · until {formatDate(r.endDay)}
          </span>
        </div>
      ))}
      {game.market.rights.length === 0 ? (
        <Empty>No rights for sale this month.</Empty>
      ) : (
        game.market.rights.map((r) => (
          <article key={r.id} className="deal-card">
            <header>
              <h3>{r.name}</h3>
              <span className="muted small">{r.months} months</span>
            </header>
            <div className="row muted small">
              <span>×{r.prestige.toFixed(2)} appeal for sports shows</span>·<span>{formatMoney(rightsPrice(game, r.price))}</span>
            </div>
            <button className="primary" onClick={() => run((s) => buyRights(s, r.id))}>Buy rights</button>
          </article>
        ))
      )}
    </Panel>
  );
}
