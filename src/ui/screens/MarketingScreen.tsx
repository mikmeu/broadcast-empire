import { isUnlocked } from '../../sim/unlocks';
import { LockNote } from '../components';
import { useState } from 'react';
import { MARKETING, OWN_EVENTS, OWN_EVENT_LIMITS, SOCIAL, type OwnEventKind } from '../../config/balance';
import { AUDIENCES } from '../../config/world';
import { closeSocialAccount, extendCampaign, openSocialAccount, setCampaignRepeat, stageEvent, startCampaign, stopCampaign } from '../../sim/actions';
import { AUDIENCE_PER_SEATING } from '../../config/office';
import { VENUES, VENUE_SIZES } from '../../config/venues';
import { eventHalls, eventHosts, hallBlocker, hallLabel, hallSeating, hostFee, isOutside, ownEventBlocker, ownEventCooldown, ownEventCost, ownEventPrestige } from '../../sim/ownEvents';
import { busyMarketers, campaignStrength, campaignTargetName } from '../../sim/marketing';
import { hasPrinter, weeklyCost } from '../../sim/economy';
import { employeesWithDesk } from '../../sim/office';
import type { CampaignAudience, GameState } from '../../sim/state';
import { Empty, Meter, Panel, Tag } from '../components';
import { formatMoney, formatPercent } from '../format';
import { useGame, useGameStore } from '../store';

const audienceLabel = (audience: CampaignAudience) =>
  audience === 'all' ? 'All audiences' : AUDIENCES.find((a) => a.id === audience)?.name ?? audience;

export function MarketingScreen() {
  const game = useGame();
  return (
    <div className="two-col">
      <div className="stack">
        <NewCampaign game={game} />
        <PromotionTable game={game} />
      </div>
      <div className="stack">
        <Panel title="Running campaigns">
          {game.campaigns.length === 0 ? (
            <Empty>No campaigns running.</Empty>
          ) : (
            game.campaigns.map((c) => <CampaignRow key={c.id} game={game} campaignId={c.id} />)
          )}
        </Panel>
        <SocialPanel game={game} />
        {isUnlocked(game, 'events') ? (
          <EventsPanel game={game} />
        ) : (
          <Panel title="Stage an event" help="prestige">
            <LockNote feature="events" />
          </Panel>
        )}
      </div>
    </div>
  );
}

/** One account per channel, run by a marketer: a following that builds slowly and reaches the young most. */
function SocialPanel({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  const has = game.techs.includes('socialMedia');
  return (
    <Panel title="Social media">
      {!has ? (
        <p className="muted small">Research “Social media” (2008) to open an account for a channel.</p>
      ) : game.channels.length === 0 ? (
        <Empty>No channels yet.</Empty>
      ) : (
        <>
          <p className="muted small">
            A marketer runs an account for a channel. It costs {formatMoney(weeklyCost(game, SOCIAL.weeklyCost))} a week, builds a following over months, and adds up to{' '}
            <Tag>+{formatPercent(SOCIAL.maxPromotion)}</Tag> appeal, mostly among teens and students. It shares the cap with campaigns.
          </p>
          {game.channels.map((c) => {
            const marketer = game.employees.find((e) => e.id === c.social?.marketerId);
            return (
              <article className="deal-card" key={c.id}>
                <header>
                  <h3>{c.name}</h3>
                  {c.social ? (
                    <button className="link danger" onClick={() => run((s) => closeSocialAccount(s, c.id))}>Close account</button>
                  ) : (
                    <button onClick={() => run((s) => openSocialAccount(s, c.id))}>Open account</button>
                  )}
                </header>
                {c.social ? (
                  <div className="row muted small">
                    <span className="stat">Following <Meter value={c.social.following} tone="yellow" /> {formatPercent(c.social.following)}</span>·
                    <span>{marketer ? `run by ${marketer.name}` : 'no marketer: the following is fading'}</span>
                  </div>
                ) : (
                  <span className="muted small">No account.</span>
                )}
              </article>
            );
          })}
        </>
      )}
    </Panel>
  );
}

/** Concerts, galas and telethons: big one-off spending for reputation, fame and prestige. */
function EventsPanel({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  const [chosen, setChannelId] = useState(game.channels[0]?.id ?? '');
  const [chosenHost, setHostId] = useState<string>('');
  const [chosenVenue, setVenue] = useState<string>('small');
  const channel = game.channels.find((c) => c.id === chosen) ?? game.channels[0];
  if (!channel) return null;
  const hosts = eventHosts(game, channel);
  // The host nobody picked is the most famous one; a venue that is gone (a hall sold) is the small one outside.
  const host = hosts.find((h) => h.id === chosenHost) ?? hosts[0];
  const halls = eventHalls(game);
  const venue = isOutside(chosenVenue) || halls.some((h) => h.roomId === chosenVenue) ? chosenVenue : 'small';
  const wait = ownEventCooldown(game, channel);

  return (
    <Panel title="Stage an event" help="prestige" actions={<span className="muted small">{game.prestige} prestige so far</span>}>
      <p className="muted small">
        An event lifts the channel’s reputation in every region it broadcasts in and makes the host you pick more famous.
        Both fade again over the following months; the prestige stays, and makes hosts want to work for you. One event per channel every {OWN_EVENT_LIMITS.cooldownDays} days.
        An outside venue charges rent. In your own event hall there is none, and the catering is cheaper, but a technician must be on the staff.
      </p>
      <label>
        Channel
        <select value={channel.id} onChange={(e) => setChannelId(e.target.value)}>
          {game.channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>
        Host
        <select value={host?.id ?? ''} onChange={(e) => setHostId(e.target.value)} disabled={hosts.length === 0}>
          {hosts.length === 0 && <option value="">No host</option>}
          {hosts.map((h) => <option key={h.id} value={h.id}>{h.name} (fame {Math.round(h.fame)}, fee {formatMoney(hostFee(h))})</option>)}
        </select>
      </label>
      <label>
        Venue
        <select value={venue} onChange={(e) => setVenue(e.target.value)}>
          {VENUE_SIZES.map((size) => <option key={size} value={size}>{VENUES[size].name} ({size}, outside)</option>)}
          {halls.map((h) => <option key={h.roomId} value={h.roomId}>{hallLabel(h)}, {hallSeating(h) * AUDIENCE_PER_SEATING} seats</option>)}
        </select>
      </label>
      <p className="muted small">
        {isOutside(venue) ? VENUES[venue].about : hallBlocker(game, halls.find((h) => h.roomId === venue)!) ?? 'Your own hall: no rent to pay.'}
        {host ? '' : ' No host on this channel’s schedule, so nobody gains fame and there is no fee.'}
        {wait > 0 && ` Next event possible in ${wait} day${wait === 1 ? '' : 's'}.`}
      </p>
      {(Object.keys(OWN_EVENTS) as OwnEventKind[]).map((kind) => {
        const spec = OWN_EVENTS[kind];
        const hostId = host?.id ?? null;
        const blocker = ownEventBlocker(game, channel, kind, venue, hostId);
        const cost = ownEventCost(game, channel, kind, venue, hostId);
        return (
          <article key={kind} className="deal-card">
            <header>
              <h3>{spec.name}</h3>
              <span>{formatMoney(cost.total)}</span>
            </header>
            <div className="row muted small">
              <span>Rent {formatMoney(cost.rent)}</span>·<span>Catering {formatMoney(cost.catering)}</span>·<span>Host {formatMoney(cost.host)}</span>
            </div>
            <div className="row muted small">
              <span>Reputation +{Math.round(spec.reputation * 100)}</span>·<span>Host fame +{spec.fame}</span>·
              <span>{ownEventPrestige(game, channel, kind)} prestige</span>
            </div>
            {blocker && <p className="muted small">{blocker}</p>}
            <button className="primary" disabled={blocker !== null} title={blocker ?? undefined} onClick={() => run((s) => stageEvent(s, channel.id, kind, venue, hostId))}>
              Stage the {spec.name.toLowerCase()}
            </button>
          </article>
        );
      })}
    </Panel>
  );
}

function NewCampaign({ game }: { game: GameState }) {
  const run = useGameStore((s) => s.run);
  const [targetId, setTargetId] = useState(game.channels[0]?.id ?? '');
  const [audience, setAudience] = useState<CampaignAudience>('all');
  // A new campaign starts small: the smallest budget and the shortest run.
  const [weeklyBudget, setWeeklyBudget] = useState(MARKETING.budgets[0]!);
  const [weeks, setWeeks] = useState(MARKETING.durations[0]!);
  const [repeat, setRepeat] = useState(false);

  const desked = employeesWithDesk(game);
  const busy = busyMarketers(game);
  const marketers = game.employees.filter((e) => e.role === 'marketing');
  const free = marketers.filter((e) => desked.has(e.id) && !busy.has(e.id)).sort((a, b) => b.skill - a.skill);
  const marketer = free[0];
  const strength = marketer ? campaignStrength(game, marketer, weeklyBudget, audience, desked) : 0;

  return (
    <Panel title="New campaign" help="marketing" actions={<span className="muted small">{free.length} of {marketers.length} marketers free</span>}>
      <p className="muted small">
        A campaign makes a channel or show more appealing while it runs; the effect fades slowly after it ends. Each
        marketer runs one campaign at a time.
      </p>
      {marketers.length === 0 ? (
        <Empty>Hire marketing staff on the Staff screen to run campaigns.</Empty>
      ) : (
        <form
          className="stack-sm"
          onSubmit={(e) => {
            e.preventDefault();
            run((s) => startCampaign(s, { targetId, audience, weeklyBudget, weeks, repeat }));
          }}
        >
          <label>
            Promote
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <optgroup label="Channels">
                {game.channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
              <optgroup label="Shows">
                {game.shows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            </select>
          </label>
          <label>
            Audience
            <select value={audience} onChange={(e) => setAudience(e.target.value as CampaignAudience)}>
              <option value="all">All audiences ({Math.round(MARKETING.allAudiences * 100)}% strength each)</option>
              {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <div className="row">
            <label>
              Weekly budget
              <select value={weeklyBudget} onChange={(e) => setWeeklyBudget(Number(e.target.value))}>
                {MARKETING.budgets.map((b) => <option key={b} value={b}>{formatMoney(b)}</option>)}
              </select>
            </label>
            <label>
              Length
              <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                {MARKETING.durations.map((w) => <option key={w} value={w}>{w} weeks</option>)}
              </select>
            </label>
          </div>
          <label className="settings-row">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            <span>
              Start again when it ends
              <span className="muted small"> · until you stop it, as long as the money is there</span>
            </span>
          </label>
          <div className="preview">
            {marketer ? (
              <>
                <span className="stat">
                  Up to +{formatPercent(strength)} appeal <Meter value={strength / MARKETING.maxPromotion} tone="yellow" />
                </span>
                <div className="muted small">
                  Run by {marketer.name} · total cost {formatMoney(weeklyCost(game, weeklyBudget) * weeks)}, paid daily{hasPrinter(game) && ', 10% less for your printer'}
                </div>
              </>
            ) : (
              <span className="muted small">Every marketer is busy or has no desk.</span>
            )}
          </div>
          <button className="primary" type="submit" data-guide="start-campaign" disabled={!marketer || !targetId}>Start campaign</button>
        </form>
      )}
    </Panel>
  );
}

function CampaignRow({ game, campaignId }: { game: GameState; campaignId: string }) {
  const run = useGameStore((s) => s.run);
  const campaign = game.campaigns.find((c) => c.id === campaignId)!;
  const marketer = game.employees.find((e) => e.id === campaign.marketerId);
  return (
    <article className="deal-card">
      <header>
        <h3>{campaignTargetName(game, campaign.targetId)}</h3>
        <span className="muted small">{campaign.endDay - game.day} days left{campaign.repeat ? ', then again' : ''}</span>
      </header>
      <div className="row muted small">
        <span>{audienceLabel(campaign.audience)}</span>·<span>{formatMoney(weeklyCost(game, campaign.weeklyBudget))}/week</span>·
        <span>run by {marketer?.name ?? 'nobody'}</span>
      </div>
      <label className="settings-row">
        <input type="checkbox" checked={campaign.repeat} onChange={(e) => run((s) => setCampaignRepeat(s, campaign.id, e.target.checked))} />
        <span>
          Start again when it ends
          <span className="muted small"> · {campaign.weeks} weeks at a time</span>
        </span>
      </label>
      <div className="row">
        {MARKETING.durations.map((w) => (
          <button key={w} onClick={() => run((s) => extendCampaign(s, campaign.id, w))} title={`${formatMoney(weeklyCost(game, campaign.weeklyBudget) * w)} more, paid daily`}>
            + {w} weeks
          </button>
        ))}
        <button className="link danger" onClick={() => run((s) => stopCampaign(s, campaign.id))}>Stop campaign</button>
      </div>
    </article>
  );
}

function PromotionTable({ game }: { game: GameState }) {
  const ids = Object.keys(game.promotion);
  return (
    <Panel title="Promotion now">
      {ids.length === 0 ? (
        <Empty>Nothing is being promoted.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Channel or show</th>
                {AUDIENCES.map((a) => <th key={a.id} scope="col" className="num">{a.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {ids.map((id) => (
                <tr key={id}>
                  <th scope="row">{campaignTargetName(game, id)}</th>
                  {AUDIENCES.map((a) => {
                    const level = game.promotion[id]?.[a.id] ?? 0;
                    return <td key={a.id} className="num">{level > 0.005 ? `+${formatPercent(level)}` : '–'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        Extra appeal from marketing, per audience. A show gets its own promotion plus its channel’s, up to{' '}
        <Tag>+{formatPercent(MARKETING.maxPromotion)}</Tag>.
      </p>
    </Panel>
  );
}
