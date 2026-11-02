// The 3D map editor's town (0.21.0, #328): the town as the game draws it is the main view, with tools on it (select, house, tree, lamp, hill, fill, ground),
// a model on the pointer, the settings beside it and the check of the map below. The roads, the rail, the building, the stops and the lot are made in
// the plan until #329; a map of the game's or a file of the new format is opened here, and its roads cannot be changed yet.
//
// A change of the decor (what the editor makes) replaces the decor on the layout that is shown and leaves its roads and traffic alone; only a change of the
// structure (`structureKey`: the settings, roads, rail, building, stops, lot, the blocks with a kerb) builds the town again.

import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { buildingFor, type Building } from '../../config/office';
import { MAPS } from '../../config/maps';
import type { RegionId } from '../../config/world';
import type { MapView } from '../../office/Office3D';
import { SITES } from '../../office/sites';
import { checkStructure, standsOnTrack, type TownCheck } from '../../office/townCheck';
import { TREES } from '../../office/city';
import { previewSite, showPreviewMap, stopPreviewMap, updatePreviewDecor } from '../../mods/mapPreview';
import type { MapFile } from '../../mods/mapFile';
import {
  BRUSHES, HILL_MODELS, KIND_NAMES, PAINT_KINDS, defaultHillScale, dropItem, editItem, fillBox, hiddenThings, moveItem, paintGround, paintProblem, placeHill, placeHouse, placeLamp,
  placeProblem, placeTree, structureKey, thingAt, type Brush, type Kind, type PaintKind, type Ref,
} from '../../mods/townDraft';
import { Fields, Num, Pick } from '../furnitureEditor/fields';
import { SettingsForm } from './SettingsForm';
import { MODEL_OPTIONS, PAINT_NAMES, TOWN_TOOLS, townToolOf, type TownToolId } from './tools';

// The picture is drawn with the game's own town, which comes with the 3D library.
const MapPreview = lazy(() => import('../../office/Office3D').then((m) => ({ default: m.MapPreview })));

const START: MapView = { turn: 0, zoom: 1, x: 0, y: 0 };
const TURNS = [['0', 'South'], ['1', 'East'], ['2', 'North'], ['3', 'West']] as const;
const TREE_OPTIONS = TREES.map((t) => [t.file, t.file.includes('large') ? 'Large tree' : 'Small tree'] as const);
/** `nature/cliff_blockSlope_stone.glb` is “cliff blockSlope stone”. */
const hillName = (file: string) => file.replace(/^.*\//, '').replace(/\.glb$/, '').replace(/_/g, ' ');
const HILL_OPTIONS = HILL_MODELS.map((file) => [file, hillName(file)] as const);

/** A model could not be put, or a note on the status line. */
interface Flash {
  text: string;
  bad?: boolean;
}

/** The region whose look a map borrows to begin with: the one it is the town of, else the first that is laid out the same way. */
export function lookOf(file: MapFile, mapId = file.id): RegionId {
  const regions = Object.keys(SITES) as RegionId[];
  return regions.find((r) => SITES[r].map === mapId) ?? regions.find((r) => SITES[r].map !== null && MAPS[SITES[r].map!]?.settings.layout === file.settings.layout) ?? 'capital';
}

export interface TownEditorProps {
  file: MapFile;
  /** The game's map this one is a copy of, if it is: its building stands while the wings and reception are those of the original. */
  original?: MapFile;
  looks: RegionId;
  onLooks: (region: RegionId) => void;
  reduceMotion: boolean;
  /** Makes a change that can be undone. */
  commit: (next: MapFile) => void;
  /** Counts up when the file was changed from outside (open, undo, redo): what is selected is let go. */
  epoch: number;
  /** Set while a tool or a selection is on, so that Escape steps back from that before it leaves the map. */
  busy: MutableRefObject<boolean>;
  /** A line from the screen that holds the map (saved, exported). */
  message?: Flash;
  /** The screen round the picture: the middle and the side go in the grid with the list, and the foot is the check and the buttons. */
  frame: (parts: { middle: ReactNode; side: ReactNode; foot: ReactNode }) => ReactNode;
  /** The buttons of the foot, given the check of the map. */
  buttons: (check: TownCheck) => ReactNode;
}

export function TownEditor({ file, original, looks, onLooks, reduceMotion, commit, epoch, busy, message, frame, buttons }: TownEditorProps) {
  const [tool, setTool] = useState<TownToolId>('select');
  const [model, setModel] = useState({ house: MODEL_OPTIONS[0]![0], tree: TREE_OPTIONS[0]![0], hill: HILL_OPTIONS[0]![0], turn: 0, hillScale: defaultHillScale() });
  const [paint, setPaint] = useState<PaintKind>('grass');
  const [brush, setBrush] = useState<Brush>('city');
  const [selected, setSelected] = useState<Ref | null>(null);
  const [view, setView] = useState<MapView>(START);
  const [showHidden, setShowHidden] = useState(true);
  const [flash, setFlash] = useState<Flash>();
  const [note, setNote] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [decor, setDecor] = useState(0);
  const [building, setBuilding] = useState<Building>();
  const [problem, setProblem] = useState<string>();

  // The structure of the file: while this text stays the same, the layout, its roads and its traffic stay too.
  const key = useMemo(() => structureKey(file), [file]);

  // A copy of one of the game's maps is laid out round the building of its region, as the game's own is, only while its wings and reception box are those of the original.
  const house = useMemo(() => {
    const region = original ? (Object.keys(SITES) as RegionId[]).find((r) => SITES[r].map === original.id) : undefined;
    const same = original && JSON.stringify([original.map.building.wings, original.map.building.reception]) === JSON.stringify([file.map.building.wings, file.map.building.reception]);
    return region && same ? buildingFor(region) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original, key]);

  // The draft is put on the game's list of towns under a reserved name so the scene can draw it, and taken off when the editor closes.
  useEffect(() => () => stopPreviewMap(), []);
  const shown = useRef({ key: '', house: undefined as Building | undefined });
  useEffect(() => {
    if (shown.current.key === key && shown.current.house === house) return;
    shown.current = { key, house };
    const result = showPreviewMap(file, house);
    if (result.ok) {
      setBuilding(result.building);
      setProblem(undefined);
      setRevision((n) => n + 1);
    } else setProblem(result.reason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, house]);

  // The decor alone: the houses, trees, lamps, hills, peaks and flat ground are replaced on the layout that is shown.
  const { ground, houses, trees, lamps, hills, peaks } = file.map;
  useEffect(() => {
    if (updatePreviewDecor(file)) setDecor((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ground, houses, trees, lamps, hills, peaks]);

  // What the look is made of depends on the settings alone (and on the region it borrows from).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const site = useMemo(() => previewSite(file, looks), [key, looks]);

  // The check: the structure when that changes, and on every edit of the decor only whether something stands on the track.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const structure = useMemo(() => checkStructure(file, house), [key, house]);
  const onTrack = useMemo(() => (structure.ok ? standsOnTrack(file, house) : null), [structure, house, houses, trees, file]);
  const check: TownCheck = !structure.ok ? structure : onTrack ? { ok: false, reason: onTrack } : structure;

  // A change from outside lets go of what was selected.
  useEffect(() => setSelected(null), [epoch]);
  useEffect(() => {
    busy.current = tool !== 'select' || selected !== null;
  }, [busy, tool, selected]);

  const said = (text: string, bad = false) => setFlash({ text, bad });
  const doCommit = useCallback(
    (next: MapFile) => {
      setFlash(undefined);
      commit(next);
    },
    [commit],
  );

  const place = (kind: Kind, at: { x: number; z: number }) => {
    const item = kind === 'house' ? { ...at, model: model.house, turn: model.turn } : kind === 'tree' ? { ...at, model: model.tree } : kind === 'hill' ? { ...at, model: model.hill, turn: model.turn, scale: model.hillScale } : at;
    const reason = placeProblem(file, kind, item);
    if (reason) return said(reason, true);
    if (kind === 'house') doCommit(placeHouse(file, item as never));
    else if (kind === 'tree') doCommit(placeTree(file, item as never));
    else if (kind === 'lamp') doCommit(placeLamp(file, at));
    else if (kind === 'hill') doCommit(placeHill(file, item as never));
  };

  const picked = selected ? thingAt(file, selected) : undefined;
  const turnSelected = () => {
    if (!selected || (selected.kind !== 'house' && selected.kind !== 'hill') || !picked) return;
    doCommit(editItem(file, selected, { turn: ((picked as unknown as { turn: number }).turn + 1) % 4 }));
  };

  // R turns the model on the pointer (or what is selected), Delete removes what is selected, Escape steps back from a tool or a selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
      if (e.key === 'Escape') {
        if (e.target instanceof HTMLElement && e.target.tagName === 'SELECT') return;
        setTool('select');
        setSelected(null);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey) return;
      if (e.key.toLowerCase() === 'r') {
        if (tool === 'select') turnSelected();
        else setModel((m) => ({ ...m, turn: (m.turn + 1) % 4 }));
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        doCommit(dropItem(file, selected));
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selected, file, doCommit]);

  const hidden = useMemo(() => (building ? hiddenThings(file, view.turn, building) : []), [file, view.turn, building]);
  const selectedHidden = selected !== null && hidden.some((h) => h.kind === selected.kind && h.index === selected.index);
  const look = (changes: Partial<MapView>) => setView({ ...view, ...changes });
  const choose = (id: TownToolId) => {
    setTool(id);
    setSelected(null);
    setFlash(undefined);
  };

  const middle = (
    <section className="me-middle" aria-label="Town">
      <div className="me-tools" role="toolbar" aria-label="Tools">
        {TOWN_TOOLS.map((t) => (
          <button key={t.id} type="button" className={tool === t.id ? 'active' : undefined} aria-pressed={tool === t.id} onClick={() => choose(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="small me-hint">{townToolOf(tool).hint}</p>
      {(tool === 'house' || tool === 'tree' || tool === 'hill') && (
        <Fields>
          {tool === 'house' && <Pick label="Model" value={model.house} options={MODEL_OPTIONS} onChange={(house) => setModel({ ...model, house })} />}
          {tool === 'tree' && <Pick label="Model" value={model.tree} options={TREE_OPTIONS} onChange={(tree) => setModel({ ...model, tree })} />}
          {tool === 'hill' && <Pick label="Model" value={model.hill} options={HILL_OPTIONS} onChange={(hill) => setModel({ ...model, hill })} />}
          {tool === 'hill' && <Num label="Size (times its own)" value={model.hillScale} step={0.5} min={0.1} max={20} onChange={(hillScale) => setModel({ ...model, hillScale })} />}
          {tool !== 'tree' && (
            <>
              <Pick label="Front faces" value={String(model.turn) as '0'} options={TURNS} onChange={(turn) => setModel({ ...model, turn: Number(turn) })} />
              <button type="button" onClick={() => setModel({ ...model, turn: (model.turn + 1) % 4 })} title="R">Turn</button>
            </>
          )}
        </Fields>
      )}
      {tool === 'ground' && (
        <div className="row" role="group" aria-label="Ground">
          {PAINT_KINDS.map((kind) => (
            <button key={kind} type="button" className={paint === kind ? 'active' : undefined} aria-pressed={paint === kind} onClick={() => setPaint(kind)}>{PAINT_NAMES[kind]}</button>
          ))}
        </div>
      )}
      {tool === 'fill' && (
        <div className="row" role="group" aria-label="Brush">
          {BRUSHES.map((b) => (
            <button key={b.id} type="button" className={brush === b.id ? 'active' : undefined} aria-pressed={brush === b.id} onClick={() => setBrush(b.id)}>{b.label}</button>
          ))}
        </div>
      )}
      <div className="catalog-picture me-picture me-town">
        <PreviewGuard key={revision}>
          <Suspense fallback={<span className="muted small">Fetching it from the storeroom…</span>}>
            {revision > 0 && building && (
              <MapPreview
                site={site}
                building={building}
                revision={revision}
                decor={decor}
                view={view}
                still={reduceMotion}
                showHidden={showHidden}
                onView={setView}
                edit={{
                  file,
                  tool,
                  model,
                  paint,
                  brush,
                  selected,
                  onSelect: setSelected,
                  onPlace: place,
                  onMove: (ref, to) => doCommit(moveItem(file, ref, to)),
                  onPaint: (box) => {
                    const reason = paintProblem(file, paint, box);
                    if (reason) said(reason, true);
                    else doCommit(paintGround(file, paint, box));
                  },
                  onFill: (box, seed) => {
                    const done = fillBox(file, box, brush, seed);
                    if (done.placed === 0) return said('Nothing fits there: every spot is on a road, the rail, the office, the lot or water.', true);
                    doCommit(done.file);
                    said(`Put down ${done.placed}${done.skipped > 0 ? `, skipped ${done.skipped}` : ''}.`);
                  },
                  onNote: setNote,
                }}
              />
            )}
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
        <label className="small"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show what is left out from this side</label>
      </div>
      <p className="small" role="status">
        {note ?? flash?.text ?? `${file.map.houses.length} houses, ${file.map.trees.length} trees, ${file.map.lamps.length} lamps, ${file.map.hills.length} hills.`}
        {hidden.length > 0 && <span className="muted"> · {hidden.length} left out from this side in the game{showHidden ? ' (ringed in amber)' : ''}</span>}
      </p>
      {selected && picked && <Details file={file} selected={selected} hidden={selectedHidden} onChange={doCommit} onDelete={() => { doCommit(dropItem(file, selected)); setSelected(null); }} />}
    </section>
  );

  const side = (
    <section className="me-side" aria-label="Settings">
      {original && <p className="small">A copy of the game’s “{original.name}”. Save keeps it as your own map; “Export for the game” writes it as the game’s file for a developer to put in place.</p>}
      <p className="small muted">Its roads, rail, building, stops and lot cannot be changed in 3D yet. Hills can be placed like houses; peaks can be moved and removed.</p>
      <SettingsForm file={file} looksLike={looks} onLooks={onLooks} onChange={doCommit} />
    </section>
  );

  const foot = (
    <footer className="fe-foot">
      <p className={check.ok && !flash?.bad ? 'small' : 'small fe-error'} role="status">
        {!check.ok ? check.reason : flash?.bad ? flash.text : (message?.text ?? 'The game can run on this town.')}
        {!check.ok && message && <span className="muted"> · {message.text}</span>}
        {!check.ok && !message && <span className="muted"> · You can still save it and finish it later.</span>}
      </p>
      <div className="row">{buttons(check)}</div>
    </footer>
  );

  return <>{frame({ middle, side, foot })}</>;
}

/** The numbers of the thing that is selected, and what can be changed about it. */
function Details({ file, selected, hidden, onChange, onDelete }: { file: MapFile; selected: Ref; hidden: boolean; onChange: (next: MapFile) => void; onDelete: () => void }) {
  const item = thingAt(file, selected) as { x: number; z: number; model?: string; turn?: number; scale?: number } | undefined;
  if (!item) return null;
  const edit = (changes: Parameters<typeof editItem>[2]) => onChange(editItem(file, selected, changes));
  const options = selected.kind === 'house' ? MODEL_OPTIONS : selected.kind === 'tree' ? TREE_OPTIONS : HILL_OPTIONS;
  return (
    <fieldset className="fe-part active me-details">
      <legend className="small">{KIND_NAMES[selected.kind]}</legend>
      <Fields>
        <Num label="East (x)" value={item.x} step={0.5} onChange={(x) => edit({ x })} />
        <Num label="South (z)" value={item.z} step={0.5} onChange={(z) => edit({ z })} />
        {item.model !== undefined && <Pick label="Model" value={item.model} options={options} onChange={(model) => edit({ model })} />}
        {item.turn !== undefined && <Pick label="Front faces" value={String(item.turn) as '0'} options={TURNS} onChange={(turn) => edit({ turn: Number(turn) })} />}
        {item.scale !== undefined && <Num label="Size (times its own)" value={item.scale} step={0.5} min={0.1} max={20} onChange={(scale) => edit({ scale })} />}
      </Fields>
      <div className="row">
        <button type="button" onClick={onDelete}>Remove</button>
        {hidden && <span className="small">Left out from this side in the game.</span>}
      </div>
    </fieldset>
  );
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
