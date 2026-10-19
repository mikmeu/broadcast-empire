import { useState } from 'react';
import { STREAMING } from '../../config/balance';
import { closeStreaming, openStreaming, setStreamingPrice } from '../../sim/actions';
import { formatDate, toCalendarDate } from '../../sim/calendar';
import { formatPrice, priceError, roundPrice, serverRacks, streamingBlocker, streamingCosts, streamingTarget, subscriptionIncome, type StreamingTarget } from '../../sim/streaming';
import type { GameState } from '../../sim/state';
import { Meter, Panel } from '../components';
import { formatAmount, formatMoney, formatPercent } from '../format';
import { useGame, useGameStore } from '../store';

/** The streaming service (0.18.0): open it, set its price, and see what draws its subscribers. One column on a small screen. */
export function StreamingScreen() {
  const game = useGame();
  return (
    <div className="two-col">
      <div className="stack">
        {game.streaming ? <Service game={game} /> : <Opening game={game} />}
        {game.streaming && <Month game={game} />}
      </div>
      <Draws game={game} target={streamingTarget(game)} />
    </div>
  );
}

/** Before there is a service: what it takes, and the button that opens it at the price chosen. */
function Opening({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  const [price, setPrice] = useState<number>(STREAMING.price.start);
  const blocker = streamingBlocker(game);
  const target = streamingTarget(game, price);
  return (
    <Panel title="A streaming service" help="streaming">
      <p className="muted small">
        Offer your shows and the titles in your library on demand, for a monthly price. Your server racks carry it: {STREAMING.minRacks} at least, and
        each serves so many subscribers. People who stream go to the service that is worth most to them for its price.
      </p>
      <PriceField price={price} onChange={setPrice} />
      <p className="small">At this price, about <strong>{formatAmount(target.target)}</strong> people would subscribe today.</p>
      {blocker && <p className="muted small">{blocker}</p>}
      <button className="primary" data-guide="streaming" disabled={blocker !== null} title={blocker ?? undefined} onClick={() => run((s) => openStreaming(s, price))}>
        Open the service at {formatPrice(price)} a month
      </button>
    </Panel>
  );
}

/** The service as it runs: its subscribers, its price and the racks that serve them. */
function Service({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  const service = game.streaming!;
  const target = streamingTarget(game);
  const change = Math.round(service.subscribers) - Math.round(service.weekAgo);
  const trend = change === 0 ? 'flat' : change > 0 ? 'up better' : 'down worse';
  return (
    <Panel title="Your streaming service" help="streaming" actions={<span className="muted small">Open since {formatDate(service.since)}</span>}>
      <div className="row">
        <span className="big-number">{formatAmount(service.subscribers)}</span>
        <span className={`trend ${trend}`} role="img" aria-label={change === 0 ? 'unchanged since a week ago' : change > 0 ? 'up since a week ago' : 'down since a week ago'} />
        <span className="muted small">subscribers, heading for {formatAmount(target.target)}</span>
      </div>
      <PriceField price={service.price} onChange={(price) => run((s) => setStreamingPrice(s, price))} />
      <dl className="facts">
        <dt>Server racks</dt>
        <dd>{serverRacks(game).length}, serving up to {formatAmount(target.capacity)} subscribers</dd>
        <dt>Would subscribe</dt>
        <dd>{formatAmount(target.demand)}{target.demand > target.capacity ? ': more than your racks can serve' : ''}</dd>
      </dl>
      <button onClick={() => run((s) => closeStreaming(s))}>Close the service</button>
    </Panel>
  );
}

/** What the service earned and cost this month, and what it will at the rate it runs. */
function Month({ game }: { game: GameState }) {
  const costs = streamingCosts(game);
  return (
    <Panel title="The service’s money" help="money">
      <dl className="facts">
        <dt>Subscriptions this month</dt>
        <dd>{formatMoney(Math.round(game.ledger.subscriptions))}</dd>
        <dt>Running it this month</dt>
        <dd>{formatMoney(-Math.round(game.ledger.streaming))}</dd>
        <dt>A month at this rate</dt>
        <dd>{formatMoney(Math.round(subscriptionIncome(game)))} in, {formatMoney(Math.round(costs.subscribers + costs.titles))} out</dd>
      </dl>
      <p className="muted small">
        A subscriber costs {formatPrice(STREAMING.costPerSubscriber)} a month to serve, and every title on the service costs the price of one airing a month. Both are running costs.
      </p>
    </Panel>
  );
}

/** Why the service draws what it does: each part of its appeal as a meter, and the services it shares the market with. */
function Draws({ game, target }: { game: GameState; target: StreamingTarget }) {
  const { catalogue } = target;
  const { year } = toCalendarDate(game.day);
  const strongest = Math.max(target.appeal, ...target.rivals.map((r) => r.appeal), 0.01);
  return (
    <Panel title="What draws subscribers" help="streaming">
      <dl className="facts">
        <dt>Catalogue</dt>
        <dd>
          <span className="stat"><Meter value={target.size / STREAMING.maxSize} /> {catalogue.shows} shows, {catalogue.titles} titles</span>
        </dd>
        <dt>Quality</dt>
        <dd>
          <span className="stat"><Meter value={catalogue.quality} /> {formatPercent(catalogue.quality)}</span>
        </dd>
        <dt>Freshness</dt>
        <dd>
          <span className="stat"><Meter value={catalogue.freshness} /> {formatPercent(catalogue.freshness)}</span>
        </dd>
        <dt>Price</dt>
        <dd>
          <span className="stat"><Meter value={target.price} /> {formatPrice(game.streaming?.price ?? STREAMING.price.start)} against a fair {formatPrice(Math.round(target.fair * 100) / 100)}</span>
        </dd>
      </dl>
      <h3>Who people stream from</h3>
      <dl className="facts">
        <dt>{game.streaming ? 'Your service' : 'Yours, if it opened'}</dt>
        <dd><span className="stat"><Meter value={target.appeal / strongest} /> {formatPercent(target.share)} of them</span></dd>
        {target.rivals.map((rival) => (
          <RivalRow key={rival.name} name={rival.name} value={rival.appeal / strongest} />
        ))}
      </dl>
      <p className="muted small">
        {target.market < 1
          ? 'Nobody in Etheria pays for streaming yet.'
          : `About ${formatAmount(target.market)} people in Etheria pay for streaming in ${year}, and more every year.`}{' '}
        {target.rivals.length === 0 ? 'No other service is open yet.' : 'The meters compare each service’s appeal with the strongest.'}
      </p>
    </Panel>
  );
}

/** A rival service and its appeal against the strongest. */
function RivalRow({ name, value }: { name: string; value: number }) {
  return (
    <>
      <dt>{name}</dt>
      <dd><Meter value={value} tone="green" /></dd>
    </>
  );
}

/** A monthly price, with a button either side that takes it down or up a step; a typed price counts once it is one that can be asked. */
function PriceField({ price, onChange }: { price: number; onChange: (price: number) => void }) {
  const { min, max, step } = STREAMING.price;
  const [typed, setTyped] = useState<string | null>(null);
  const set = (value: number) => {
    setTyped(null);
    onChange(roundPrice(Math.min(max, Math.max(min, value))));
  };
  return (
    <div className="row price-field">
      <label htmlFor="streaming-price">Price a month</label>
      <button type="button" aria-label="Lower the price" disabled={price <= min} onClick={() => set(price - step)}>−</button>
      <input
        id="streaming-price"
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={typed ?? String(price)}
        onChange={(e) => {
          setTyped(e.target.value);
          const value = Number(e.target.value);
          if (e.target.value !== '' && priceError(value) === null) onChange(roundPrice(value));
        }}
        onBlur={() => setTyped(null)}
      />
      <button type="button" aria-label="Raise the price" disabled={price >= max} onClick={() => set(price + step)}>+</button>
      <span className="muted small">euros</span>
    </div>
  );
}
