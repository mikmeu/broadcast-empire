// The places for people: where someone sits, stands or works at the piece, which way they face and for how high.

import { MODS } from '../../config/balance';
import { ANIMATIONS, type Activity, type Spot } from '../../office/assets';
import { Fields, Num, Pick, Tiers } from './fields';

const NAMES: Record<Activity, string> = { sit: 'Sits', work: 'Works', idle: 'Stands', walk: 'Walks', clean: 'Cleans' };
const ACTIVITIES = (Object.keys(ANIMATIONS) as Activity[]).map((id): readonly [Activity, string] => [id, NAMES[id]]);

export function SpotsForm({ spots, selected, onSelect, onChange, w, h }: { spots: Spot[]; selected: number | undefined; onSelect: (index: number | undefined) => void; onChange: (spots: Spot[]) => void; w: number; h: number }) {
  const set = (i: number, changes: Partial<Spot>) => onChange(spots.map((spot, n) => (n === i ? { ...spot, ...changes } : spot)));
  return (
    <section className="fe-section" aria-label="Places for people">
      <h3>Places for people <span className="muted small">· {spots.length} of {MODS.spots}</span></h3>
      <p className="muted small">People take the places in this order. Turn 0 faces away from you, 2 towards you; the arrow in the picture shows the way. The one you pick is lit.</p>
      {spots.map((spot, i) => (
        <fieldset key={i} className={i === selected ? 'fe-part active' : 'fe-part'} onFocus={() => onSelect(i)}>
          <legend className="small">Place {i + 1}</legend>
          <Fields>
            <Num label="x" value={spot.at[0]} onChange={(v) => set(i, { at: [v, spot.at[1]] })} />
            <Num label="z" value={spot.at[1]} onChange={(v) => set(i, { at: [spot.at[0], v] })} />
            <Num label="Turn" value={spot.turn} step={0.5} onChange={(turn) => set(i, { turn })} />
            <Pick label="Does" value={spot.activity} options={ACTIVITIES} onChange={(activity) => set(i, { activity })} />
            <Num label="Raised by" value={spot.up ?? 0} min={0} max={4} onChange={(v) => set(i, { up: v === 0 ? undefined : v })} />
          </Fields>
          <Tiers tiers={spot.tiers} onChange={(tiers) => set(i, { tiers })} />
          <div className="row">
            <button type="button" onClick={() => onChange(spots.filter((_, n) => n !== i))}>Remove place</button>
          </div>
        </fieldset>
      ))}
      <div className="row">
        <button
          type="button"
          disabled={spots.length >= MODS.spots}
          onClick={() => {
            onChange([...spots, { at: [w / 2, h / 2], turn: 0, activity: 'sit' }]);
            onSelect(spots.length);
          }}
        >
          Add a place
        </button>
      </div>
    </section>
  );
}
