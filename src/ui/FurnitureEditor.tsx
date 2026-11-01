import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MODS } from '../config/balance';
import { FURNITURE, ROOM_TYPE_NAMES, type BuiltInFurniture, type RoomType } from '../config/office';
import { builtInFile, checkDraft, copyOfBuiltIn, kebab, newPiece, uniqueId } from '../mods/draft';
import { checkModel, toFurnitureFile, type ModFurniture } from '../mods/furnitureFile';
import { exportFurnitureFile, importFurnitureFile, loadFurnitureMods, saveModPiece, type ModProblem } from '../mods/load';
import { PREVIEW_TYPE, createPreview } from '../mods/preview';
import type { PreviewView } from '../office/scene/previews';
import type { DesktopBridge } from '../persistence/desktop';
import { formatMoney } from './format';
import { BoostsForm } from './furnitureEditor/BoostsForm';
import { PartsForm } from './furnitureEditor/PartsForm';
import { SpotsForm } from './furnitureEditor/SpotsForm';
import { Fields, Num } from './furnitureEditor/fields';
import { useGameStore } from './store';

// The picture is drawn with the office's own models, which come with the 3D library.
const FurniturePreview = lazy(() => import('../office/Office3D').then((m) => ({ default: m.FurniturePreview })));

type Mods = NonNullable<DesktopBridge['mods']>;

/** Where the piece in the form came from. */
type Source = { kind: 'builtIn'; type: BuiltInFurniture } | { kind: 'mod'; id: string } | { kind: 'new' } | { kind: 'import' };

const FRONT: PreviewView = { turn: 0, zoom: 1, x: 0, y: 0 };
const BUILT_IN = Object.keys(FURNITURE) as BuiltInFurniture[];
const ROOMS = Object.keys(ROOM_TYPE_NAMES) as RoomType[];
const systemReducesMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LEAVE = 'Leave without saving? Your changes to this piece will be lost.';

/** What a draft looks like as a file, for telling whether it changed. Its model counts by its bytes. */
const snapshot = (draft: ModFurniture) => toFurnitureFile({ ...draft, glb: undefined }) + (draft.glb ? `#${draft.glb.length}:${draft.glb[0]}:${draft.glb[draft.glb.length - 1]}` : '');

/** A model that cannot be drawn (a file that passed the checks but is still broken) must not take the whole screen with it. */
class PreviewGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p className="small fe-error">The model could not be drawn. Choose another one.</p> : this.props.children;
  }
}

/**
 * The furniture editor (0.21.0), desktop only: open one of the game's pieces (as a copy), a piece in the mods folder
 * or a file, or start a new piece; set everything a `.furniture.json` holds; look at it drawn by the office's own
 * renderer; save it to the mods folder or export it. Nothing here touches a game: no game loads these pieces yet.
 */
export function FurnitureEditor({ mods, onClose }: { mods: Mods; onClose: () => void }) {
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion) || systemReducesMotion();
  const [found, setFound] = useState<{ pieces: ModFurniture[]; problems: ModProblem[] }>({ pieces: [], problems: [] });
  const [draft, setDraft] = useState<ModFurniture | null>(null);
  const [source, setSource] = useState<Source>({ kind: 'new' });
  const [clean, setClean] = useState('');
  const [message, setMessage] = useState<{ text: string; bad?: boolean }>();
  const [tier, setTier] = useState(1);
  const [spot, setSpot] = useState<number>();
  const [revision, setRevision] = useState(0);
  // The picture stands still until it is turned, zoomed or moved with the buttons under it.
  const [view, setView] = useState<PreviewView>(FRONT);
  const [people, setPeople] = useState(false);
  const look = (changes: Partial<PreviewView>) => setView({ ...view, ...changes });

  const refresh = useCallback(() => loadFurnitureMods(mods).then(setFound), [mods]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The draft is put on the game's list under a reserved id so the renderer can draw it, and taken off when the editor closes.
  const preview = useMemo(createPreview, []);
  useEffect(() => () => preview.stop(), [preview]);
  useEffect(() => {
    if (!draft) return;
    preview.show(draft);
    setRevision((n) => n + 1);
  }, [draft, preview]);

  const dirty = draft !== null && snapshot(draft) !== clean;
  const check = useMemo(() => (draft ? checkDraft(draft) : undefined), [draft]);
  const leave = () => !dirty || window.confirm(LEAVE);

  // Escape goes back: from the piece to the list, then to the home screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target instanceof HTMLElement && e.target.tagName === 'SELECT')) return;
      if (draft) {
        if (!dirty || window.confirm(LEAVE)) {
          setDraft(null);
          setMessage(undefined);
        }
      } else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, dirty, onClose]);

  const open = (next: ModFurniture, from: Source) => {
    if (!leave()) return;
    setDraft(next);
    setSource(from);
    setClean(snapshot(next));
    setMessage(undefined);
    setSpot(undefined);
    setTier(1);
  };
  const taken = [...found.pieces.map((p) => p.id), ...found.problems.map((p) => p.id)];
  const change = (changes: (d: ModFurniture) => ModFurniture) => draft && setDraft(changes(draft));
  const setSpec = (spec: Partial<ModFurniture['spec']>) => change((d) => ({ ...d, spec: { ...d.spec, ...spec } }));

  const importFile = async () => {
    if (!leave()) return;
    const file = await importFurnitureFile(mods);
    if (!file) return;
    if (!file.ok) return setMessage({ text: `${file.fileName} cannot be used: ${file.reason}`, bad: true });
    const piece = { ...file.piece, id: uniqueId(file.piece.id, taken) };
    setDraft(piece);
    setSource({ kind: 'import' });
    setClean(snapshot(piece));
    setSpot(undefined);
    setMessage({ text: `Opened ${file.fileName}. It is not in your folder until you save it.` });
  };

  const save = async () => {
    if (!draft || !check?.ok) return;
    if (taken.includes(draft.id) && !(source.kind === 'mod' && source.id === draft.id) && !window.confirm(`There is a piece called “${draft.id}” in your folder already. Replace it?`)) return;
    try {
      await saveModPiece(draft, mods);
      setSource({ kind: 'mod', id: draft.id });
      setClean(snapshot(draft));
      setMessage({ text: `Saved “${draft.spec.name}” in your mods folder.` });
      await refresh();
      void useGameStore.getState().refreshMods();
    } catch (error) {
      setMessage({ text: `Could not save: ${error instanceof Error ? error.message : String(error)}`, bad: true });
    }
  };

  const exportPiece = async () => {
    if (!draft) return;
    if (source.kind === 'builtIn') {
      const { text, warning } = builtInFile(source.type, draft);
      const done = await mods.exportFile('furniture', `${kebab(source.type)}.furniture.json`, text);
      if (done) setMessage({ text: warning ? `Exported for the game. Over the limits for a player’s piece: ${warning}` : 'Exported for the game.' });
    } else if (check?.ok && (await exportFurnitureFile(draft, mods))) setMessage({ text: 'Exported.' });
  };

  const remove = async () => {
    if (source.kind !== 'mod' || !window.confirm(`Remove “${draft?.spec.name ?? source.id}” from your mods folder for good?`)) return;
    await mods.remove('furniture', source.id);
    setDraft(null);
    setMessage({ text: 'Removed.' });
    await refresh();
    void useGameStore.getState().refreshMods();
  };

  const chooseModel = async (file: File | undefined) => {
    if (!file || !draft) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const triangles = checkModel(bytes);
      change((d) => ({ ...d, glb: bytes }));
      setMessage({ text: `Model ${file.name}: ${triangles.toLocaleString('en-GB')} triangles.` });
    } catch (error) {
      setMessage({ text: `${file.name} cannot be used: ${error instanceof Error ? error.message : String(error)}`, bad: true });
    }
  };

  const listed = (key: string, label: string, onClick: () => void, extra?: string) => (
    <li key={key}>
      <button type="button" className={listKey(source, draft) === key ? 'catalog-entry active' : 'catalog-entry'} aria-pressed={listKey(source, draft) === key} onClick={onClick}>
        <strong>{label}</strong>
        {extra && <span className="small">{extra}</span>}
      </button>
    </li>
  );

  return (
    <div className="furniture-editor">
      <header className="fe-head">
        <h2>Furniture editor</h2>
        <p className="muted small">Pieces you make are kept in your mods folder. They can’t be played with yet.</p>
        <button type="button" onClick={() => leave() && onClose()}>Back to the menu</button>
      </header>

      <div className="fe-body">
        <nav className="fe-list" aria-label="Pieces">
          <div className="row">
            <button type="button" className="primary" onClick={() => open(newPiece(taken), { kind: 'new' })}>New piece</button>
            <button type="button" onClick={() => void importFile()}>Import file…</button>
          </div>
          <h3>Your pieces</h3>
          <ul className="catalog-list">
            {found.pieces.map((piece) => listed(`mod:${piece.id}`, piece.spec.name, () => open(structuredClone(piece), { kind: 'mod', id: piece.id }), formatMoney(piece.spec.cost)))}
            {found.problems.map((problem) => (
              <li key={problem.id}>
                <span className="small"><strong>{problem.id}</strong> can’t be used: {problem.reason}</span>
              </li>
            ))}
          </ul>
          {found.pieces.length === 0 && found.problems.length === 0 && <p className="muted small">Nothing yet.</p>}
          <h3>The game’s pieces</h3>
          <p className="muted small">You get a copy to change under a new name. The game’s own piece stays as it is.</p>
          <ul className="catalog-list">
            {BUILT_IN.map((type) => listed(`builtIn:${type}`, FURNITURE[type].name, () => open(copyOfBuiltIn(type, taken), { kind: 'builtIn', type }), FURNITURE[type].retired ? 'No longer sold' : formatMoney(FURNITURE[type].cost)))}
          </ul>
        </nav>

        {draft ? (
          <>
            <section className="fe-picture" aria-label="Preview">
              <div className="catalog-picture">
                <PreviewGuard key={draft.glb ? draft.glb.length : 0}>
                  <Suspense fallback={<span className="muted small">Fetching it from the storeroom…</span>}>
                    {revision > 0 && <FurniturePreview type={PREVIEW_TYPE} tier={tier} still={reduceMotion} spots={draft.asset.spots} selectedSpot={spot} revision={revision} view={view} people={people} />}
                  </Suspense>
                </PreviewGuard>
              </div>
              <div className="segmented" role="group" aria-label="Equipment tier">
                {[1, 2, 3].map((n) => (
                  <button key={n} type="button" className={n === tier ? 'active' : undefined} aria-pressed={n === tier} onClick={() => setTier(n)}>Tier {n}</button>
                ))}
              </div>
              <div className="fe-view" role="group" aria-label="Move the picture">
                <button type="button" onClick={() => look({ turn: view.turn + Math.PI / 4 })} aria-label="Turn left" title="Turn left">⟲</button>
                <button type="button" onClick={() => look({ turn: view.turn - Math.PI / 4 })} aria-label="Turn right" title="Turn right">⟳</button>
                <button type="button" onClick={() => look({ zoom: Math.min(4, view.zoom * 1.25) })} aria-label="Zoom in" title="Zoom in">+</button>
                <button type="button" onClick={() => look({ zoom: Math.max(0.4, view.zoom / 1.25) })} aria-label="Zoom out" title="Zoom out">−</button>
                <button type="button" onClick={() => look({ x: view.x - 0.4 })} aria-label="Move left" title="Move left">←</button>
                <button type="button" onClick={() => look({ x: view.x + 0.4 })} aria-label="Move right" title="Move right">→</button>
                <button type="button" onClick={() => look({ y: view.y + 0.4 })} aria-label="Move up" title="Move up">↑</button>
                <button type="button" onClick={() => look({ y: view.y - 0.4 })} aria-label="Move down" title="Move down">↓</button>
                <button type="button" onClick={() => setView(FRONT)}>Reset</button>
              </div>
              <label className="fe-check small">
                <input type="checkbox" checked={people} onChange={(e) => setPeople(e.target.checked)} />
                Show a person at each place
              </label>
              <p className="muted small">Parts and places set for a tier only show at that tier.</p>
            </section>

            <div className="fe-form">
              {source.kind === 'builtIn' && <p className="small">A copy of the game’s “{FURNITURE[source.type].name}”. Save keeps it as your own piece; “Export for the game” writes it for a developer to put in the game in its place.</p>}
              <section className="fe-section" aria-label="The piece">
                <h3>The piece</h3>
                <Fields>
                  <label className="fe-field">
                    <span className="small">Name</span>
                    <input value={draft.spec.name} maxLength={40} onChange={(e) => setSpec({ name: e.target.value })} />
                  </label>
                  <label className="fe-field">
                    <span className="small">Id (the folder it is kept in)</span>
                    <input value={draft.id} maxLength={64} onChange={(e) => change((d) => ({ ...d, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
                  </label>
                </Fields>
                <label className="fe-field">
                  <span className="small">What it is for</span>
                  <textarea rows={3} value={draft.spec.about} maxLength={500} onChange={(e) => setSpec({ about: e.target.value })} />
                </label>
                <label className="fe-field">
                  <span className="small">Note under the name (optional)</span>
                  <input value={draft.spec.note ?? ''} maxLength={100} onChange={(e) => setSpec({ note: e.target.value === '' ? undefined : e.target.value })} />
                </label>
                <Fields>
                  <Num label="Width (tiles)" value={draft.spec.w} step={1} min={1} max={MODS.maxTiles} onChange={(w) => setSpec({ w: Math.round(w) })} />
                  <Num label="Depth (tiles)" value={draft.spec.h} step={1} min={1} max={MODS.maxTiles} onChange={(h) => setSpec({ h: Math.round(h) })} />
                  <Num label="Price (€)" value={draft.spec.cost} step={50} min={MODS.price.min} max={MODS.price.max} onChange={(cost) => setSpec({ cost: Math.round(cost) })} />
                  <Num
                    label="Comfort (0 for none)"
                    value={draft.spec.comfort === true ? 1 : draft.spec.comfort || 0}
                    step={0.5}
                    min={0}
                    max={3}
                    onChange={(n) => setSpec({ comfort: n <= 0 ? undefined : n === 1 ? true : n })}
                  />
                </Fields>
                <label className="fe-check small">
                  <input type="checkbox" checked={draft.spec.durable === true} onChange={(e) => setSpec({ durable: e.target.checked ? true : undefined })} />
                  Never wears out
                </label>
                <fieldset className="fe-rooms">
                  <legend className="small">Rooms it can stand in</legend>
                  {ROOMS.map((room) => (
                    <label key={room} className="fe-check small">
                      <input
                        type="checkbox"
                        checked={draft.spec.rooms.includes(room)}
                        onChange={(e) => setSpec({ rooms: e.target.checked ? [...draft.spec.rooms, room] : draft.spec.rooms.filter((r) => r !== room) })}
                      />
                      {ROOM_TYPE_NAMES[room]}
                    </label>
                  ))}
                </fieldset>
              </section>

              <PartsForm parts={draft.asset.parts} onChange={(parts) => change((d) => ({ ...d, asset: { ...d.asset, parts } }))} />

              <section className="fe-section" aria-label="Model of its own">
                <h3>A model of your own</h3>
                <p className="muted small">A .glb file with everything inside it, at most {MODS.triangles.toLocaleString('en-GB')} triangles and {MODS.modelBytes / 1_000_000} MB. One per piece; its units are tiles. It stands in the middle of the footprint, in its own colours, under the parts.</p>
                <div className="row">
                  <input type="file" accept=".glb" aria-label="Choose a .glb model" onChange={(e) => { void chooseModel(e.target.files?.[0]); e.target.value = ''; }} />
                  {draft.glb && (
                    <>
                      <span className="small">{(draft.glb.length / 1000).toFixed(0)} kB</span>
                      <button type="button" onClick={() => change((d) => ({ ...d, glb: undefined }))}>Remove the model</button>
                    </>
                  )}
                </div>
              </section>

              <SpotsForm spots={draft.asset.spots ?? []} selected={spot} onSelect={setSpot} w={draft.spec.w} h={draft.spec.h} onChange={(spots) => change((d) => ({ ...d, asset: { ...d.asset, spots: spots.length > 0 ? spots : undefined } }))} />

              <BoostsForm
                boosts={[...(draft.spec.boosts ?? [])]}
                cost={draft.spec.cost}
                onChange={(boosts) => setSpec({ boosts: boosts.length > 0 ? boosts : undefined })}
                onCost={(cost) => setSpec({ cost })}
              />
            </div>
          </>
        ) : (
          <p className="muted fe-empty">Choose a piece on the left, start a new one or import a file.</p>
        )}
      </div>

      {draft && (
        <footer className="fe-foot">
          <p className={check?.ok ? 'small' : 'small fe-error'} role="status">
            {check?.ok ? (message?.text ?? 'This piece is fine.') : check?.reason}
            {check?.ok === false && message && <span className="muted"> · {message.text}</span>}
          </p>
          <div className="row">
            <button type="button" className="primary" disabled={!check?.ok} onClick={() => void save()}>Save</button>
            <button type="button" disabled={source.kind !== 'builtIn' && !check?.ok} onClick={() => void exportPiece()}>{source.kind === 'builtIn' ? 'Export for the game' : 'Export…'}</button>
            {source.kind === 'mod' && <button type="button" onClick={() => void remove()}>Remove</button>}
          </div>
        </footer>
      )}
      {!draft && message && <p className={message.bad ? 'small fe-error' : 'small'} role="status">{message.text}</p>}
    </div>
  );
}

/** Which entry of the list is open. */
function listKey(source: Source, draft: ModFurniture | null): string | undefined {
  if (!draft) return undefined;
  return source.kind === 'builtIn' ? `builtIn:${source.type}` : source.kind === 'mod' ? `mod:${source.id}` : undefined;
}
