import { lockedReason, regionOpen } from '../../sim/unlocks';
import { useState } from 'react';
import { MAX_PLAYER_CHANNELS, RENEWAL, SPECIALIZATION } from '../../config/balance';
import { LOGO_COLORS } from '../../config/names';
import { PERSONALITIES } from '../../config/rivals';
import { REGIONS, SLOTS, getRegion, type Medium, type RegionId } from '../../config/world';
import {
  buyLicense,
  closeChannel,
  createChannel,
  dropLicense,
  placeBid,
  setChannelManager,
  updateChannel,
  withdrawBid,
} from '../../sim/actions';
import { channelOffAirReason, channelSpecialization, scheduledChannels } from '../../sim/broadcast';
import { employeesWithDesk } from '../../sim/office';
import { formatDate } from '../../sim/calendar';
import { dailyEpisodeCost, dailyRoyalties } from '../../sim/economy';
import { suggestChannelName } from '../../sim/names';
import { freeLicenses, licenseMonthly, licensePrice, licenseSlots, MEDIUM_NAMES, nextTvLicenseYear } from '../../sim/licenses';
import { PLAYER, type Auction, type Channel, type GameState, type Logo, type LogoShape } from '../../sim/state';
import { population } from '../../sim/world';
import { Empty, LogoBadge, Meter, Panel, Tag } from '../components';
import { formatCompact, formatMoney } from '../format';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { useGame, useGameStore } from '../store';
import { useOnAir } from '../onAir';

export function ChannelScreen() {
  const game = useGame();
  const [creating, setCreating] = useState<Medium | null>(null);
  const canAdd = game.channels.length < MAX_PLAYER_CHANNELS;
  // With radio and TV channels both, a filter shows one kind.
  const [only, setOnly] = useState<Medium | null>(null);
  const both = game.channels.some((c) => c.medium === 'radio') && game.channels.some((c) => c.medium === 'tv');
  const shown = game.channels.filter((c) => !both || !only || c.medium === only);

  return (
    <div className="two-col">
      <div className="stack">
        {game.channels.length === 0 && !creating && (
          <Panel title="Your channels" help="channels">
            <Empty>You don’t have a channel yet. Radio is the affordable way to start; TV comes later.</Empty>
          </Panel>
        )}
        {/* Starting a channel comes first: in sight however many channels there are, which is where the tutorial points. */}
        {creating ? (
          <NewChannelPanel medium={creating} onDone={() => setCreating(null)} />
        ) : (
          canAdd && (
            <div className="row">
              <button className={game.channels.length === 0 ? 'primary' : 'add-channel'} data-guide="start-radio" onClick={() => setCreating('radio')}>
                + Start a radio channel
              </button>
              <button className="add-channel" data-guide="start-tv" onClick={() => setCreating('tv')}>+ Start a TV channel</button>
            </div>
          )
        )}
        {both && (
          <div className="segmented" role="tablist" aria-label="Show channels">
            {([null, 'radio', 'tv'] as const).map((medium) => (
              <button key={medium ?? 'all'} role="tab" aria-selected={only === medium} className={only === medium ? 'active' : undefined} onClick={() => setOnly(medium)}>
                {medium === null ? 'All channels' : medium === 'tv' ? 'TV' : 'Radio'} ({game.channels.filter((c) => !medium || c.medium === medium).length})
              </button>
            ))}
          </div>
        )}
        {shown.map((channel) => (
          <ChannelPanel key={channel.id} game={game} channel={channel} />
        ))}
      </div>
      <div className="stack">
        <AuctionsPanel game={game} />
        <MarketPanel game={game} />
        <RivalsPanel game={game} />
      </div>
    </div>
  );
}

const SHAPES: LogoShape[] = ['circle', 'square', 'diamond', 'shield'];

function LogoEditor({ logo, onChange }: { logo: Logo; onChange: (logo: Logo) => void }) {
  return (
    <div className="logo-editor">
      <LogoBadge logo={logo} size={64} />
      <div className="stack-sm">
        <label>
          Initials
          <input value={logo.initials} maxLength={3} onChange={(e) => onChange({ ...logo, initials: e.target.value.toUpperCase() })} />
        </label>
        <div className="row" role="radiogroup" aria-label="Shape">
          {SHAPES.map((shape) => (
            <button
              key={shape}
              type="button"
              role="radio"
              aria-checked={logo.shape === shape}
              aria-label={shape}
              className={logo.shape === shape ? 'swatch active' : 'swatch'}
              onClick={() => onChange({ ...logo, shape })}
            >
              <LogoBadge logo={{ ...logo, shape, initials: '' }} size={20} />
            </button>
          ))}
        </div>
        <div className="row" role="radiogroup" aria-label="Color">
          {LOGO_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={logo.color === color}
              aria-label={`Color ${color}`}
              className={logo.color === color ? 'swatch active' : 'swatch'}
              onClick={() => onChange({ ...logo, color })}
            >
              <span className="color-dot" style={{ background: color }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewChannelPanel({ medium, onDone }: { medium: Medium; onDone: () => void }) {
  const run = useGameStore((s) => s.run);
  const game = useGame();
  const [name, setName] = useState('');
  const [example] = useState(() => suggestChannelName(medium));
  const [logo, setLogo] = useState<Logo>({ shape: 'circle', color: LOGO_COLORS[0]!, initials: '' });
  const initials = logo.initials || name.split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 3).toUpperCase();

  return (
    <Panel title={`Start a ${MEDIUM_NAMES[medium]} channel`} help={medium === 'tv' ? 'television' : 'channels'}>
      <form
        className="stack-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (run((s) => createChannel(s, { name, logo: { ...logo, initials }, medium }))) onDone();
        }}
      >
        <label>
          Channel name
          <span className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${example}`} />
            <button type="button" aria-label="Suggest a name" title="Suggest a name" onClick={() => setName(suggestChannelName(medium))}>🎲</button>
          </span>
        </label>
        <LogoEditor logo={{ ...logo, initials }} onChange={setLogo} />
        {medium === 'tv' ? (
          <p className="muted small">
            TV is a big step: a {getRegion('capital').name} license costs {formatMoney(licensePrice('tv', 'capital', game))} plus{' '}
            {formatMoney(licenseMonthly('tv', 'capital', game))} a month, TV studios cost €50,000–75,000 to equip, and
            produced TV shows have an episode budget every day they air. Movies, series and documentaries come from the
            content market and need a library.
          </p>
        ) : (
          <p className="muted small">After creating it, buy a license in at least one region and give it a channel manager.</p>
        )}
        <div className="row">
          <button className="primary" type="submit" data-guide="create-channel">Create channel</button>
          <button type="button" onClick={onDone}>Cancel</button>
        </div>
      </form>
    </Panel>
  );
}

function ChannelPanel({ game, channel }: { game: GameState; channel: Channel }) {
  const run = useGameStore((s) => s.run);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(channel.name);
  const [logo, setLogo] = useState(channel.logo);
  const offAir = channelOffAirReason(game, channel);
  const specialization = channelSpecialization(game, channel);
  const scheduler = scheduledChannels(game, employeesWithDesk(game)).get(channel.id);
  const episodes = dailyEpisodeCost(game, channel.schedule);
  const royalties = Math.round(dailyRoyalties(game, channel.schedule));
  const managers = game.employees.filter((e) => e.role === 'channelManager');
  const filled = channel.schedule.filter(Boolean).length;

  return (
    <Panel
      title={
        <span className="channel-title">
          <LogoBadge logo={channel.logo} size={36} /> {channel.name} <Tag>{channel.medium === 'tv' ? 'TV' : 'Radio'}</Tag>
        </span>
      }
      help="channels"
      actions={offAir ? <Tag tone="danger">Off air: {offAir}</Tag> : <Tag tone="good">On air</Tag>}
    >
      <div className="channel-schedule-row">
        <button className="primary" data-guide={`open-schedule-${channel.id}`} onClick={() => useOnAir.getState().show('schedule', channel.id)}>
          <Icon name="schedule" size={18} /> Schedule
        </button>
        <span className="muted small">
          {filled} of {SLOTS.length} slots have a show of their own. Shows are made, changed and put in a slot there.
        </span>
      </div>
      <div className="field">
        <span className="field-label">Channel manager</span>
        {managers.length === 0 ? (
          <span className="muted small">Hire a channel manager in the Staff window.</span>
        ) : (
          <div className="choices hosts" role="radiogroup" aria-label={`Channel manager for ${channel.name}`} data-guide={game.channels[0]?.id === channel.id ? 'channel-manager' : `channel-manager-${channel.id}`}>
            {managers.map((m) => {
              // A manager runs one channel; the one they run already is named.
              const other = game.channels.find((c) => c.id !== channel.id && c.managerId === m.id);
              const chosen = channel.managerId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  className={chosen ? 'choice active' : 'choice'}
                  disabled={other !== undefined}
                  title={other ? `Runs ${other.name}` : chosen ? 'Press again to take them off this channel' : undefined}
                  onClick={() => run((s) => setChannelManager(s, channel.id, chosen ? null : m.id))}
                >
                  <Avatar name={m.name} />
                  <strong>{m.name}</strong>
                  <span className="small">skill {m.skill} · {other ? `runs ${other.name}` : chosen ? 'runs this one' : 'free'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <dl className="facts">
        <dt>Specialization</dt>
        <dd>
          {specialization ? (
            <>
              <Tag tone="good">{specialization} · +{Math.round((SPECIALIZATION.bonus - 1) * 100)}% appeal</Tag>
              {scheduler && <Tag tone="good">Music scheduler · +{Math.round(scheduler.bonus * 100)}% appeal on its music shows</Tag>}
            </>
          ) : (
            <span className="muted small">None: schedule {SPECIALIZATION.minSlots}+ shows from one genre group</span>
          )}
        </dd>
        {episodes > 0 && (
          <>
            <dt>Episode budgets</dt>
            <dd>{formatMoney(episodes)} a day for the produced shows on the schedule</dd>
          </>
        )}
        {royalties > 0 && (
          <>
            <dt>Music royalties</dt>
            <dd>About {formatMoney(royalties)} a day, after what the music shows earned yesterday</dd>
          </>
        )}
      </dl>

      <RegionTable game={game} channel={channel} />

      {editing ? (
        <form
          className="stack-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (run((s) => updateChannel(s, channel.id, { name, logo }))) setEditing(false);
          }}
        >
          <label>
            Channel name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <LogoEditor logo={logo} onChange={setLogo} />
          <div className="row">
            <button className="primary" type="submit">Save</button>
            <button type="button" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="row">
          <button onClick={() => setEditing(true)}><Icon name="edit" size={13} /> Edit name and logo</button>
          <button
            className="link danger"
            onClick={() =>
              window.confirm(`Close ${channel.name}? Its licenses are given back without a refund. Its shows stay.`) &&
              run((s) => closeChannel(s, channel.id))
            }
          >
            Close channel
          </button>
        </div>
      )}
    </Panel>
  );
}

/** Where a channel broadcasts, and where it could. */
function RegionTable({ game, channel }: { game: GameState; channel: Channel }) {
  const run = useGameStore((s) => s.run);
  return (
    <div className="table-scroll">
      <table className="data-table region-table">
        <thead>
          <tr>
            <th scope="col">Region</th>
            <th scope="col">Reputation</th>
            <th scope="col" className="num">Fee / month</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody>
          {REGIONS.map((region) => {
            const license = game.licenses.find((l) => l.channelId === channel.id && l.regionId === region.id);
            const rep = channel.reputation[region.id];
            const free = freeLicenses(game, channel.medium, region.id);
            const auction = game.auctions.find((a) => a.medium === channel.medium && a.regionId === region.id);
            const nextYear = nextTvLicenseYear(region.id, game.day);
            return (
              <tr key={region.id}>
                <th scope="row">
                  {region.name}
                  <div className="muted small">
                    {formatCompact(population(region.id, game.day))} people
                    {license && ` · license until ${formatDate(license.expiresOn).slice(4)}`}
                  </div>
                </th>
                <td>
                  {license && rep !== undefined ? (
                    <span className="stat">
                      <Meter value={rep} tone="green" label={`Reputation ${Math.round(rep * 100)}`} /> {Math.round(rep * 100)}
                    </span>
                  ) : (
                    <span className="muted small">
                      {free} of {licenseSlots(channel.medium, region.id, game.day)} {MEDIUM_NAMES[channel.medium]} licenses free
                    </span>
                  )}
                </td>
                <td className="num">{formatMoney(licenseMonthly(channel.medium, region.id, game))}</td>
                <td className="num">
                  {license ? (
                    <button
                      className="link danger"
                      onClick={() =>
                        window.confirm(`Stop broadcasting ${channel.name} in ${region.name}? The license is given back without a refund, and you can’t buy another ${MEDIUM_NAMES[channel.medium]} license there for ${RENEWAL.barYears} years.`) &&
                        run((s) => dropLicense(s, license.id))
                      }
                    >
                      Drop
                    </button>
                  ) : free === 0 && auction ? (
                    <span className="muted small">Up for auction</span>
                  ) : !regionOpen(game, region.id) ? (
                    <span className="muted small" title={lockedReason('regions')}>
                      <Icon name="locked" size={13} /> Not yet
                    </span>
                  ) : (
                    <button
                      className="primary"
                      data-guide={channel.medium === 'tv' ? `buy-tv-license-${region.id}` : `buy-license-${region.id}`}
                      disabled={free === 0}
                      title={free === 0 && channel.medium === 'tv' ? (nextYear ? `The broadcasting authority issues the next TV license here in ${nextYear}. It will be auctioned.` : 'No more TV licenses are planned here.') : undefined}
                      onClick={() => run((s) => buyLicense(s, channel.id, region.id))}
                    >
                      {free === 0 ? (channel.medium === 'tv' && nextYear ? `Next in ${nextYear}` : 'All taken') : `Buy · ${formatMoney(licensePrice(channel.medium, region.id, game))}`}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Licenses per region and medium: who holds them and how many are left. */
function MarketPanel({ game }: { game: GameState }) {
  const count = (medium: Medium, regionId: RegionId) => ({
    mine: game.licenses.filter((l) => l.medium === medium && l.regionId === regionId).length,
    rivals: game.rivals.flatMap((r) => r.channels).filter((c) => c.medium === medium && c.regionIds.includes(regionId)).length,
  });
  return (
    <Panel title="Licenses" help="licenses">
      <p className="muted small">
        Radio licenses grow with the population; rivals expand into free ones but never take the last one. TV licenses
        are issued a few at a time: a second in every region by 1972, then more over the years. Every new license is auctioned for a week first.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>Region</th>
              <th scope="colgroup" colSpan={3} className="center">Radio</th>
              <th scope="colgroup" colSpan={3} className="center">TV</th>
            </tr>
            <tr>
              <th scope="col" className="num">You</th>
              <th scope="col" className="num">Rivals</th>
              <th scope="col" className="num">Free</th>
              <th scope="col" className="num">You</th>
              <th scope="col" className="num">Rivals</th>
              <th scope="col" className="num">Free</th>
            </tr>
          </thead>
          <tbody>
            {REGIONS.map((region) => {
              const radio = count('radio', region.id);
              const tv = count('tv', region.id);
              return (
                <tr key={region.id}>
                  <th scope="row">{region.name}</th>
                  <td className="num">{radio.mine}</td>
                  <td className="num">{radio.rivals}</td>
                  <td className="num">{freeLicenses(game, 'radio', region.id)}</td>
                  <td className="num">{tv.mine}</td>
                  <td className="num">{tv.rivals}</td>
                  <td className="num">{freeLicenses(game, 'tv', region.id)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** Open license auctions, with the player's sealed bid. */
export function AuctionsPanel({ game }: { game: GameState }) {
  // A rival's renewal round only matters if one of the player's channels could take the license over.
  const auctions = game.auctions.filter(
    (a) =>
      !a.holder ||
      a.holder.ownerId === PLAYER ||
      game.channels.some((c) => c.medium === a.medium && !game.licenses.some((l) => l.channelId === c.id && l.regionId === a.regionId)),
  );
  if (auctions.length === 0) return null;
  return (
    <Panel title="License auctions" help="auctions">
      <p className="muted small">
        Sealed bids: the highest bid wins when the auction closes, and you only pay if you win. Rivals that want the license
        bid above the reserve. Every license also returns here for a renewal round at the end of its {RENEWAL.termYears}-year
        term: the holder keeps it unless someone bids more than {Math.round((1 + RENEWAL.holderAdvantage) * 100)}% of the holder’s bid.
      </p>
      {auctions.map((a) => (
        <AuctionRow key={a.id} game={game} auction={a} />
      ))}
    </Panel>
  );
}

function AuctionRow({ game, auction }: { game: GameState; auction: Auction }) {
  const run = useGameStore((s) => s.run);
  const holder = auction.holder;
  const own = holder?.ownerId === PLAYER;
  const holderName = holder && (own ? game.channels : game.rivals.flatMap((r) => r.channels)).find((c) => c.id === holder.channelId)?.name;
  // Only the channel that holds a license can renew it; anything else is open to every channel that isn't in the region yet.
  const channels = game.channels.filter((c) =>
    own ? c.id === holder.channelId : c.medium === auction.medium && !game.licenses.some((l) => l.channelId === c.id && l.regionId === auction.regionId),
  );
  const [chosen, setChannelId] = useState(auction.bid?.channelId ?? '');
  // Channels can be created after this form first rendered.
  const channelId = channels.some((c) => c.id === chosen) ? chosen : (channels[0]?.id ?? '');
  const [amount, setAmount] = useState(String(auction.bid?.amount ?? auction.reserve));
  const region = getRegion(auction.regionId).name;
  const license = `${auction.medium === 'tv' ? 'TV' : 'Radio'} license · ${region}`;
  const label = !holder ? license : own ? `Renewal · ${license} · ${holderName}` : `Take over · ${license} · held by ${holderName}`;

  return (
    <article className="deal-card">
      <header>
        <h3>{label}</h3>
        <span className="muted small">Closes {formatDate(auction.endsOn)}</span>
      </header>
      <div className="row muted small">
        <span>Reserve {formatMoney(auction.reserve)}</span>·<span>{formatMoney(licenseMonthly(auction.medium, auction.regionId, game))}/month</span>·
        <span>
          {holder && !own
            ? 'The holder’s bid is secret'
            : auction.interested === 0
              ? 'No rival interest yet'
              : `${auction.interested} rival${auction.interested === 1 ? '' : 's'} interested`}
        </span>
      </div>
      {own && !auction.bid && <p className="muted small">If you don’t bid, the reserve is paid for you. Bid more if rivals are interested.</p>}
      {auction.bid && (
        <div className="row">
          <Tag tone="good">Your bid: {formatMoney(auction.bid.amount)} for {game.channels.find((c) => c.id === auction.bid!.channelId)?.name}</Tag>
          <button className="link danger" onClick={() => run((s) => withdrawBid(s, auction.id))}>Withdraw</button>
        </div>
      )}
      {channels.length === 0 ? (
        <span className="muted small">Start a {MEDIUM_NAMES[auction.medium]} channel to bid.</span>
      ) : (
        <form
          className="row bid-form"
          onSubmit={(e) => {
            e.preventDefault();
            run((s) => placeBid(s, auction.id, channelId, Number(amount)));
          }}
        >
          <label>
            Channel
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            Bid (€)
            <input type="number" min={auction.reserve} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <button className="primary" type="submit">{auction.bid ? 'Change bid' : 'Place bid'}</button>
        </form>
      )}
    </article>
  );
}

function RivalsPanel({ game }: { game: GameState }) {
  const regionName = (id: string) => REGIONS.find((r) => r.id === id)?.name ?? id;
  return (
    <Panel title="Competition" help="rivals">
      {game.rivals.map((rival) => (
        <div key={rival.id} className="rival-block">
          <div className="rival-head">
            <strong>{rival.name}</strong> <Tag>{PERSONALITIES[rival.personality].label}</Tag>
          </div>
          {rival.channels.map((rc) => {
            const reps = Object.values(rc.reputation);
            const avg = reps.reduce((a, b) => a + (b ?? 0), 0) / Math.max(1, reps.length);
            return (
              <div key={rc.id} className="rival">
                <LogoBadge logo={rc.logo} size={28} />
                <div>
                  <div>
                    {rc.name} {rc.medium === 'tv' && <Tag>TV</Tag>}
                  </div>
                  <div className="muted small">{rc.regionIds.map(regionName).join(', ')}</div>
                </div>
                <span className="stat">
                  <Meter value={avg} tone="green" label={`Reputation ${Math.round(avg * 100)}`} /> {Math.round(avg * 100)}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </Panel>
  );
}
