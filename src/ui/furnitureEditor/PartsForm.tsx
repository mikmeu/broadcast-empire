// The parts of a piece as a tree: a kit model, a box, a cylinder, or a group of parts that stand and lean together.

import { MODS } from '../../config/balance';
import { MODEL_IDS, TONES, type ModelId, type Part, type Tone } from '../../office/assets';
import { addPart, changeKind, countParts, duplicatePart, movePart, newPart, partKind, removePart, replacePart, type Path, type PartKind } from '../../mods/partsTree';
import { Fields, Num, Pick, Tiers } from './fields';

const KINDS: readonly (readonly [PartKind, string])[] = [['model', 'A model from the kit'], ['box', 'A box'], ['cylinder', 'A cylinder'], ['group', 'A group of parts']];
const TONE_OPTIONS = TONES.map((tone): readonly [Tone, string] => [tone, tone]);
const MODEL_OPTIONS = MODEL_IDS.map((id): readonly [ModelId, string] => [id, id]);
/** The deepest a group may hold groups (the checker's MAX_DEPTH). */
const MAX_DEPTH = 4;

export function PartsForm({ parts, onChange }: { parts: Part[]; onChange: (parts: Part[]) => void }) {
  const total = countParts(parts);
  return (
    <section className="fe-section" aria-label="Parts">
      <h3>Parts <span className="muted small">· {total} of {MODS.parts}</span></h3>
      <p className="muted small">Positions are in tiles from the top left corner of the footprint: x to the right, y up, z towards you. A part stands on its underside. Turns are in quarter turns.</p>
      <PartList parts={parts} parent={[]} depth={1} all={parts} onChange={onChange} />
    </section>
  );
}

function PartList({ parts, parent, depth, all, onChange }: { parts: Part[]; parent: Path; depth: number; all: Part[]; onChange: (parts: Part[]) => void }) {
  return (
    <div className="fe-parts">
      {parts.map((part, i) => (
        <PartRow key={i} part={part} path={[...parent, i]} first={i === 0} last={i === parts.length - 1} depth={depth} all={all} onChange={onChange} />
      ))}
      <div className="row fe-add">
        {KINDS.filter(([kind]) => kind !== 'group' || depth < MAX_DEPTH).map(([kind, name]) => (
          <button key={kind} type="button" onClick={() => onChange(addPart(all, parent, newPart(kind)))}>Add {name.toLowerCase()}</button>
        ))}
      </div>
    </div>
  );
}

function PartRow({ part, path, first, last, depth, all, onChange }: { part: Part; path: Path; first: boolean; last: boolean; depth: number; all: Part[]; onChange: (parts: Part[]) => void }) {
  const kind = partKind(part);
  const set = (next: Part) => onChange(replacePart(all, path, next));
  const patch = (changes: Record<string, unknown>) => set({ ...part, ...changes } as Part);
  const [x, y, z] = part.at;
  return (
    <fieldset className="fe-part">
      <legend className="small">Part {path.map((n) => n + 1).join('.')}</legend>
      <div className="row">
        <Pick label="Kind" value={kind} options={KINDS} onChange={(next) => set(changeKind(part, next))} />
        <button type="button" onClick={() => onChange(movePart(all, path, -1))} disabled={first} aria-label="Move up" title="Move up">↑</button>
        <button type="button" onClick={() => onChange(movePart(all, path, 1))} disabled={last} aria-label="Move down" title="Move down">↓</button>
        <button type="button" onClick={() => onChange(duplicatePart(all, path))}>Duplicate</button>
        <button type="button" onClick={() => onChange(removePart(all, path))}>Remove</button>
      </div>
      <Fields>
        <Num label="x" value={x} onChange={(v) => patch({ at: [v, y, z] })} />
        <Num label="y (up)" value={y} onChange={(v) => patch({ at: [x, v, z] })} />
        <Num label="z" value={z} onChange={(v) => patch({ at: [x, y, v] })} />
        <Num label="Turn" value={part.turn ?? 0} step={0.5} onChange={(v) => patch({ turn: v === 0 ? undefined : v })} />
      </Fields>
      <Tiers tiers={part.tiers} onChange={(tiers) => patch({ tiers })} />
      {'model' in part && (
        <>
          <Fields>
            <Pick label="Model" value={part.model} options={MODEL_OPTIONS} onChange={(model) => patch({ model })} />
            <Num label="Size (1 is the kit’s)" value={part.size ?? 1} step={0.1} min={0.1} max={4} onChange={(v) => patch({ size: v === 1 ? undefined : v })} />
          </Fields>
          <Tones tones={part.tones} onChange={(tones) => patch({ tones })} />
        </>
      )}
      {'box' in part && (
        <Fields>
          <Num label="Width" value={part.box[0]} min={0} onChange={(v) => patch({ box: [v, part.box[1], part.box[2]] })} />
          <Num label="Height" value={part.box[1]} min={0} onChange={(v) => patch({ box: [part.box[0], v, part.box[2]] })} />
          <Num label="Depth" value={part.box[2]} min={0} onChange={(v) => patch({ box: [part.box[0], part.box[1], v] })} />
          <Pick label="Colour" value={part.tone} options={TONE_OPTIONS} onChange={(tone) => patch({ tone })} />
        </Fields>
      )}
      {'cylinder' in part && (
        <Fields>
          <Num label="Radius" value={part.cylinder[0]} min={0} onChange={(v) => patch({ cylinder: [v, part.cylinder[1], part.cylinder[2]] })} />
          <Num label="Height" value={part.cylinder[1]} min={0} onChange={(v) => patch({ cylinder: [part.cylinder[0], v, part.cylinder[2]] })} />
          <Num label="Top radius" value={part.cylinder[2] ?? part.cylinder[0]} min={0} onChange={(v) => patch({ cylinder: [part.cylinder[0], part.cylinder[1], v === part.cylinder[0] ? undefined : v].filter((n, i) => i < 2 || n !== undefined) })} />
          <Pick label="Colour" value={part.tone} options={TONE_OPTIONS} onChange={(tone) => patch({ tone })} />
        </Fields>
      )}
      {('box' in part || 'cylinder' in part || 'parts' in part) && (
        <Fields>
          <Num label="Tilt (degrees)" value={('tilt' in part && part.tilt) || 0} step={5} onChange={(v) => patch({ tilt: v === 0 ? undefined : v })} />
          <Num label="Roll (degrees)" value={('roll' in part && part.roll) || 0} step={5} onChange={(v) => patch({ roll: v === 0 ? undefined : v })} />
        </Fields>
      )}
      {'parts' in part && (
        <div className="fe-group">
          <PartList parts={part.parts} parent={path} depth={depth + 1} all={all} onChange={onChange} />
        </div>
      )}
    </fieldset>
  );
}

/** The colours of a kit model's materials, by the kit’s name for the material. */
function Tones({ tones, onChange }: { tones: Record<string, Tone> | undefined; onChange: (tones: Record<string, Tone> | undefined) => void }) {
  const entries = Object.entries(tones ?? {});
  const write = (next: [string, Tone][]) => onChange(next.length === 0 ? undefined : Object.fromEntries(next));
  return (
    <div className="fe-tones">
      {entries.map(([material, tone], i) => (
        <Fields key={i}>
          <label className="fe-field">
            <span className="small">Material</span>
            <input value={material} maxLength={40} onChange={(e) => write(entries.map((entry, n) => (n === i ? [e.target.value, tone] : entry)))} />
          </label>
          <Pick label="Colour" value={tone} options={TONE_OPTIONS} onChange={(next) => write(entries.map((entry, n) => (n === i ? [material, next] : entry)))} />
          <button type="button" onClick={() => write(entries.filter((_, n) => n !== i))}>Remove colour</button>
        </Fields>
      ))}
      {entries.length < 12 && <button type="button" onClick={() => write([...entries, [`material${entries.length + 1}`, 'wood']])}>Recolour a material</button>}
    </div>
  );
}
