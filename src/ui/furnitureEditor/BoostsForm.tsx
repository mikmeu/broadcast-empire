// The boosts of a piece: what it does for a room or the company besides standing there, within the limits of BOOSTS.

import { BOOSTS } from '../../config/balance';
import { GENRES } from '../../config/genres';
import { ROOM_TYPE_NAMES, type FurnitureBoost, type RoomType } from '../../config/office';
import { limitOf, minimumPrice } from '../../mods/furnitureFile';
import type { Role } from '../../sim/state';
import { formatMoney } from '../format';
import { ROLE_TITLES } from '../screens/office/people';
import { Fields, Pick } from './fields';

type Kind = FurnitureBoost['kind'];

const KINDS: readonly (readonly [Kind, string])[] = [
  ['skill', 'Staff of a role get more done'],
  ['morale', 'Morale of the people in the room or on the floor'],
  ['wear', 'Furniture in the room wears out more slowly'],
  ['dirt', 'The room gets dirty more slowly'],
  ['campaignCost', 'Campaigns cost less'],
  ['meetingMorale', 'Meetings lift morale more'],
  ['recorded', 'Radio shows of the engineer beside it are better'],
  ['genreQuality', 'Shows of some genres are better'],
  ['audience', 'A studio audience counts for more'],
];

const ROLE_OPTIONS = (Object.keys(ROLE_TITLES) as Role[]).map((role): readonly [Role, string] => [role, ROLE_TITLES[role]]);
const ROOM_OPTIONS = [['', 'Any room'] as const, ...(Object.keys(ROOM_TYPE_NAMES) as RoomType[]).map((room) => [room, ROOM_TYPE_NAMES[room]] as const)];

/** A boost of a kind, at half the most it may give. */
function newBoost(kind: Kind): FurnitureBoost {
  const half = (boost: FurnitureBoost): FurnitureBoost => ({ ...boost, amount: round(BOOSTS[limitOf(boost)].max / 2) });
  switch (kind) {
    case 'skill': return half({ kind, role: 'production', amount: 0 });
    case 'dirt': return half({ kind, amount: 0 });
    case 'genreQuality': return half({ kind, genres: [GENRES[0]!.id], amount: 0 });
    case 'morale': return half({ kind, reach: 'room', amount: 0 });
    default: return half({ kind, amount: 0 } as FurnitureBoost);
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** The boost with its amount brought down to what its kind allows, for when the kind or the room it names changed. */
const clamp = (boost: FurnitureBoost): FurnitureBoost => ({ ...boost, amount: Math.min(boost.amount, BOOSTS[limitOf(boost)].max) });

export function BoostsForm({ boosts, cost, onChange, onCost }: { boosts: FurnitureBoost[]; cost: number; onChange: (boosts: FurnitureBoost[]) => void; onCost: (cost: number) => void }) {
  const set = (i: number, boost: FurnitureBoost) => onChange(boosts.map((b, n) => (n === i ? clamp(boost) : b)));
  const least = minimumPrice(boosts);
  return (
    <section className="fe-section" aria-label="Boosts">
      <h3>Boosts <span className="muted small">· {boosts.length} of 4</span></h3>
      {boosts.map((boost, i) => {
        const limit = BOOSTS[limitOf(boost)];
        return (
          <fieldset key={i} className="fe-part">
            <legend className="small">Boost {i + 1}</legend>
            <Fields>
              <Pick label="Kind" value={boost.kind} options={KINDS} onChange={(kind) => set(i, newBoost(kind))} />
              {boost.kind === 'skill' && <Pick label="Role" value={boost.role} options={ROLE_OPTIONS} onChange={(role) => set(i, { ...boost, role })} />}
              {boost.kind === 'morale' && (
                <Pick label="Reaches" value={boost.reach} options={[['room', 'The room'], ['floor', 'The whole floor']]} onChange={(reach) => set(i, { ...boost, reach })} />
              )}
              {boost.kind === 'dirt' && (
                <Pick label="In" value={boost.roomType ?? ''} options={ROOM_OPTIONS} onChange={(room) => set(i, room === '' ? { kind: 'dirt', amount: boost.amount } : { ...boost, roomType: room })} />
              )}
            </Fields>
            {boost.kind === 'genreQuality' && (
              <div className="fe-genres" role="group" aria-label="Genres">
                <span className="small">Genres, at most {BOOSTS.genreQuality.genres}</span>
                {GENRES.map((genre) => {
                  const on = boost.genres.includes(genre.id);
                  return (
                    <label key={genre.id} className="fe-check small">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && boost.genres.length >= BOOSTS.genreQuality.genres}
                        onChange={() => {
                          const genres = on ? boost.genres.filter((g) => g !== genre.id) : [...boost.genres, genre.id];
                          if (genres.length > 0) set(i, { ...boost, genres });
                        }}
                      />
                      {genre.name}
                    </label>
                  );
                })}
              </div>
            )}
            <label className="fe-field">
              <span className="small">Amount: {boost.amount} <span className="muted">(at most {limit.max})</span></span>
              <input type="range" min={limit.max / 50} max={limit.max} step={limit.max / 50} value={boost.amount} onChange={(e) => set(i, { ...boost, amount: round(Number(e.target.value)) })} />
            </label>
            <div className="row">
              <button type="button" onClick={() => onChange(boosts.filter((_, n) => n !== i))}>Remove boost</button>
            </div>
          </fieldset>
        );
      })}
      <div className="row">
        <button type="button" disabled={boosts.length >= 4} onClick={() => onChange([...boosts, newBoost('skill')])}>Add a boost</button>
      </div>
      {boosts.length > 0 && (
        <p className="small">
          Lowest price with these boosts: <strong>{formatMoney(least)}</strong>
          {cost < least && <button type="button" onClick={() => onCost(least)}>Set the price to it</button>}
        </p>
      )}
    </section>
  );
}
