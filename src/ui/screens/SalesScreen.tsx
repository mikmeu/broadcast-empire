import { useState } from 'react';
import { RELATIONS, SALES } from '../../config/balance';
import { AUDIENCES } from '../../config/world';
import { acceptOffer, cancelContract, declineOffer } from '../../sim/actions';
import { employeesWithDesk } from '../../sim/office';
import { hasFreeShow, pointsForLevel, relationOf, showForOffer, showListeners, showsForOffer, sponsorRate } from '../../sim/sales';
import { departmentPower } from '../../sim/staff';
import type { GameState, SponsorContract, SponsorOffer } from '../../sim/state';
import { Empty, Meter, Panel, Tag } from '../components';
import { formatCount, formatMoney } from '../format';
import { SponsorLogo } from '../SponsorLogo';
import { useGame, useGameStore } from '../store';

const audienceName = (id: string | null) => AUDIENCES.find((a) => a.id === id)?.name;
const ratePercent = (multiplier: number) => `+${Math.round((multiplier - 1) * 100)}%`;

export function SalesScreen() {
  const game = useGame();
  const desked = employeesWithDesk(game);
  const salesStaff = game.employees.filter((e) => e.role === 'sales');
  const power = departmentPower(game, 'sales', desked);
  const allTaken = game.shows.length > 0 && !hasFreeShow(game, 'radio') && !hasFreeShow(game, 'tv');

  return (
    <div className="two-col">
      <div className="stack">
        <Panel title="Sponsor offers" help="sponsors" actions={<span className="muted small">New offers every Monday</span>}>
          <p className="muted small">
            A sponsor pays a higher ad rate on one show. If the show’s average daily listeners over the contract fall
            below the minimum, you pay the penalty.
          </p>
          {salesStaff.length === 0 ? (
            <Empty>Hire sales staff on the Staff screen to receive sponsor offers.</Empty>
          ) : (
            <>
              {/* Sponsors only come for a show that has none: say so, or the empty list is a riddle. */}
              {allTaken && <Empty>Every show has a sponsor, so there are no new offers. They come again when a contract ends, or when you make a new show.</Empty>}
              {game.offers.length === 0 && !allTaken && <Empty>No offers right now. Your sales team brings about {power.toFixed(1)} a week.</Empty>}
              {game.offers.map((offer) => <OfferCard key={offer.id} game={game} offer={offer} />)}
            </>
          )}
        </Panel>
      </div>
      <div className="stack">
        <Panel title="Running contracts">
          {game.contracts.length === 0 ? (
            <Empty>No sponsored shows yet.</Empty>
          ) : (
            game.contracts.map((contract) => <ContractCard key={contract.id} game={game} contract={contract} />)
          )}
        </Panel>
        <Relations game={game} power={power} allTaken={allTaken} />
      </div>
    </div>
  );
}

/** How well the company knows a sponsor: its level, and how far along it is to the next. */
function RelationMeter({ game, sponsor }: { game: GameState; sponsor: string }) {
  const { level, points } = relationOf(game, sponsor);
  const top = level >= RELATIONS.levels;
  return (
    <div className="stat" title="Your sales staff work on this while a contract with the sponsor runs">
      Relationship · level {level}{' '}
      <Meter value={top ? 1 : points / pointsForLevel(level)} tone="yellow" label={top ? 'The highest level' : `${Math.floor(points)} of ${pointsForLevel(level)} points to level ${level + 1}`} />{' '}
      <span className="muted small">{top ? 'the highest level' : `level ${level + 1} pays ${ratePercent(sponsorRate(level + 1))}`}</span>
    </div>
  );
}

/** Every sponsor the company has worked with, and how well it knows each. */
function Relations({ game, power, allTaken }: { game: GameState; power: number; allTaken: boolean }) {
  const known = Object.keys(game.relations).sort((a, b) => game.relations[b]!.level - game.relations[a]!.level || a.localeCompare(b));
  const busy = new Set(game.contracts.map((c) => c.sponsor));
  return (
    <Panel title="Sponsors you know" help="sponsors">
      <p className="muted small">
        Your sales staff look after the sponsors under contract. A sponsor you know better pays more: {ratePercent(sponsorRate(1))} on the normal ad rate at level 1, up to {ratePercent(sponsorRate(RELATIONS.levels))} at
        level {RELATIONS.levels}.
        {busy.size > 0 && power > 0 && ` They earn ${((power * (allTaken ? RELATIONS.fullTime : 1)) / busy.size).toFixed(1)} points a day for each of them${allTaken ? ', with no offers to chase' : ''}.`}
      </p>
      {known.length === 0 ? (
        <Empty>Nobody yet. It starts with a first contract.</Empty>
      ) : (
        known.map((sponsor) => (
          <div key={sponsor} className="relation">
            <span className="sponsor-title">
              <SponsorLogo sponsor={sponsor} />
              {sponsor} {busy.has(sponsor) ? <Tag tone="good">Under contract</Tag> : <Tag>No contract now</Tag>}
            </span>
            <RelationMeter game={game} sponsor={sponsor} />
          </div>
        ))
      )}
    </Panel>
  );
}

function Terms({ offer }: { offer: SponsorOffer | SponsorContract }) {
  return (
    <dl className="terms">
      <div>
        <dt>Ad rate</dt>
        <dd>{ratePercent(offer.cpmMultiplier)}</dd>
      </div>
      {offer.preferredAudience && (
        <div>
          <dt>Bonus audience</dt>
          <dd>
            {audienceName(offer.preferredAudience)} ×{SALES.preferredAudienceBonus}
          </dd>
        </div>
      )}
      <div>
        <dt>Minimum</dt>
        <dd>{formatCount(offer.minListeners)} {offer.medium === 'tv' ? 'viewers' : 'listeners'}/day</dd>
      </div>
      <div>
        <dt>Length</dt>
        <dd>{offer.weeks} weeks</dd>
      </div>
      <div>
        <dt>Penalty</dt>
        <dd>{formatMoney(offer.penalty)}</dd>
      </div>
    </dl>
  );
}

function OfferCard({ game, offer }: { game: GameState; offer: SponsorOffer }) {
  const run = useGameStore((s) => s.run);
  const listeners = game.lastDay ? showListeners(game.lastDay) : new Map<string, number>();
  // Only shows in the sponsor's medium, without a sponsor yet. A show that was picked here and has since
  // gone to another sponsor makes way for the best one that is still free.
  const free = showsForOffer(game, offer);
  const [picked, setShowId] = useState<string | null>(null);
  const showId = showForOffer(game, offer, picked) ?? '';
  const chosen = listeners.get(showId) ?? 0;

  return (
    <article className="deal-card">
      <header>
        <h3 className="sponsor-title">
          <SponsorLogo sponsor={offer.sponsor} />
          {offer.sponsor} <Tag>{offer.medium === 'tv' ? 'TV' : 'Radio'}</Tag>
          {game.relations[offer.sponsor] && <Tag tone="good">You know them · level {relationOf(game, offer.sponsor).level}</Tag>}
        </h3>
        <span className="muted small">expires in {offer.expiresOn - game.day} days</span>
      </header>
      <Terms offer={offer} />
      {free.length === 0 ? (
        <div className="row">
          <Tag tone="warning">Every {offer.medium === 'tv' ? 'TV' : 'radio'} show has a sponsor already: this offer has no show to go to</Tag>
          <button className="link" onClick={() => run((s) => declineOffer(s, offer.id))}>Decline</button>
        </div>
      ) : (
        <div className="row">
          <select value={showId} onChange={(e) => setShowId(e.target.value)} aria-label={`Show for ${offer.sponsor}`}>
            <option value="" disabled>Choose a show…</option>
            {free.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {formatCount(listeners.get(s.id) ?? 0)} yesterday
              </option>
            ))}
          </select>
          <button className="primary" data-guide="accept-offer" disabled={!showId} onClick={() => run((s) => acceptOffer(s, offer.id, showId))}>
            Accept
          </button>
          <button className="link" onClick={() => run((s) => declineOffer(s, offer.id))}>Decline</button>
        </div>
      )}
      {showId && chosen < offer.minListeners && (
        <Tag tone="warning">This show had {formatCount(chosen)} {offer.medium === 'tv' ? 'viewers' : 'listeners'} yesterday, below the minimum</Tag>
      )}
    </article>
  );
}

function ContractCard({ game, contract }: { game: GameState; contract: SponsorContract }) {
  const run = useGameStore((s) => s.run);
  const show = game.shows.find((s) => s.id === contract.showId);
  const average = contract.daysRun > 0 ? contract.listenerSum / contract.daysRun : 0;
  const onTrack = average >= contract.minListeners;

  return (
    <article className="deal-card">
      <header>
        <h3 className="sponsor-title">
          <SponsorLogo sponsor={contract.sponsor} />
          {contract.sponsor} <span className="muted">· {show?.name}</span>
        </h3>
        <span className="muted small">{contract.endDay - game.day} days left</span>
      </header>
      <Terms offer={contract} />
      <RelationMeter game={game} sponsor={contract.sponsor} />
      <div className="stat">
        Average so far <Meter value={Math.min(1, average / contract.minListeners)} tone={onTrack ? 'green' : 'accent'} />{' '}
        {formatCount(average)} of {formatCount(contract.minListeners)}
        {contract.daysRun > 0 && (onTrack ? <Tag tone="good">On track</Tag> : <Tag tone="danger">Below minimum</Tag>)}
      </div>
      <button
        className="link danger"
        onClick={() =>
          window.confirm(`Cancel the ${contract.sponsor} contract? You pay the ${formatMoney(contract.penalty)} penalty.`) &&
          run((s) => cancelContract(s, contract.id))
        }
      >
        Cancel contract
      </button>
    </article>
  );
}
