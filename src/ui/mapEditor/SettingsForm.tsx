// The settings of the map being drawn (0.21.0, #284): what a `.map.json` holds besides the plan.

import { FLOORS, TRAIN_LENGTH, TRAIN_PIECES, type MapFile, type MapSettings, type Vehicle } from '../../mods/mapFile';
import { SITES } from '../../office/sites';
import { getRegion, type RegionId } from '../../config/world';
import { Fields, Num, Pick } from '../furnitureEditor/fields';

const VEHICLES: readonly (readonly [Vehicle, string])[] = [['car', 'Cars'], ['taxi', 'Taxis'], ['van', 'Vans'], ['truck', 'Trucks']];
const REGIONS = (Object.keys(SITES) as RegionId[]).map((id) => [id, getRegion(id).name] as const);

/** `train-electric-double-a` is “electric double a”. */
const pieceName = (piece: string) => piece.replace(/^train-/, '').replace(/-/g, ' ');

export function SettingsForm({ file, looksLike, onLooks, onChange }: { file: MapFile; looksLike: RegionId; onLooks: (region: RegionId) => void; onChange: (next: MapFile) => void }) {
  const { settings } = file;
  const set = (changes: Partial<MapSettings>) => onChange({ ...file, settings: { ...settings, ...changes } });
  const setTrain = (train: string[]) => set({ train });
  const total = Math.round(VEHICLES.reduce((sum, [kind]) => sum + settings.traffic.mix[kind], 0) * 1000) / 1000;
  const swap = (a: number, b: number) => {
    const train = [...settings.train];
    [train[a], train[b]] = [train[b]!, train[a]!];
    setTrain(train);
  };
  return (
    <div className="me-settings">
      <section className="fe-section" aria-label="The map">
        <h3>The map</h3>
        <Fields>
          <label className="fe-field">
            <span className="small">Name</span>
            <input value={file.name} maxLength={60} onChange={(e) => onChange({ ...file, name: e.target.value })} />
          </label>
          <label className="fe-field">
            <span className="small">Id (the folder it is kept in)</span>
            <input value={file.id} maxLength={64} onChange={(e) => onChange({ ...file, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
          </label>
        </Fields>
        <Pick label="Looks like (for the preview only; not saved)" value={looksLike} options={REGIONS} onChange={onLooks} />
        <p className="muted small">The look gives the houses, ground and hills of a region. The train and the traffic below are the map’s own.</p>
      </section>

      <section className="fe-section" aria-label="The train">
        <h3>The train</h3>
        <p className="muted small">{TRAIN_LENGTH.min} to {TRAIN_LENGTH.max} pieces of the Train Kit, front to rear. It has {settings.train.length}.</p>
        <ol className="me-train">
          {settings.train.map((piece, n) => (
            <li key={n} className="row">
              <select aria-label={`Piece ${n + 1}`} value={piece} onChange={(e) => setTrain(settings.train.map((p, i) => (i === n ? e.target.value : p)))}>
                {TRAIN_PIECES.map((p) => (
                  <option key={p} value={p}>{pieceName(p)}</option>
                ))}
              </select>
              <button type="button" disabled={n === 0} onClick={() => swap(n, n - 1)} aria-label={`Move piece ${n + 1} towards the front`} title="Towards the front">↑</button>
              <button type="button" disabled={n === settings.train.length - 1} onClick={() => swap(n, n + 1)} aria-label={`Move piece ${n + 1} towards the rear`} title="Towards the rear">↓</button>
              <button type="button" disabled={settings.train.length <= TRAIN_LENGTH.min} onClick={() => setTrain(settings.train.filter((_, i) => i !== n))} aria-label={`Remove piece ${n + 1}`} title="Remove">×</button>
            </li>
          ))}
        </ol>
        <div className="row">
          <button type="button" disabled={settings.train.length >= TRAIN_LENGTH.max} onClick={() => setTrain([...settings.train, settings.train[settings.train.length - 1] ?? TRAIN_PIECES[0]!])}>Add a piece</button>
        </div>
        <Pick label="Where the railway runs" value={settings.railway} options={[['elevated', 'On pillars over the streets'], ['ground', 'On the ground, with level crossings']]} onChange={(railway) => set({ railway })} />
        {settings.railway === 'ground' && <p className="muted small">A railway on the ground needs a box 4 tiles wide or more. The roads that cross it get barriers, and the map check says what is too near.</p>}
      </section>

      <section className="fe-section" aria-label="The traffic">
        <h3>The traffic</h3>
        <Fields>
          <Num label="Seconds between two vehicles" value={settings.traffic.every} step={1} min={1} max={120} onChange={(every) => set({ traffic: { ...settings.traffic, every } })} />
          {VEHICLES.map(([kind, label]) => (
            <Num key={kind} label={`${label} (share)`} value={settings.traffic.mix[kind]} step={0.01} min={0} max={1} onChange={(share) => set({ traffic: { ...settings.traffic, mix: { ...settings.traffic.mix, [kind]: share } } })} />
          ))}
        </Fields>
        <p className={Math.abs(total - 1) > 0.001 ? 'small fe-error' : 'muted small'}>The shares add up to {total}; they must add up to 1.</p>
      </section>

      <section className="fe-section" aria-label="The building">
        <h3>The building</h3>
        <Fields>
          <Num label={`Floors (${FLOORS.min} to ${FLOORS.max})`} value={settings.floors} step={1} min={FLOORS.min} max={FLOORS.max} onChange={(floors) => set({ floors: Math.round(floors) })} />
          <Pick
            label="The bus stops"
            value={settings.busStop.from}
            options={[['entrance', 'At the entrance'], ['drawing', 'Where the plan has the bus stop']]}
            onChange={(from) => set({ busStop: from === 'drawing' ? { from } : { from, shift: 0 } })}
          />
          {settings.busStop.from === 'entrance' && <Num label="Along the street from the door (tiles; west is negative)" value={settings.busStop.shift} step={0.5} min={-60} max={60} onChange={(shift) => set({ busStop: { from: 'entrance', shift } })} />}
        </Fields>
        <p className="muted small">The office has this many floors in the preview.A town of roads always puts the stop at the entrance.</p>
      </section>
    </div>
  );
}
