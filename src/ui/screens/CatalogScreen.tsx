import { lazy, Suspense } from 'react';
import { RESEARCH } from '../../config/balance';
import { GENRES } from '../../config/genres';
import { FURNITURE, ROOM_TYPE_NAMES, ROOM_TYPE_NOTES, STUDIO_REQUIREMENTS, type FurnitureType, type RoomType, inText } from '../../config/office';
import { getTech, type Tech } from '../../config/tech';
import { toCalendarDate } from '../../sim/calendar';
import { wearsOut } from '../../sim/office';
import { furniturePrice, lockedTiers, officeOutput, ownsTech, purchaseTier, researchCost } from '../../sim/tech';
import { aTechnician } from '../../sim/upkeep';
import { formatCount, formatMoney } from '../format';
import { Icon } from '../Icon';
import { useOfficeView } from '../officeView';
import { useGame, useGameStore } from '../store';

// The picture is drawn with the office's own models, which come with the 3D library.
const FurniturePreview = lazy(() => import('../../office/Office3D').then((m) => ({ default: m.FurniturePreview })));

const ROOM_TYPES = Object.keys(ROOM_TYPE_NAMES) as RoomType[];
const systemReducesMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The pieces that go in a kind of room, in the order of the furniture list; what is no longer sold is left out. */
const piecesFor = (type: RoomType) => (Object.keys(FURNITURE) as FurnitureType[]).filter((t) => FURNITURE[t].rooms.includes(type) && !FURNITURE[t].retired);

/**
 * The furniture catalog: everything that can be placed, with a tab for each
 * kind of room. A piece shows what it looks like, what it is for and what it
 * costs, and can be placed from here. Newer versions that still have to be
 * researched are listed under their piece, with a lock.
 */
export function CatalogScreen() {
  const game = useGame();
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion) || systemReducesMotion();
  const { catalogTab: tab, catalogItem, catalogTier, placing } = useOfficeView();
  const { openCatalog, place } = useOfficeView.getState();

  const pieces = piecesFor(tab);
  const type = catalogItem && pieces.includes(catalogItem) ? catalogItem : pieces[0];
  /** The technology a whole piece waits for, if it is not for sale yet. */
  const waitsFor = (t: FurnitureType) => {
    const { unlock } = FURNITURE[t];
    return unlock && !ownsTech(game, unlock) ? getTech(unlock) : undefined;
  };
  // What is locked about the piece that is open: the whole piece, or the newer version that was picked.
  const lock = type ? (waitsFor(type) ? { tier: 1, tech: waitsFor(type)! } : lockedTiers(game, type).find((l) => l.tier === catalogTier)) : undefined;
  const genres = GENRES.filter((g) => g.studio === tab).map((g) => g.name);

  return (
    <div className="catalog">
      <div className="segmented catalog-tabs" role="tablist" aria-label="Kind of room">
        {ROOM_TYPES.map((t) => (
          <button key={t} role="tab" data-guide={`catalog-tab-${t}`} aria-selected={t === tab} className={t === tab ? 'active' : undefined} onClick={() => openCatalog(t)}>
            {ROOM_TYPE_NAMES[t]}
          </button>
        ))}
      </div>
      <p className="muted small">
        {ROOM_TYPE_NOTES[tab]}
        {genres.length > 0 && ` Made here: ${genres.join(', ')}.`}
      </p>

      <div className="catalog-layout">
        <ul className="catalog-list" aria-label={`Furniture for a ${inText(ROOM_TYPE_NAMES[tab])}`}>
          {pieces.map((t) => {
            const needed = STUDIO_REQUIREMENTS[tab]?.[t];
            const waiting = waitsFor(t);
            if (waiting) {
              // A piece that is not for sale yet: one entry, with a lock.
              return (
                <li key={t}>
                  <button className={t === type ? 'catalog-entry locked whole active' : 'catalog-entry locked whole'} aria-pressed={t === type} onClick={() => openCatalog(tab, t)}>
                    <span className="catalog-lock">
                      <Icon name="locked" size={16} label="Locked" />
                      <strong>{FURNITURE[t].name}</strong>
                    </span>
                    <span className="small">Research {waiting.name}</span>
                  </button>
                </li>
              );
            }
            return (
              <li key={t}>
                <button data-guide={`catalog-${t}`} className={t === type && !lock ? 'catalog-entry active' : 'catalog-entry'} aria-pressed={t === type && !lock} onClick={() => openCatalog(tab, t)}>
                  <strong>{FURNITURE[t].name}</strong>
                  <span className="small">
                    {formatMoney(furniturePrice(t, purchaseTier(game, t)))}
                    {needed ? ` · needs ${needed}` : ''}
                  </span>
                </button>
                {lockedTiers(game, t).map(({ tier, tech }) => {
                  const open = t === type && lock?.tier === tier;
                  return (
                    <button key={tier} className={open ? 'catalog-entry locked active' : 'catalog-entry locked'} aria-pressed={open} onClick={() => openCatalog(tab, t, tier)}>
                      <span className="catalog-lock">
                        <Icon name="locked" size={16} label="Locked" />
                        <strong>Tier {tier}</strong>
                      </span>
                      <span className="small">Research {tech.name}</span>
                    </button>
                  );
                })}
              </li>
            );
          })}
        </ul>

        {type && (
          <Piece
            key={`${type}/${lock?.tier ?? 'now'}`}
            type={type}
            tab={tab}
            lock={lock}
            still={reduceMotion}
            placing={placing === type}
            onPlace={() => place(placing === type ? null : type)}
          />
        )}
      </div>
    </div>
  );
}

function Piece({ type, tab, lock, still, placing, onPlace }: {
  type: FurnitureType;
  tab: RoomType;
  /** A newer version of the piece that is still locked, shown instead of the one on sale. */
  lock: { tier: number; tech: Tech } | undefined;
  still: boolean;
  placing: boolean;
  onPlace: () => void;
}) {
  const game = useGame();
  const spec = FURNITURE[type];
  const tier = lock?.tier ?? purchaseTier(game, type);
  const year = toCalendarDate(game.day).year;
  const opensIn = lock ? lock.tech.year - RESEARCH.maxYearsEarly : 0;
  const needed = STUDIO_REQUIREMENTS[tab]?.[type];
  const owned = game.rooms.reduce((n, r) => n + r.furniture.filter((f) => f.type === type).length, 0);

  return (
    <section className="catalog-piece" aria-label={spec.name}>
      <div className="catalog-picture">
        <Suspense fallback={<span className="muted small">Fetching it from the storeroom…</span>}>
          <FurniturePreview type={type} tier={tier} still={still} />
        </Suspense>
      </div>
      <h3>
        {spec.name}
        {spec.line && <span className="muted small"> · tier {tier}</span>}
      </h3>
      <p>{spec.about}</p>
      {lock && (
        <div className="catalog-locked">
          <Icon name="locked" size={28} label="Locked" />
          <p className="small">
            <strong>Not for sale yet.</strong>{' '}
            {year < opensIn
              ? `It comes with ${lock.tech.name}, which can be researched from ${opensIn}.`
              : `Research ${lock.tech.name} in the Research window (${formatCount(researchCost(lock.tech, year))} research points).`}{' '}
            {spec.line ? (year >= lock.tech.year ? 'Rivals use it already.' : `Rivals use it from ${lock.tech.year}.`) : ''}{' '}
            {spec.line === 'office'
              ? `Staff at it get ${Math.round((officeOutput(lock.tier) - 1) * 100)}% more done than at tier 1.`
              : spec.line
                ? 'A studio with older equipment than its rivals makes weaker shows.'
                : ''}
          </p>
        </div>
      )}
      <dl className="facts">
        <dt>Price</dt>
        <dd>{formatMoney(furniturePrice(type, tier))}</dd>
        <dt>Takes up</dt>
        <dd>
          {spec.w} × {spec.h} tiles
          {spec.note && <span className="muted small"> · {spec.note.toLowerCase()}</span>}
        </dd>
        <dt>Goes in</dt>
        <dd>{spec.rooms.map((t) => ROOM_TYPE_NAMES[t]).join(', ')}</dd>
        <dt>Needed</dt>
        <dd>
          {needed
            ? `${needed} in a ${inText(ROOM_TYPE_NAMES[tab])}, before it can be used`
            : tab === 'controlRoom' && !spec.comfort
              ? 'One for each studio next door'
              : spec.comfort
                ? 'None; each one makes the room a little nicer'
                : 'As many as you like'}
        </dd>
        <dt>Upkeep</dt>
        <dd>{wearsOut(type) ? `Wears out: ${aTechnician(game)} keeps it working` : 'Does not wear out'}</dd>
        <dt>You have</dt>
        <dd>{owned}</dd>
      </dl>
      {!lock && (
        <>
          <div className="row">
            <button className={placing ? 'primary active' : 'primary'} data-guide={`catalog-place-${type}`} aria-pressed={placing} onClick={onPlace}>
              {placing ? 'Stop placing' : 'Place it'}
            </button>
          </div>
          <p className="muted small">Place it, then point at a free spot in a room of the right kind and click, or take it there with the arrow keys and press Enter. R turns it.</p>
        </>
      )}
    </section>
  );
}
