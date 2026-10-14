import { REGION_ARTICLES } from '../../wiki/articles';
import { useState } from 'react';
import { AUDIENCES, getRegion, type Medium, type RegionId } from '../../config/world';
import { buyLicense, dropLicense } from '../../sim/actions';
import { RENEWAL } from '../../config/balance';
import { formatDate } from '../../sim/calendar';
import { barredUntil, freeLicenses, licenseMonthly, licensePrice, MEDIUM_NAMES } from '../../sim/licenses';
import type { GameState } from '../../sim/state';
import { population, regionShare } from '../../sim/world';
import { Empty, LogoBadge, Meter, Panel, Tag } from '../components';
import { EtheriaMap } from '../EtheriaMap';
import { formatCompact, formatCount, formatMoney, formatPercent } from '../format';
import { useGame, useGameStore } from '../store';
import { AuctionsPanel } from './ChannelScreen';

/** Who broadcasts in a region in one medium. */
function holders(game: GameState, medium: Medium, regionId: RegionId) {
  const yours = game.licenses
    .filter((l) => l.medium === medium && l.regionId === regionId)
    .map((license) => ({ license, channel: game.channels.find((c) => c.id === license.channelId)! }))
    .filter((x) => x.channel !== undefined);
  const rivals = game.rivals.flatMap((rival) =>
    rival.channels.filter((c) => c.medium === medium && c.regionIds.includes(regionId)).map((channel) => ({ rival, channel })),
  );
  const auctions = game.auctions.filter((a) => a.medium === medium && a.regionId === regionId).length;
  return { yours, rivals, free: freeLicenses(game, medium, regionId), auctions };
}

export function LicensesScreen() {
  const game = useGame();
  const [medium, setMedium] = useState<Medium>('radio');
  const [regionId, setRegionId] = useState<RegionId>(game.headquarters);

  return (
    <div className="stack">
      <div className="map-layout">
        <Panel
          title="Etheria"
          help="etheria"
          actions={
            <span className="segmented" role="tablist" aria-label="Medium">
              {(['radio', 'tv'] as const).map((m) => (
                <button key={m} role="tab" aria-selected={m === medium} className={m === medium ? 'active' : undefined} onClick={() => setMedium(m)}>
                  {m === 'tv' ? 'TV' : 'Radio'}
                </button>
              ))}
            </span>
          }
        >
          <EtheriaMap
            selected={regionId}
            onSelect={setRegionId}
            caption={(id) => {
              const h = holders(game, medium, id);
              return `${id === game.headquarters ? 'HQ · ' : ''}you ${h.yours.length} · rivals ${h.rivals.length} · free ${h.free}${h.auctions > 0 ? ` · auction ${h.auctions}` : ''}`;
            }}
          />
          <p className="muted small">
            {medium === 'tv' ? 'TV' : 'Radio'} licenses per region: yours, rivals’ and the ones still free. Click a region for its
            people and its broadcasters.
          </p>
        </Panel>
        <RegionPanel key={regionId} game={game} medium={medium} regionId={regionId} />
      </div>
      <AuctionsPanel game={game} />
    </div>
  );
}

function RegionPanel({ game, medium, regionId }: { game: GameState; medium: Medium; regionId: RegionId }) {
  const run = useGameStore((s) => s.run);
  const region = getRegion(regionId);
  const { yours, rivals, free, auctions } = holders(game, medium, regionId);
  const candidates = game.channels.filter((c) => c.medium === medium && !yours.some((y) => y.channel.id === c.id));
  const price = licensePrice(medium, regionId, game.day);
  const name = MEDIUM_NAMES[medium];
  const barred = barredUntil(game, medium, regionId);

  return (
    <Panel title={region.name} help={REGION_ARTICLES[regionId]} actions={<span className="muted">{formatCompact(population(regionId, game.day))} people</span>}>
      {regionId === game.headquarters && (
        <p className="small">
          <Tag>Your headquarters</Tag> People here know {game.companyName}: a channel that starts here begins with some reputation.
        </p>
      )}
      <div className="tags">
        {region.mainAudiences.map((id) => <Tag key={id} tone="good">{AUDIENCES.find((a) => a.id === id)!.name}</Tag>)}
      </div>
      <div className="quality-grid">
        {AUDIENCES.map((a) => {
          const share = regionShare(regionId, a.id, game.day);
          return [
            <span key={`${a.id}-name`} className={region.mainAudiences.includes(a.id) ? undefined : 'muted'}>{a.name}</span>,
            <Meter key={`${a.id}-bar`} value={share / 0.4} tone={region.mainAudiences.includes(a.id) ? 'accent' : 'green'} label={`${a.name} ${formatPercent(share)}`} />,
            <span key={`${a.id}-value`} className="muted">{formatPercent(share)}</span>,
          ];
        })}
      </div>
      <p className="muted small">The three tagged audiences are this region’s main ones: twice as common here as in a region where they aren’t.</p>

      <h3>{medium === 'tv' ? 'TV' : 'Radio'} licenses</h3>
      <p className="muted small">
        {free} free at {formatMoney(price)} plus {formatMoney(licenseMonthly(medium, regionId, game.day))} a month
        {auctions > 0 && ` · ${auctions} being auctioned`}
      </p>
      {yours.map(({ license, channel }) => (
        <div key={license.id} className="license-row">
          <LogoBadge logo={channel.logo} size={24} />
          <span>
            <strong>{channel.name}</strong> <Tag tone="good">yours</Tag>
            <span className="muted small"> · until {formatDate(license.expiresOn).slice(4)}</span>
          </span>
          <button
            className="link danger"
            onClick={() => window.confirm(`Stop broadcasting ${channel.name} in ${region.name}? The license is given back without a refund, and you can’t buy another ${name} license there for ${RENEWAL.barYears} years.`) && run((s) => dropLicense(s, license.id))}
          >
            Drop
          </button>
        </div>
      ))}
      {rivals.map(({ rival, channel }) => (
        <div key={channel.id} className="license-row">
          <LogoBadge logo={channel.logo} size={24} />
          <span>
            {channel.name} <span className="muted small">· {rival.name} · until {formatDate(channel.licenseExpiry[regionId] ?? game.day).slice(4)}</span>
          </span>
          <span className="muted small">{formatCount(Math.round((channel.reputation[regionId] ?? 0) * 100))} rep</span>
        </div>
      ))}
      {yours.length + rivals.length === 0 && <Empty>Nobody broadcasts {name} here yet.</Empty>}
      <p className="muted small">
        Every license runs for {RENEWAL.termYears} years and then goes to a renewal round, where you can bid for a rival’s.
      </p>
      {barred !== undefined && <Tag tone="warning">You can’t buy a {name} license here until {formatDate(barred).slice(4)}</Tag>}

      {candidates.length === 0 ? (
        <p className="muted small">{game.channels.some((c) => c.medium === medium) ? `All your ${name} channels broadcast here.` : `Start a ${name} channel in On air, under Channels, to buy a license here.`}</p>
      ) : (
        <div className="row">
          {candidates.map((c) => (
            <button key={c.id} className="primary" disabled={free === 0 || barred !== undefined} onClick={() => run((s) => buyLicense(s, c.id, regionId))}>
              {free === 0 ? `No free license for ${c.name}` : `Buy for ${c.name} · ${formatMoney(price)}`}
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}
