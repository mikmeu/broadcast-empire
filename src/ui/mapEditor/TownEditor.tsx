// The 3D map editor's town (0.21.0, #328, #329): the town as the game draws it is the main view, with tools on it (decor: house, tree, lamp, hill, fill, ground;
// structure: road, block, edge, railway, wing, reception, bus stop, taxi stand, lot, parking strip, green, fountain), a model or an outline on the pointer,
// the settings beside it and the check of the map below. The check runs on what a drag would make before it is let go.
//
// A change of the decor replaces the decor on the layout that is shown and leaves its roads and traffic alone; a change of the structure
// (`structureKey`: the settings, roads, rail, building, stops, lot, the blocks with a kerb) builds the town again. The side the entrance faces is
// worked out again after a change of the structure, unless the town is laid out round a building of the game (`houseFor`).

import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import type { Building } from '../../config/office';
import { MAPS } from '../../config/maps';
import type { RegionId } from '../../config/world';
import type { MapView } from '../../office/Office3D';
import { SITES } from '../../office/sites';
import { OVERLAY_LAYERS, routeOverlay, type LayerId } from '../../office/routeOverlay';
import { PREVIEW_MAP, layoutOfMap } from '../../office/townLayout';
import { checkStructure, standsOnTrack, type TownCheck } from '../../office/townCheck';
import { TREES } from '../../office/city';
import { previewSite, showPreviewMap, stopPreviewMap, updatePreviewDecor } from '../../mods/mapPreview';
import type { GroundKind, MapBox, MapFile } from '../../mods/mapFile';
import {
  BRUSHES, HILL_MODELS, KIND_NAMES, PAINT_KINDS, defaultHillScale, dropItem, editItem, fillBox, hiddenThings, moveItem, paintGround, paintProblem, placeHill, placeHouse, placeLamp,
  placeProblem, placeTree, structureKey, thingAt, type Brush, type Kind, type PaintKind, type Ref,
} from '../../mods/townDraft';
import {
  BLOCK_KINDS, DEFAULT_ROAD, KEPT_PARTS, PART_NAMES, countDecor, dropPart, editBlock, editRoad, houseFor, moveRoad, moveVia, partBox, resizePart, setFountain, setOwn, setStop, withFaces, type Flow, type PartRef, type RoadSettings,
} from '../../mods/townStructure';
import { Fields, Num, Pick } from '../furnitureEditor/fields';
import { SettingsForm } from './SettingsForm';
import { MODEL_OPTIONS, PAINT_NAMES, TOWN_SELECT, TOWN_TOOL_GROUPS, townToolOf, type TownToolId } from './tools';

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
  const [selectedPart, setSelectedPart] = useState<PartRef | null>(null);
  const [road, setRoad] = useState<RoadSettings>(DEFAULT_ROAD);
  const [block, setBlock] = useState<GroundKind>('pavement');
  // The layers of the route overlay (#330): all on to begin with, for as long as the editor is open.
  const [layers, setLayers] = useState<Record<LayerId, boolean>>(() => Object.fromEntries(OVERLAY_LAYERS.map((l) => [l.id, true])) as Record<LayerId, boolean>);

  // The structure of the file: while this text stays the same, the layout, its roads and its traffic stay too.
  const key = useMemo(() => structureKey(file), [file]);

  // A copy of one of the game's maps is laid out round the building of its region, as the game's own is, only while its wings and reception box are those of the original.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const house = useMemo(() => houseFor(file, original), [original, key]);

  // The draft is put on the game's list of towns under a reserved name so the scene can draw it, and taken off when the editor closes.
  const shown = useRef({ key: '', house: undefined as Building | undefined });
  useEffect(
    () => () => {
      stopPreviewMap();
      // (Effects run twice in development: what was shown is shown again.)
      shown.current = { key: '', house: undefined };
    },
    [],
  );
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
  const check: TownCheck = !structure.ok ? structure : onTrack ? { ok: false, reason: onTrack.reason, ...(onTrack.at && { at: onTrack.at }) } : structure;

  // What the game generates from the roads, worked out again only when the town is built again (the layout is the one shown).
  const overlay = useMemo(() => {
    if (revision === 0 || !building) return null;
    try {
      return routeOverlay(layoutOfMap(PREVIEW_MAP), building, file.settings.shore);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  // A change from outside lets go of what was selected.
  useEffect(() => {
    setSelected(null);
    setSelectedPart(null);
  }, [epoch]);
  useEffect(() => {
    busy.current = tool !== 'select' || selected !== null || selectedPart !== null;
  }, [busy, tool, selected, selectedPart]);

  const said = (text: string, bad = false) => setFlash({ text, bad });
  const doCommit = useCallback(
    (next: MapFile) => {
      setFlash(undefined);
      commit(next);
    },
    [commit],
  );

  // A change of the structure: the side the entrance faces is worked out again (unless a building of the game is used), and the status line says what it took away.
  const settle = useCallback((next: MapFile) => (houseFor(next, original) ? next : withFaces(next)), [original]);
  const commitStructure = useCallback(
    (next: MapFile) => {
      const settled = settle(next);
      const taken = countDecor(file) - countDecor(settled);
      commit(settled);
      setFlash(taken > 0 ? { text: `Took away ${taken} house${taken === 1 ? '' : 's'}, trees, lamps or hills that stood in the way. Undo brings them back.` } : undefined);
    },
    [commit, file, settle],
  );
  /** Why the map would not pass the check if it were this, for the drag: the check of the structure, run on the candidate. */
  const candidateProblem = useCallback(
    (next: MapFile) => {
      const settled = settle(next);
      const checked = checkStructure(settled, houseFor(settled, original));
      return checked.ok ? null : checked.reason;
    },
    [settle, original],
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
        setSelectedPart(null);
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
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPart) {
        e.preventDefault();
        removePart(selectedPart);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selected, selectedPart, file, doCommit]);

  const hidden = useMemo(() => (building ? hiddenThings(file, view.turn, building) : []), [file, view.turn, building]);
  const selectedHidden = selected !== null && hidden.some((h) => h.kind === selected.kind && h.index === selected.index);
  const look = (changes: Partial<MapView>) => setView({ ...view, ...changes });
  const choose = (id: TownToolId) => {
    setTool(id);
    setSelected(null);
    // (The block and edge tools pick what they click: what is selected stays for them.)
    if (id !== 'block' && id !== 'edge') setSelectedPart(null);
    setFlash(undefined);
  };
  const removePart = (ref: PartRef) => {
    const next = dropPart(file, ref);
    if (next === file) return said(`${PART_NAMES[ref.part]} can only be moved: a map has to have one${ref.part === 'wing' ? ' wing at least' : ''}.`, true);
    commitStructure(next);
    setSelectedPart(null);
  };
  const grid = file.settings.layout === 'grid';
  const groups = TOWN_TOOL_GROUPS.map((g) => ({ ...g, tools: g.tools.filter((t) => t.id !== 'edge' || !grid) }));

  const middle = (
    <section className="me-middle" aria-label="Town">
      <div className="me-tools" role="toolbar" aria-label="Tools">
        <button type="button" className={tool === 'select' ? 'active' : undefined} aria-pressed={tool === 'select'} onClick={() => choose('select')}>{TOWN_SELECT.label}</button>
        {groups.map((group) => (
          <div key={group.title} className="me-group" role="group" aria-label={group.title}>
            <span className="small muted">{group.title}</span>
            {group.tools.map((t) => (
              <button key={t.id} type="button" className={tool === t.id ? 'active' : undefined} aria-pressed={tool === t.id} onClick={() => choose(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        ))}
      </div>
      <p className="small me-hint">{townToolOf(tool).hint}</p>
      {tool === 'road' && <RoadOptions grid={grid} road={road} onChange={setRoad} />}
      {tool === 'block' && (
        <div className="row" role="group" aria-label="Block">
          {BLOCK_KINDS.map((kind) => (
            <button key={kind} type="button" className={block === kind ? 'active' : undefined} aria-pressed={block === kind} onClick={() => setBlock(kind)}>{PAINT_NAMES[kind as PaintKind] ?? 'Pavement'}</button>
          ))}
        </div>
      )}
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
                  options: { road, block },
                  selectedPart,
                  onSelectPart: setSelectedPart,
                  onEdit: commitStructure,
                  onRefuse: (reason) => said(reason, true),
                  candidateProblem,
                  overlay,
                  layers,
                  marker: !check.ok && check.at ? check.at : null,
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
      <div className="me-layers small" role="group" aria-label="Show on the map">
        {OVERLAY_LAYERS.map((l) => (
          <label key={l.id}>
            <input type="checkbox" checked={layers[l.id]} onChange={(e) => setLayers({ ...layers, [l.id]: e.target.checked })} />
            <span className="me-swatch" style={{ background: l.colour }} aria-hidden="true" /> {l.label}
          </label>
        ))}
      </div>
      <p className="small" role="status">
        {note ?? flash?.text}
        <span className="muted">{note ?? flash?.text ? ' · ' : ''}{file.map.houses.length} houses, {file.map.trees.length} trees, {file.map.lamps.length} lamps, {file.map.hills.length} hills, {file.map.roads.length} roads</span>
        {hidden.length > 0 && <span className="muted"> · {hidden.length} left out from this side in the game{showHidden ? ' (ringed in amber)' : ''}</span>}
      </p>
      {selected && picked && <Details file={file} selected={selected} hidden={selectedHidden} onChange={doCommit} onDelete={() => { doCommit(dropItem(file, selected)); setSelected(null); }} />}
      {selectedPart && partBox(file, selectedPart) && <PartDetails file={file} selected={selectedPart} onChange={commitStructure} onDelete={() => removePart(selectedPart)} />}
    </section>
  );

  const side = (
    <section className="me-side" aria-label="Settings">
      {original && <p className="small">A copy of the game’s “{original.name}”. Save keeps it as your own map; “Export for the game” writes it as the game’s file for a developer to put in place.</p>}
      <p className="small muted">Hills can be placed like houses; peaks can be moved and removed. Roads, the railway, the wings, the stops, the lot and the blocks are made with the tools of the structure.</p>
      <SettingsForm file={file} looksLike={looks} onLooks={onLooks} onChange={doCommit} />
    </section>
  );

  const foot = (
    <footer className="fe-foot">
      <p className={check.ok && !flash?.bad ? 'small' : 'small fe-error'} role="status">
        {!check.ok ? check.reason : flash?.bad ? flash.text : (message?.text ?? 'The game can run on this town.')}
        {!check.ok && check.at && <span className="muted"> · Marked on the map.</span>}
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

const FLOWS = [['two-way', 'Two-way'], ['one-way', 'One-way']] as const;
const GROUND_NAMES: Record<GroundKind, string> = { pavement: 'Pavement', concrete: 'Concrete', asphalt: 'Asphalt', grass: 'Grass', field: 'Field', sand: 'Sand', water: 'Water' };

/** What a road is drawn with: two-way, one-way or (in a grid) dual, whether it carries traffic, and its arrows. */
function RoadOptions({ grid, road, onChange }: { grid: boolean; road: RoadSettings; onChange: (road: RoadSettings) => void }) {
  const flows: readonly (readonly [Flow, string])[] = grid ? [...FLOWS, ['dual', 'Dual']] : FLOWS;
  return (
    <Fields>
      <Pick label="Road" value={road.flow} options={flows} onChange={(flow) => onChange({ ...road, flow })} />
      <label className="small"><input type="checkbox" checked={road.traffic} onChange={(e) => onChange({ ...road, traffic: e.target.checked })} /> Carries traffic</label>
      {road.flow !== 'two-way' && <label className="small"><input type="checkbox" checked={road.arrows} onChange={(e) => onChange({ ...road, arrows: e.target.checked })} /> Arrows</label>}
    </Fields>
  );
}

/** The numbers and options of the part of the structure that is selected. */
function PartDetails({ file, selected, onChange, onDelete }: { file: MapFile; selected: PartRef; onChange: (next: MapFile) => void; onDelete: () => void }) {
  const box = partBox(file, selected)!;
  const { part, index } = selected;
  const road = part === 'road' ? file.map.roads[index] : undefined;
  const stop = part === 'bus' || part === 'taxi' ? file.map.stops[part] : undefined;
  const via = part === 'via' ? file.map.stops.bus.via?.[index] : undefined;
  const walk = part === 'walk' ? file.map.walks?.[index] : undefined;
  const flow: Flow = road ? (road.median !== undefined ? 'dual' : road.lanes ? 'one-way' : 'two-way') : 'two-way';
  const grid = file.settings.layout === 'grid';
  const boxed = ['rail', 'wing', 'reception', 'lot', 'strip', 'green', 'block', 'edge'].includes(part);
  const setBox = (changes: Partial<MapBox>) => onChange(resizePart(file, selected, { ...box, ...changes }));
  const own = file.map.building.own;
  const setOwnBox = (changes: Partial<MapBox>) => onChange(setOwn(file, { ...own, ...changes }));
  const block = part === 'block' ? file.map.ground[index] : undefined;
  const directions = road?.along === 'x' ? ([['1', 'East'], ['-1', 'West']] as const) : ([['1', 'South'], ['-1', 'North']] as const);
  return (
    <fieldset className="fe-part active me-details">
      <legend className="small">{PART_NAMES[part]}</legend>
      <Fields>
        {road && (
          <>
            <Num label={road.along === 'x' ? 'Across (z)' : 'Across (x)'} value={road.at} step={1} onChange={(v) => onChange(moveRoad(file, index, road.along === 'x' ? { x: 0, z: Math.round(v - road.at) } : { x: Math.round(v - road.at), z: 0 }))} />
            {road.from !== undefined && <Num label="From" value={road.from} step={1} onChange={(v) => onChange(editRoad(file, index, { from: Math.round(v) }))} />}
            {road.to !== undefined && <Num label="To" value={road.to} step={1} onChange={(v) => onChange(editRoad(file, index, { to: Math.round(v) }))} />}
            <Pick label="Driven" value={flow} options={grid ? [...FLOWS, ['dual', 'Dual']] : FLOWS} onChange={(next) => onChange(editRoad(file, index, { flow: next }))} />
            {flow === 'one-way' && <Pick label="Traffic goes" value={String(road.lanes![0]!.direction) as '1'} options={directions} onChange={(d) => onChange(editRoad(file, index, { direction: Number(d) as 1 | -1 }))} />}
            <label className="small"><input type="checkbox" checked={road.traffic} onChange={(e) => onChange(editRoad(file, index, { traffic: e.target.checked }))} /> Carries traffic</label>
            {flow !== 'two-way' && <label className="small"><input type="checkbox" checked={road.arrows === true} onChange={(e) => onChange(editRoad(file, index, { arrows: e.target.checked }))} /> Arrows</label>}
          </>
        )}
        {boxed && (
          <>
            <Num label="West (x)" value={box.x} step={1} onChange={(x) => setBox({ x: Math.round(x) })} />
            <Num label="North (z)" value={box.z} step={1} onChange={(z) => setBox({ z: Math.round(z) })} />
            <Num label="Width" value={box.w} step={1} min={1} onChange={(w) => setBox({ w: Math.round(w) })} />
            <Num label="Depth" value={box.d} step={1} min={1} onChange={(d) => setBox({ d: Math.round(d) })} />
          </>
        )}
        {block && <Pick label="Ground" value={block.kind} options={BLOCK_KINDS.map((k) => [k, GROUND_NAMES[k]] as const)} onChange={(kind) => onChange(editBlock(file, index, { kind }))} />}
        {stop && <Num label="Along the road" value={stop.pos} step={1} onChange={(v) => onChange(setStop(file, part as 'bus', stop.along === 'x' ? { x: v, z: stop.at } : { x: stop.at, z: v }))} />}
        {via && (
          <>
            <p className="small">Point {index + 1} of {file.map.stops.bus.via!.length}. The bus drives past the points in this order.</p>
            <Num label="East (x)" value={via.x} step={1} onChange={(x) => onChange(moveVia(file, index, { x, z: via.z }))} />
            <Num label="South (z)" value={via.z} step={1} onChange={(z) => onChange(moveVia(file, index, { x: via.x, z }))} />
          </>
        )}
        {walk && <p className="small">{walk.length} points. Drag it to move it, or remove it and draw another.</p>}
        {part === 'fountain' && file.map.lot.fountain && (
          <>
            <Num label="East (x)" value={file.map.lot.fountain.x} step={0.5} onChange={(x) => onChange(setFountain(file, { x, z: file.map.lot.fountain!.z }))} />
            <Num label="South (z)" value={file.map.lot.fountain.z} step={0.5} onChange={(z) => onChange(setFountain(file, { x: file.map.lot.fountain!.x, z }))} />
          </>
        )}
        {(part === 'wing' || part === 'reception') && (
          <>
            <Num label="Company block, west (x)" value={own.x} step={1} onChange={(x) => setOwnBox({ x })} />
            <Num label="Company block, north (z)" value={own.z} step={1} onChange={(z) => setOwnBox({ z })} />
            <Num label="Company block, width" value={own.w} step={1} min={1} onChange={(w) => setOwnBox({ w })} />
            <Num label="Company block, depth" value={own.d} step={1} min={1} onChange={(d) => setOwnBox({ d })} />
          </>
        )}
      </Fields>
      <div className="row">
        {!KEPT_PARTS.includes(part) && <button type="button" onClick={onDelete}>Remove</button>}
        <span className="muted small">{KEPT_PARTS.includes(part) ? 'A map has one of these, so it can be moved but not removed.' : ''}</span>
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
