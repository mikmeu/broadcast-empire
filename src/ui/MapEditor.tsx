import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MAPS } from '../config/maps';
import type { RegionId } from '../config/world';
import { SHAPE, boxOf, checkDraft, copyOfDefault, drop, edit, forTheGame, itemsOf, newMap, resize, textOf, townKindOf, type Ref, type TownKind } from '../mods/mapDraft';
import type { MapFile, PlacedModel } from '../mods/mapFile';
import { exportMapFile, importMapFile, loadMapMods, saveMapMod, type MapProblem } from '../mods/mapMods';
import { previewSite, showPreviewMap, stopPreviewMap } from '../mods/mapPreview';
import { buildingFor, type Building } from '../config/office';
import { uniqueId } from '../mods/draft';
import { byRoads } from '../office/townLayout';
import { SITES } from '../office/sites';
import type { MapView } from '../office/Office3D';
import type { DesktopBridge } from '../persistence/desktop';
import { Fields, Num, Pick } from './furnitureEditor/fields';
import { PlanView } from './mapEditor/PlanView';
import { SettingsForm } from './mapEditor/SettingsForm';
import { KIND_NAMES, MODEL_OPTIONS, TOOL_GROUPS, isStreet, toolOf, type ToolId } from './mapEditor/tools';
import { useGameStore } from './store';

// The picture is drawn with the game's own town, which comes with the 3D library.
const MapPreview = lazy(() => import('../office/Office3D').then((m) => ({ default: m.MapPreview })));

type Mods = NonNullable<DesktopBridge['mods']>;

/** Where the map in the editor came from. */
type Source = { kind: 'default'; id: string; name: string } | { kind: 'mod'; id: string } | { kind: 'new' } | { kind: 'import' };

const DEFAULTS = Object.values(MAPS);
const START: MapView = { turn: 0, zoom: 1, x: 0, y: 0 };
const systemReducesMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LEAVE = 'Leave without saving? Your changes to this map will be lost.';
const HISTORY = 100;
const FACING = { w: 'west', n: 'north', s: 'south' } as const;

/** The map in the editor with what undo and redo can reach. */
interface Doc {
  file: MapFile | null;
  past: MapFile[];
  future: MapFile[];
}

/** The region whose look a map borrows to begin with: the one it is the town of, else the first that is laid out the same way. */
function lookOf(file: MapFile, mapId = file.id): RegionId {
  const regions = Object.keys(SITES) as RegionId[];
  const own = regions.find((r) => SITES[r].map === mapId);
  if (own) return own;
  const roads = townKindOf(file) === 'roads';
  return regions.find((r) => SITES[r].map !== null && byRoads(MAPS[SITES[r].map!]!.map) === roads) ?? 'capital';
}

/** A map that cannot be drawn must not take the whole screen with it. */
class PreviewGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p className="small fe-error">The town could not be drawn. Change the map and it will try again.</p> : this.props.children;
  }
}

/**
 * The map editor (0.21.0, #284), desktop only and behind a developer setting: open one of the game's maps (as a copy), a map in the
 * mods folder or a file, or start a new map; draw it on the plan with the tools; see it as the game draws it; save it to the mods
 * folder or export it. Nothing here touches a game: the game does not load these maps yet (#290).
 */
export function MapEditor({ mods, onClose }: { mods: Mods; onClose: () => void }) {
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion) || systemReducesMotion();
  const [found, setFound] = useState<{ maps: MapFile[]; problems: MapProblem[] }>({ maps: [], problems: [] });
  const [doc, setDoc] = useState<Doc>({ file: null, past: [], future: [] });
  const draft = doc.file;
  const setDraft = (file: MapFile | null) => setDoc({ file, past: [], future: [] });
  const [source, setSource] = useState<Source>({ kind: 'new' });
  const [started, setStarted] = useState<TownKind>('grid');
  const [clean, setClean] = useState('');
  const [message, setMessage] = useState<{ text: string; bad?: boolean }>();
  const [tool, setTool] = useState<ToolId>('select');
  const [model, setModel] = useState({ file: MODEL_OPTIONS[0]![0], turn: 0 });
  const [selected, setSelected] = useState<Ref | null>(null);
  const [looks, setLooks] = useState<RegionId>('capital');
  const [view, setView] = useState<MapView>(START);
  const [revision, setRevision] = useState(0);
  const [building, setBuilding] = useState<Building>();
  const [problem, setProblem] = useState<string>();
  const look = (changes: Partial<MapView>) => setView({ ...view, ...changes });

  const refresh = useCallback(() => loadMapMods(mods).then(setFound), [mods]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A copy of one of the game's maps is laid out round the building of its region, as the game's own is, only while its wings and reception
  // box are those of the original. Once they change it gets a building worked out from them (#289).
  const house = useMemo(() => {
    const region = source.kind === 'default' ? (Object.keys(SITES) as RegionId[]).find((r) => SITES[r].map === source.id) : undefined;
    const original = source.kind === 'default' ? MAPS[source.id] : undefined;
    const same = original && draft && JSON.stringify([original.map.wings, original.map.reception]) === JSON.stringify([draft.map.wings, draft.map.reception]);
    return region && same ? buildingFor(region) : undefined;
  }, [source, draft]);

  // The draft is put on the game's list of towns under a reserved name so the scene can draw it, and taken off when the editor closes.
  useEffect(() => () => stopPreviewMap(), []);
  // What the town looks like depends on the plan and the settings, not on the name: typing a name does not build the town again.
  const shape = draft ? textOf({ ...draft, name: '' }) : '';
  const shownKey = useRef('');
  useEffect(() => {
    if (!draft || shape === shownKey.current) return;
    shownKey.current = shape;
    const result = showPreviewMap(draft, house);
    if (result.ok) {
      setBuilding(result.building);
      setProblem(undefined);
      setRevision((n) => n + 1);
    } else setProblem(result.reason);
  }, [draft, shape, house]);

  const check = useMemo(() => (draft ? checkDraft(draft, house) : undefined), [draft, house]);
  const dirty = draft !== null && textOf(draft) !== clean;
  const leave = () => !dirty || window.confirm(LEAVE);

  /** Makes a change the player can undo. */
  const commit = useCallback((next: MapFile) => setDoc((d) => (d.file ? { file: next, past: [...d.past.slice(-HISTORY + 1), d.file], future: [] } : d)), []);
  const undo = useCallback(() => {
    setDoc((d) => (d.file && d.past.length > 0 ? { file: d.past[d.past.length - 1]!, past: d.past.slice(0, -1), future: [...d.future, d.file] } : d));
    setSelected(null);
  }, []);
  const redo = useCallback(() => {
    setDoc((d) => (d.file && d.future.length > 0 ? { file: d.future[d.future.length - 1]!, past: [...d.past, d.file], future: d.future.slice(0, -1) } : d));
    setSelected(null);
  }, []);

    // Delete removes what is selected; Ctrl+Z and Ctrl+Y undo and redo; Escape steps back: from a tool to Select, from the map to the list, then to the menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
      if (e.key === 'Escape') {
        if (e.target instanceof HTMLElement && e.target.tagName === 'SELECT') return;
        if (tool !== 'select' || selected) {
          setTool('select');
          setSelected(null);
        } else if (draft) {
          if (!dirty || window.confirm(LEAVE)) {
            setDraft(null);
            setMessage(undefined);
          }
        } else onClose();
        return;
      }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && draft) {
        e.preventDefault();
        commit(drop(draft, selected));
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, dirty, selected, tool, onClose, undo, redo, commit]);

  const taken = [...DEFAULTS.map((m) => m.id), ...found.maps.map((m) => m.id), ...found.problems.map((p) => p.id)];

  const open = (next: MapFile, from: Source, kind: TownKind = townKindOf(next)) => {
    if (!leave()) return;
    shownKey.current = '';
    setDraft(next);
    setSource(from);
    setStarted(kind);
    setClean(from.kind === 'new' || from.kind === 'import' ? '' : textOf(next));
    setMessage(undefined);
    setSelected(null);
    setTool('select');
    setLooks(lookOf(next, from.kind === 'default' ? from.id : next.id));
    setView(START);
  };

  const importFile = async () => {
    if (!leave()) return;
    const file = await importMapFile(mods);
    if (!file) return;
    if (!file.ok) return setMessage({ text: `${file.fileName} cannot be used: ${file.reason}`, bad: true });
    open({ ...file.file, id: uniqueId(file.file.id, taken) }, { kind: 'import' });
    setMessage({ text: `Opened ${file.fileName}. It is not in your folder until you save it.` });
  };

  const save = async () => {
    if (!draft || !check) return;
    if (taken.includes(draft.id) && !(source.kind === 'mod' && source.id === draft.id) && !window.confirm(`There is a map called “${draft.id}” already. Replace it?`)) return;
    if (DEFAULTS.some((m) => m.id === draft.id)) return setMessage({ text: `“${draft.id}” is the id of one of the game’s maps. Choose another id.`, bad: true });
    try {
      await saveMapMod(draft, mods);
      setSource({ kind: 'mod', id: draft.id });
      setClean(textOf(draft));
      setMessage({ text: `Saved “${draft.name}” in your mods folder.` });
      await refresh();
    } catch (error) {
      setMessage({ text: `Could not save: ${error instanceof Error ? error.message : String(error)}`, bad: true });
    }
  };

  const exportMap = async () => {
    if (draft && (await exportMapFile(draft, mods))) setMessage({ text: 'Exported.' });
  };

  /** A copy of the game's own map, back as the file the game keeps (src/config/maps/<id>.json), for a developer to put in place. */
  const exportForGame = async () => {
    if (!draft || source.kind !== 'default') return;
    if (await exportMapFile(forTheGame(draft, source.id, source.name), mods, `${source.id}.json`)) setMessage({ text: 'Exported for the game.' });
  };

  const remove = async () => {
    if (source.kind !== 'mod' || !window.confirm(`Remove “${draft?.name ?? source.id}” from your mods folder for good?`)) return;
    await mods.remove('maps', source.id);
    setDraft(null);
    setMessage({ text: 'Removed.' });
    await refresh();
  };

  const current = (key: string) => (source.kind === 'mod' ? `mod:${source.id}` : source.kind === 'default' ? `default:${source.id}` : undefined) === key && draft !== null;
  const listed = (key: string, label: string, onClick: () => void, extra?: string) => (
    <li key={key}>
      <button type="button" className={current(key) ? 'catalog-entry active' : 'catalog-entry'} aria-pressed={current(key)} onClick={onClick}>
        <strong>{label}</strong>
        {extra && <span className="small">{extra}</span>}
      </button>
    </li>
  );

  const kind = draft ? townKindOf(draft, started) : started;
  const picked = draft && selected ? itemsOf(draft.map, selected.kind)[selected.index] : undefined;
  const site = useMemo(() => (draft ? previewSite(draft, looks) : undefined), [draft, looks]);

  return (
    <div className="furniture-editor map-editor">
      <header className="fe-head">
        <h2>Map editor</h2>
        <p className="muted small">Maps you make are kept in your mods folder. They can’t be played yet.</p>
        <button type="button" onClick={() => leave() && onClose()}>Back to the menu</button>
      </header>

      <div className="fe-body me-body">
        <nav className="fe-list" aria-label="Maps">
          <div className="row">
            <button type="button" className="primary" onClick={() => open(newMap(taken), { kind: 'new' }, 'grid')}>New grid map</button>
            <button type="button" onClick={() => open(newMap(taken), { kind: 'new' }, 'roads')}>New map of roads</button>
            <button type="button" onClick={() => void importFile()}>Import file…</button>
          </div>
          <h3>Your maps</h3>
          <ul className="catalog-list">
            {found.maps.map((map) => listed(`mod:${map.id}`, map.name, () => open(structuredClone(map), { kind: 'mod', id: map.id })))}
            {found.problems.map((problem) => (
              <li key={problem.id}>
                <span className="small"><strong>{problem.id}</strong> can’t be used: {problem.reason}</span>
              </li>
            ))}
          </ul>
          {found.maps.length === 0 && found.problems.length === 0 && <p className="muted small">Nothing yet.</p>}
          <h3>The game’s maps</h3>
          <p className="muted small">You get a copy to change under a new name. The game’s own map stays as it is.</p>
          <ul className="catalog-list">
            {DEFAULTS.map((map) => listed(`default:${map.id}`, map.name, () => open(copyOfDefault(map, taken), { kind: 'default', id: map.id, name: map.name }), byRoads(map.map) ? 'Laid out by its roads' : 'Laid out as a grid'))}
          </ul>
        </nav>

        {draft && site ? (
          <>
            <section className="me-middle" aria-label="Plan">
              <div className="me-tools" role="toolbar" aria-label="Tools">
                <button type="button" className={tool === 'select' ? 'active' : undefined} aria-pressed={tool === 'select'} onClick={() => setTool('select')}>Select</button>
                {TOOL_GROUPS.map((group) => (
                  <div key={group.title} className="me-group" role="group" aria-label={group.title}>
                    <span className="small muted">{group.title}</span>
                    {group.tools.map((t) => (
                      <button key={t.id} type="button" className={tool === t.id ? 'active' : undefined} aria-pressed={tool === t.id} onClick={() => { setTool(t.id); setSelected(null); }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <p className="small me-hint">
                {toolOf(tool).hint}
                {toolOf(tool).note && <span className="muted"> {isStreet(tool) && kindMatches(tool, kind) ? '' : toolOf(tool).note}</span>}
              </p>
              {tool === 'model' && (
                <Fields>
                  <Pick label="Model" value={model.file} options={MODEL_OPTIONS} onChange={(file) => setModel({ ...model, file })} />
                  <Pick label="Front faces" value={String(model.turn) as '0'} options={TURNS} onChange={(turn) => setModel({ ...model, turn: Number(turn) })} />
                </Fields>
              )}
              <PlanView file={draft} building={building} tool={tool} model={model} selected={selected} onSelect={setSelected} onChange={commit} />
              <p className="small" role="status">
                {kind === 'roads' ? 'Laid out by its roads' : 'Laid out as a grid'}
                <span className="muted"> · {draft.map.lanes.length === 0 ? 'decided by the first street you draw' : kind === 'roads' ? 'each road has its own ends; a grid has every street across the whole map' : 'every street is a pair of lanes across the whole map'}</span>
              </p>
              {building?.id === 'map' && <p className="small" role="status">Entrance faces {FACING[building.core.faces]}<span className="muted"> · the blue outline is the core, the blue lines are the corridors; move the reception box to change the side</span></p>}
              {draft && picked && selected && <Details file={draft} selected={selected} item={picked} onChange={commit} onDelete={() => { commit(drop(draft, selected)); setSelected(null); }} />}
            </section>

            <section className="me-side" aria-label="Preview and settings">
              <div className="catalog-picture me-picture">
                <PreviewGuard>
                  <Suspense fallback={<span className="muted small">Fetching it from the storeroom…</span>}>
                    {revision > 0 && building && <MapPreview site={site} building={building} revision={revision} view={view} still={reduceMotion} />}
                  </Suspense>
                </PreviewGuard>
              </div>
              {problem && <p className="small fe-error">{problem}{building ? ' Showing the last town that could be drawn.' : ''}</p>}
              <div className="fe-view" role="group" aria-label="Move the picture">
                <button type="button" onClick={() => look({ turn: view.turn - 1 })} aria-label="Turn left" title="Turn left">⟲</button>
                <button type="button" onClick={() => look({ turn: view.turn + 1 })} aria-label="Turn right" title="Turn right">⟳</button>
                <button type="button" onClick={() => look({ zoom: Math.min(8, view.zoom * 1.25) })} aria-label="Zoom in" title="Zoom in">+</button>
                <button type="button" onClick={() => look({ zoom: Math.max(0.1, view.zoom / 1.25) })} aria-label="Zoom out" title="Zoom out">−</button>
                <button type="button" onClick={() => look({ x: view.x - 8 / view.zoom })} aria-label="Move left" title="Move left">←</button>
                <button type="button" onClick={() => look({ x: view.x + 8 / view.zoom })} aria-label="Move right" title="Move right">→</button>
                <button type="button" onClick={() => look({ y: view.y + 8 / view.zoom })} aria-label="Move up" title="Move up">↑</button>
                <button type="button" onClick={() => look({ y: view.y - 8 / view.zoom })} aria-label="Move down" title="Move down">↓</button>
                <button type="button" onClick={() => setView(START)}>Reset</button>
              </div>
              {source.kind === 'default' && <p className="small">A copy of the game’s “{source.name}”. Save keeps it as your own map; “Export for the game” writes it as the game’s file for a developer to put in place.</p>}
              <SettingsForm file={draft} looksLike={looks} onLooks={setLooks} onChange={commit} />
            </section>
          </>
        ) : (
          <p className="muted fe-empty">Choose a map on the left, start a new one or import a file.</p>
        )}
      </div>

      {draft && (
        <footer className="fe-foot">
          <p className={check?.ok ? 'small' : 'small fe-error'} role="status">
            {check?.ok ? (message?.text ?? 'The game can run on this town.') : check?.reason}
            {check?.ok === false && message && <span className="muted"> · {message.text}</span>}
            {check?.ok === false && !message && <span className="muted"> · You can still save it and finish it later.</span>}
          </p>
          <div className="row">
            <button type="button" disabled={doc.past.length === 0} onClick={undo} title="Ctrl+Z">Undo</button>
            <button type="button" disabled={doc.future.length === 0} onClick={redo} title="Ctrl+Y">Redo</button>
            <button type="button" className="primary" onClick={() => void save()}>Save</button>
            <button type="button" onClick={() => void exportMap()}>Export…</button>
            {source.kind === 'default' && <button type="button" disabled={!check?.ok} onClick={() => void exportForGame()}>Export for the game</button>}
            {source.kind === 'mod' && <button type="button" onClick={() => void remove()}>Remove</button>}
          </div>
        </footer>
      )}
      {!draft && message && <p className={message.bad ? 'small fe-error' : 'small'} role="status">{message.text}</p>}
    </div>
  );
}

const TURNS = [['0', 'South'], ['1', 'East'], ['2', 'North'], ['3', 'West']] as const;

/** Whether a street tool belongs to the kind of town the map is. */
const kindMatches = (tool: ToolId, kind: TownKind) => (kind === 'grid') === (tool === 'two-way' || tool === 'one-way' || tool === 'dual');

/** The numbers of the thing that is selected, and what can be changed about it. */
function Details({ file, selected, item, onChange, onDelete }: { file: MapFile; selected: Ref; item: ReturnType<typeof itemsOf>[number]; onChange: (next: MapFile) => void; onDelete: () => void }) {
  const box = boxOf(item);
  const lane = selected.kind === 'lane' ? file.map.lanes[selected.index] : undefined;
  const placed = selected.kind === 'model' ? (item as PlacedModel) : undefined;
  return (
    <fieldset className="fe-part active me-details">
      <legend className="small">{KIND_NAMES[selected.kind]}</legend>
      <Fields>
        {box ? (
          <>
            <Num label="West (x)" value={box.x} step={1} onChange={(x) => onChange(resize(file, selected, { ...box, x: Math.round(x) }))} />
            <Num label="North (y)" value={box.y} step={1} onChange={(y) => onChange(resize(file, selected, { ...box, y: Math.round(y) }))} />
            <Num label="Width" value={box.w} step={1} min={1} onChange={(w) => onChange(resize(file, selected, { ...box, w: Math.round(w) }))} />
            <Num label="Depth" value={box.h} step={1} min={1} onChange={(h) => onChange(resize(file, selected, { ...box, h: Math.round(h) }))} />
          </>
        ) : (
          <>
            <Num label="West (x)" value={(item as { x: number }).x} step={1} onChange={(x) => onChange(edit(file, selected, { x: Math.round(x) }))} />
            <Num label="North (y)" value={(item as { y: number }).y} step={1} onChange={(y) => onChange(edit(file, selected, { y: Math.round(y) }))} />
          </>
        )}
        {lane && (
          <Pick
            label="This lane goes"
            value={lane.dir}
            options={[['both', 'Both ways'], ['north', 'North'], ['south', 'South'], ['east', 'East'], ['west', 'West']]}
            onChange={(dir) => onChange(edit(file, selected, { dir }))}
          />
        )}
        {placed && (
          <>
            <Pick label="Model" value={placed.model} options={MODEL_OPTIONS} onChange={(m) => onChange(edit(file, selected, { model: m }))} />
            <Pick label="Front faces" value={String(placed.turn) as '0'} options={TURNS} onChange={(turn) => onChange(edit(file, selected, { turn: Number(turn) }))} />
          </>
        )}
      </Fields>
      <div className="row">
        <button type="button" onClick={onDelete}>{lane ? 'Remove the street' : 'Remove'}</button>
        <span className="muted small">{SHAPE[selected.kind].one ? 'A map has one of these. ' : ''}{lane ? 'The lanes of a street move and go together.' : ''}</span>
      </div>
    </fieldset>
  );
}
