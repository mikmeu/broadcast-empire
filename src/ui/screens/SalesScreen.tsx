import { showEarnings } from '../../sim/insight';
import { useState } from 'react';
import { ADS, BRANDS, DAYS_PER_YEAR, MERCH, MERCH_LINES, RELATIONS, SALES, SPONSOR_TERMS } from '../../config/balance';
import { groupOf } from '../../config/names';
import { AUDIENCES } from '../../config/world';
import { acceptOffer, buyBoxes, buyOut, cancelContract, chooseMakegood, declineOffer, renegotiateContract, setBrands, setSalesJob } from '../../sim/actions';
import { formatDate } from '../../sim/calendar';
import { buyOutCost, channelName } from '../../sim/deals';
import { buyBlocker } from '../../sim/commands/merch';
import { toCalendarDate } from '../../sim/calendar';
import { LINE_NAMES, boxPrice, inStorage, lineTerms, onShow, orderPackers, ordersBlocker, packingBlocker, sellsMerchandise, shopHolds, shops, showHype, storageHolds, tillStaff, weeklyDemand } from '../../sim/merchandise';
import { isUnlocked, lockedReason } from '../../sim/unlocks';
import { employeesWithDesk, type Desks } from '../../sim/office';
import { activeBrands, brandHolder, hasFreeShow, pointsForLevel, refusedShows, relationOf, renegotiatedMinimum, renegotiationBlocker, showForOffer, showListeners, showsForOffer, sponsorRate, unworkedBrands, workableBrands } from '../../sim/sales';
import { airtimeChannels, brandLimit, dealsPower, onAirtime, onBrands, onDeals, onOrders, onTill, salesGrade } from '../../sim/staff';
import type { GameState, Makegood, SalesJob, ShowSale, SponsorContract, SponsorOffer, StudioLet } from '../../sim/state';
import { Empty, Meter, Panel, Tag } from '../components';
import { formatCount, formatMoney, formatPercent } from '../format';
import { SponsorLogo } from '../SponsorLogo';
import { useGame, useGameStore } from '../store';
import { SALES_TABS, openSalesTab, salesDots, useSalesTab } from '../salesTabs';
import { useWiki } from '../wiki';
import { SPONSOR_ARTICLES } from '../../wiki/articles';

const audienceName = (id: string | null) => AUDIENCES.find((a) => a.id === id)?.name;
const ratePercent = (multiplier: number) => `+${Math.round((multiplier - 1) * 100)}%`;
const STRINGS_NAMES = { mention: 'A mention in every segment', jingle: 'A jingle', tone: 'A say over the show’s tone' } as const;

export function SalesScreen() {
  const game = useGame();
  const desked = employeesWithDesk(game);
  const salesStaff = game.employees.filter((e) => e.role === 'sales');
  const power = dealsPower(game, desked);
  const onDealsNow = salesStaff.filter(onDeals).length;
  const allTaken = game.shows.length > 0 && !hasFreeShow(game, 'radio') && !hasFreeShow(game, 'tv');
  const tab = openSalesTab(useSalesTab((s) => s.tab));
  const setTab = useSalesTab((s) => s.setTab);
  const dots = salesDots(game);

  return (
    <div className="stack">
      <div className="segmented top-tabs" role="tablist" aria-label="Sales window">
        {SALES_TABS.map((t) => (
          <button key={t.id} role="tab" data-guide={`sales-tab-${t.id}`} aria-selected={t.id === tab} className={t.id === tab ? 'active' : undefined} onClick={() => setTab(t.id)}>
            {t.label}
            {dots[t.id] && <span className="dot" role="img" aria-label={t.dot} />}
          </button>
        ))}
      </div>
      {tab === 'offers' && (
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
              {game.offers.length === 0 && !allTaken && onDealsNow === 0 && <Empty>Nobody is on deals, so no offers come. Set a salesperson’s job on the Team tab.</Empty>}
              {game.offers.length === 0 && !allTaken && onDealsNow > 0 && <Empty>No offers right now. The people on deals bring about {power.toFixed(1)} a week.</Empty>}
              {game.offers.map((offer) => <OfferCard key={offer.id} game={game} offer={offer} />)}
            </>
          )}
        </Panel>
      )}
      {tab === 'contracts' && (
        <>
          {game.makegoods.length > 0 && (
            <Panel title="Make-goods" help="sponsors">
              <p className="muted small">A contract that ended under its minimum is made good with a refund, or with free airtime: days when the show earns no ad money.</p>
              {game.makegoods.map((makegood) => <MakegoodCard key={makegood.id} game={game} makegood={makegood} />)}
            </Panel>
          )}
          <Panel title="Running contracts">
            {game.contracts.length === 0 ? (
              <Empty>No sponsored shows yet.</Empty>
            ) : (
              game.contracts.map((contract) => <ContractCard key={contract.id} game={game} contract={contract} />)
            )}
          </Panel>
        </>
      )}
      {tab === 'merchandise' && <MerchandisePanel game={game} desked={desked} />}
      {tab === 'deals' && <DealsPanel game={game} />}
      {tab === 'sponsors' && <Relations game={game} desked={desked} />}
      {tab === 'team' && <TeamPanel game={game} desked={desked} />}
    </div>
  );
}

/** The shows sold to other channels and the studios let out (0.20.0): what each has brought in, when it ends, and what it costs to end early. */
function DealsPanel({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  const deals: (ShowSale | StudioLet)[] = [...game.showSales, ...game.studioLets];
  return (
    <Panel title="Sold and let out" help="deals">
      <p className="muted small">
        Sell a show to another channel from its form, or let a studio you don’t use from its room. A deal runs a year; ending it early costs what is still to come, plus a quarter.
      </p>
      {deals.length === 0 ? (
        <Empty>Nothing sold or let out yet.</Empty>
      ) : (
        deals.map((deal) => {
          const sale = 'showId' in deal ? deal : null;
          const show = sale ? game.shows.find((s) => s.id === sale.showId) : null;
          const room = sale ? null : game.rooms.find((r) => r.roomId === (deal as StudioLet).roomId);
          const cost = buyOutCost(game, deal);
          return (
            <article key={deal.id} className="deal-card">
              <header>
                <h3>{sale ? `${show?.name ?? 'A show'} ` : `${room?.name ?? 'A studio'} `}<span className="muted">· {sale ? `sold to ${channelName(game, sale)}` : `let to ${(deal as StudioLet).tenant}`}</span></h3>
                <span className="muted small">until {formatDate(deal.endDay)}</span>
              </header>
              <div className="small">
                {sale ? 'You get a share of its ads.' : `${formatMoney((deal as StudioLet).monthly)} a month.`} Brought in <strong>{formatMoney(Math.round(deal.earned))}</strong> so far.
              </div>
              <button
                className="link danger"
                onClick={() => window.confirm(`End this deal now? It costs ${formatMoney(cost)}.`) && run((s) => buyOut(s, deal.id))}
              >
                Buy out {formatMoney(cost)}
              </button>
            </article>
          );
        })
      )}
    </Panel>
  );
}

/** The gift shop (0.21.0, #362): what the pieces hold, and for each show of your own its fans, hype, demand and the boxes of each line to buy. */
function MerchandisePanel({ game, desked }: { game: GameState; desked: Desks }) {
  const run = useGameStore((s) => s.run);
  const shows = game.shows.filter(sellsMerchandise);
  const shop = shops(game).length > 0;
  const year = toCalendarDate(game.day).year;
  const tills = tillStaff(game, desked).length;
  const packers = orderPackers(game, desked).length;
  const blocker = ordersBlocker(game);
  return (
    <Panel title="Merchandise" help="money">
      <p className="muted small">
        Goods of your own shows, sold at the till of the gift shop and by order. You buy boxes of {MERCH.box} for a show and a line up front; what a show sells follows its devoted fans and its hype, so a cult show can outsell a big one nobody cares about. Boxes left on a cancelled show clear at {formatPercent(MERCH.clearance)} of what they cost.
      </p>
      {!isUnlocked(game, 'merchandise') ? (
        <Empty>{lockedReason('merchandise')}</Empty>
      ) : !shop ? (
        <Empty>Build a gift shop on the ground floor, with a till, baskets and a piece for each line, on the Office screen.</Empty>
      ) : (
        <>
          <div className="small">
            {MERCH_LINES.map((line) => `${LINE_NAMES[line]}: ${Math.round(onShow(game, line))} of ${shopHolds(game, line)} on show`).join(' · ')} · {Math.round(inStorage(game))} in storage (room for {storageHolds(game)})
          </div>
          <div className="small">
            {tills === 0 ? <Tag tone="warning">Nobody is on the till</Tag> : `${tills} on the till`} · {packers > 0 ? `${packers} on orders` : (blocker ?? 'Nobody is on orders')}
          </div>
        </>
      )}
      {shows.length === 0 ? (
        <Empty>No show of your own yet.</Empty>
      ) : (
        shows.map((show) => (
          <article key={show.id} className="deal-card">
            <header>
              <h3>{show.name}</h3>
              <span className="muted small">about {formatCount(Math.round(weeklyDemand(game, show)))} units a week wanted</span>
            </header>
            <div className="row">
              <span className="small">Fans</span> <Meter value={show.fans ?? 0} tone="yellow" label={`${Math.round((show.fans ?? 0) * 100)}% of the fans it can have`} />
              <span className="small">Hype</span> <Meter value={showHype(show)} tone="yellow" label={`${Math.round(showHype(show) * 100)}% hype`} />
            </div>
            {MERCH_LINES.map((line) => {
              const terms = lineTerms(line, year, show);
              const left = Math.round(show.stock?.[line]?.units ?? 0);
              const reason = buyBlocker(game, show.id, line);
              return (
                <div key={line} className="row small">
                  <span>{terms ? `${LINE_NAMES[line]}${line === 'tapes' ? ` (${terms.name})` : ''}` : `${LINE_NAMES[line]}: none yet`}</span>
                  <span className="muted">{left} left{terms ? ` · box ${formatMoney(Math.round(boxPrice(game, show, line)!))}, sells ${formatMoney(terms.price)} a unit` : ''}</span>
                  {terms && (
                    <>
                      <button className="link" disabled={reason !== null} title={reason ?? undefined} onClick={() => run((s) => buyBoxes(s, show.id, line, 1))}>Buy 1 box</button>
                      <button className="link" disabled={buyBlocker(game, show.id, line, 5) !== null} title={buyBlocker(game, show.id, line, 5) ?? undefined} onClick={() => run((s) => buyBoxes(s, show.id, line, 5))}>Buy 5</button>
                    </>
                  )}
                </div>
              );
            })}
          </article>
        ))
      )}
    </Panel>
  );
}

/** How well the company knows a sponsor: its level, and how far along it is to the next. */
function RelationMeter({ game, sponsor }: { game: GameState; sponsor: string }) {
  const { level, points } = relationOf(game, sponsor);
  const top = level >= RELATIONS.levels;
  return (
    <div className="stat" title="Salespeople on brands work on this while a contract with the sponsor runs">
      Relationship · level {level}{' '}
      <Meter value={top ? 1 : points / pointsForLevel(level)} tone="yellow" label={top ? 'The highest level' : `${Math.floor(points)} of ${pointsForLevel(level)} points to level ${level + 1}`} />{' '}
      <span className="muted small">{top ? 'the highest level' : `level ${level + 1} pays ${ratePercent(sponsorRate(level + 1))}`}</span>
    </div>
  );
}

/** A sponsor's name, as a link to its page in the wiki when it has one. */
function SponsorName({ sponsor }: { sponsor: string }) {
  const article = SPONSOR_ARTICLES[sponsor];
  if (!article) return <>{sponsor}</>;
  return (
    <button type="button" className="link" data-sound="tab" onClick={() => useWiki.getState().open(article)} title={`Wiki: ${sponsor}`}>
      {sponsor}
    </button>
  );
}

/** Every sponsor the company has worked with, and how well it knows each. */
function Relations({ game, desked }: { game: GameState; desked: Desks }) {
  const known = Object.keys(game.relations).sort((a, b) => game.relations[b]!.level - game.relations[a]!.level || a.localeCompare(b));
  const busy = new Set(game.contracts.map((c) => c.sponsor));
  const workedBy = (sponsor: string) => {
    const holder = brandHolder(game, sponsor);
    return holder && desked.has(holder.id) && activeBrands(holder, salesGrade(game, holder, desked)).includes(sponsor) ? holder : undefined;
  };
  return (
    <Panel title="Sponsors you know" help="sponsors">
      <p className="muted small">
        Salespeople on brands look after the sponsors under contract. A sponsor you know better pays more: {ratePercent(sponsorRate(1))} on the normal ad rate at level 1, up to {ratePercent(sponsorRate(RELATIONS.levels))} at
        level {RELATIONS.levels}. A brand with nobody working on it earns no points.
      </p>
      {known.length === 0 ? (
        <Empty>Nobody yet. It starts with a first contract.</Empty>
      ) : (
        known.map((sponsor) => (
          <div key={sponsor} className="relation">
            <span className="sponsor-title">
              <SponsorLogo sponsor={sponsor} />
              <SponsorName sponsor={sponsor} /> {busy.has(sponsor) ? <Tag tone="good">Under contract</Tag> : <Tag>No contract now</Tag>}
            </span>
            <RelationMeter game={game} sponsor={sponsor} />
            {busy.has(sponsor) && relationOf(game, sponsor).level < RELATIONS.levels && (
              <span className="muted small">{workedBy(sponsor) ? `Worked on by ${workedBy(sponsor)!.name}` : 'Nobody works on it'}</span>
            )}
          </div>
        ))
      )}
    </Panel>
  );
}

/** The sales staff: what each works on, with their grade, and the brands of those on brands (0.21.0, #360). */
function TeamPanel({ game, desked }: { game: GameState; desked: Desks }) {
  const run = useGameStore((s) => s.run);
  const staff = game.employees.filter((e) => e.role === 'sales');
  const open = workableBrands(game);
  const unworked = unworkedBrands(game, desked);
  // The channels each person on airtime sells for (0.21.0, #363), by name.
  const looked = new Map<string, string[]>();
  for (const [channelId, { sellerId }] of airtimeChannels(game, desked)) looked.set(sellerId, [...(looked.get(sellerId) ?? []), game.channels.find((c) => c.id === channelId)?.name ?? channelId]);
  return (
    <Panel title="Sales team" help="sponsors">
      <p className="muted small">
        People on deals bring the offers, sell shows and let studios. People on airtime find buyers for the ad minutes that go unsold on {ADS.sellers.channelsEach} channels each, the biggest first. People on brands work on the sponsors under contract: one brand under a grade of {BRANDS.bands[0]!.from}, {BRANDS.bands[0]!.brands} from {BRANDS.bands[0]!.from}, {BRANDS.bands[1]!.brands} from{' '}
        {BRANDS.bands[1]!.from}. A free person on brands takes a brand by themselves.
      </p>
      {unworked.length > 0 && <Tag tone="warning">Nobody works on {unworked.join(', ')}</Tag>}
      {staff.length === 0 ? (
        <Empty>Hire sales staff on the Staff screen.</Empty>
      ) : (
        staff.map((e) => {
          const grade = salesGrade(game, e, desked);
          const limit = brandLimit(grade);
          const brands = e.brands ?? [];
          return (
            <article key={e.id} className="deal-card">
              <header>
                <h3>{e.name}</h3>
                <span className="muted small">{desked.has(e.id) ? `Working at ${grade}` : 'No desk'}</span>
              </header>
              <div className="row">
                <select value={e.salesJob ?? 'deals'} aria-label={`Job of ${e.name}`} onChange={(ev) => run((s) => setSalesJob(s, e.id, ev.target.value as SalesJob))}>
                  <option value="deals">Deals</option>
                  <option value="brands">Brands</option>
                  <option value="airtime">Airtime</option>
                  <option value="till">On the till</option>
                  <option value="orders">On orders</option>
                </select>
              </div>
              {onAirtime(e) && (
                <div className="small">
                  {looked.has(e.id) ? `Sells the ad minutes of ${looked.get(e.id)!.join(', ')}.` : desked.has(e.id) ? 'No channel to sell for.' : 'Needs a workstation.'}
                </div>
              )}
              {onTill(e) && !desked.has(e.id) && <Tag tone="warning">No till in a gift shop</Tag>}
              {onOrders(e) && packingBlocker(game, e.id, desked) && <Tag tone="warning">{packingBlocker(game, e.id, desked)}</Tag>}
              {onBrands(e) && (
                <div className="small">
                  {brands.length === 0 ? 'No brands yet.' : brands.map((b, n) => `${b}${n >= limit ? ' (paused)' : ''}`).join(', ')} <span className="muted">· room for {limit}</span>
                  <div className="row">
                    {open.map((b) => {
                      const mine = brands.includes(b);
                      return (
                        <button key={b} className="link" disabled={!mine && brands.length >= limit} onClick={() => run((s) => setBrands(s, e.id, mine ? brands.filter((x) => x !== b) : [...brands, b]))}>
                          {mine ? `Drop ${b}` : `Take ${b}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </article>
          );
        })
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
        <dd>
          {offer.weeks} weeks
          {offer.length === 'short' && !('renegotiated' in offer && offer.renegotiated) && ` · short: pays ${Math.round((1 - SPONSOR_TERMS.length.shortPay) * 100)}% less, can be renegotiated`}
          {offer.length === 'short' && 'renegotiated' in offer && offer.renegotiated && ' · renegotiated: pays more'}
          {offer.length === 'long' && ` · long: pays ${Math.round((SPONSOR_TERMS.length.longPay - 1) * 100)}% more, locked, the premium only on up to ${SPONSOR_TERMS.length.premiumCap}× the minimum`}
        </dd>
      </div>
      {offer.exclusive && (
        <div>
          <dt>Exclusive</dt>
          <dd>Pays {Math.round((SPONSOR_TERMS.exclusive.pay - 1) * 100)}% more; no rival brand ({groupOf(offer.sponsor)?.toLowerCase()}) on its channel</dd>
        </div>
      )}
      {offer.strings && (
        <div>
          <dt>Strings</dt>
          <dd>
            {STRINGS_NAMES[offer.strings]}: pays {Math.round((SPONSOR_TERMS.strings.kinds[offer.strings].pay - 1) * 100)}% more, show appeal −{Math.round(SPONSOR_TERMS.strings.kinds[offer.strings].appeal * 100)}%, host morale −{SPONSOR_TERMS.strings.kinds[offer.strings].morale}
          </dd>
        </div>
      )}
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
  // Shows that are free but that this offer can't go to (a rival brand is on their channel, a family brand and an edgy show) say why.
  const refused = refusedShows(game, offer);
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
          <Tag tone="warning">{refused.length > 0 ? 'No show can take this offer' : `Every ${offer.medium === 'tv' ? 'TV' : 'radio'} show has a sponsor already: this offer has no show to go to`}</Tag>
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
      {showId && chosen >= offer.minListeners && (
        <div className="muted small">This show had {formatCount(chosen)} yesterday: {Math.round((chosen / offer.minListeners - 1) * 100)}% above the minimum.</div>
      )}
      {refused.map(({ show, reason }) => (
        <div key={show.id} className="muted small">“{show.name}” is out: {reason}</div>
      ))}
    </article>
  );
}

/** A contract that ended under its minimum: the two ways to make it good, with what each costs, and how long is left to choose. */
function MakegoodCard({ game, makegood }: { game: GameState; makegood: Makegood }) {
  const run = useGameStore((s) => s.run);
  const show = game.shows.find((s) => s.id === makegood.showId);
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  return (
    <article className="deal-card">
      <header>
        <h3 className="sponsor-title">
          <SponsorLogo sponsor={makegood.sponsor} />
          {makegood.sponsor} <span className="muted">· {show?.name}</span>
        </h3>
        <span className="muted small">{makegood.daysLeft === undefined ? `${days(Math.max(0, makegood.decideBy - game.day))} to choose` : 'free airtime'}</span>
      </header>
      {makegood.daysLeft === undefined ? (
        <>
          <div className="small">
            <strong>Refund:</strong> you pay {formatMoney(makegood.penalty)} and {makegood.sponsor} drops a level. <strong>Free airtime:</strong> the show earns no ad money for {days(makegood.days)} it airs, and nothing else is paid. With no choice it is a refund.
          </div>
          <div className="row">
            <button className="primary" onClick={() => run((s) => chooseMakegood(s, makegood.id, 'airtime'))}>Free airtime ({days(makegood.days)})</button>
            <button onClick={() => run((s) => chooseMakegood(s, makegood.id, 'refund'))}>Refund {formatMoney(makegood.penalty)}</button>
          </div>
        </>
      ) : (
        <div className="small">
          “{show?.name}” earns no ad money for {days(makegood.daysLeft)} more on the air. Days off the air, and days a bulletin takes over, don’t count.
        </div>
      )}
    </article>
  );
}

function ContractCard({ game, contract }: { game: GameState; contract: SponsorContract }) {
  const run = useGameStore((s) => s.run);
  const show = game.shows.find((s) => s.id === contract.showId);
  const average = contract.daysRun > 0 ? contract.listenerSum / contract.daysRun : 0;
  const onTrack = average >= contract.minListeners;
  const earned = showEarnings(game, contract.showId);

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
      {earned && earned.sponsor > 0 && (
        <div className="small">
          Brings about <strong>{formatMoney(Math.round((earned.sponsor * DAYS_PER_YEAR) / 12 / 100) * 100)}</strong> a month on top of the ads: “{show?.name}” earns {formatMoney(Math.round(earned.revenue))} a day with it.
        </div>
      )}
      <div className="stat">
        Average so far <Meter value={Math.min(1, average / contract.minListeners)} tone={onTrack ? 'green' : 'accent'} />{' '}
        {formatCount(average)} of {formatCount(contract.minListeners)}
        {contract.daysRun > 0 && (onTrack ? <Tag tone="good">On track</Tag> : <Tag tone="danger">Below minimum</Tag>)}
      </div>
      {contract.length === 'short' && !contract.renegotiated && (
        <div className="row small">
          {renegotiationBlocker(game, contract) === null ? (
            <button
              onClick={() =>
                window.confirm(`Renegotiate? It pays ${Math.round((SPONSOR_TERMS.length.longPay - 1) * 100)}% extra instead of ${Math.round((1 - SPONSOR_TERMS.length.shortPay) * 100)}% less, but the minimum goes up to ${formatCount(renegotiatedMinimum(contract))} and the average starts again.`) &&
                run((s) => renegotiateContract(s, contract.id))
              }
            >
              Renegotiate
            </button>
          ) : (
            <span className="muted">Renegotiate: {renegotiationBlocker(game, contract)}</span>
          )}
        </div>
      )}
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
