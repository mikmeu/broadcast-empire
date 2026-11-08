import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MAPS } from '../config/maps';
import { copyOfMap, forTheGame as forTheGameTown } from '../mods/townDraft';
import { newTown } from '../mods/townStructure';
import { exportMapFile, importMapFile, loadMapMods, saveMapMod, type MapProblem } from '../mods/mapMods';
import { toMapFile, type MapFile } from '../mods/mapFile';
import { stopPreviewMap } from '../mods/mapPreview';
import { uniqueId } from '../mods/draft';
import type { RegionId } from '../config/world';
import type { DesktopBridge } from '../persistence/desktop';
import { TownEditor, lookOf as townLookOf } from './mapEditor/TownEditor';
import { useGameStore } from './store';

type Mods = NonNullable<DesktopBridge['mods']>;

/** Where the map in the editor came from. */
type Source = { kind: 'default'; id: string; name: string } | { kind: 'mod'; id: string } | { kind: 'new' } | { kind: 'import' };

const GAME_MAPS = Object.values(MAPS);
const systemReducesMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LEAVE = 'Leave without saving? Your changes to this map will be lost.';
const HISTORY = 100;

/** The map in the editor with what undo and redo can reach. */
interface Doc<T> {
  file: T | null;
  past: T[];
  future: T[];
}

const none = <T,>(): Doc<T> => ({ file: null, past: [], future: [] });
const changed = <T,>(d: Doc<T>, next: T): Doc<T> => (d.file ? { file: next, past: [...d.past.slice(-HISTORY + 1), d.file], future: [] } : d);
const undone = <T,>(d: Doc<T>): Doc<T> => (d.file && d.past.length > 0 ? { file: d.past[d.past.length - 1]!, past: d.past.slice(0, -1), future: [...d.future, d.file] } : d);
const redone = <T,>(d: Doc<T>): Doc<T> => (d.file && d.future.length > 0 ? { file: d.future[d.future.length - 1]!, past: [...d.past, d.file], future: d.future.slice(0, -1) } : d);

/**
 * The map editor (0.21.0, #284, in 3D from #328, the only one from #331), desktop only and behind a developer setting: open one of the game's maps (as a
 * copy), a map in the mods folder or a file, or start a new map (the bare structure of Coaxia or of Amplify Hills, #329); place houses, trees, lamps and
 * hills, paint the ground, and make the roads, the rail, the building, the stops and the lot on the town as the game draws it; save it to the mods folder
 * or export it. A file of format 1 is listed as one that cannot be used, with the reason. Nothing here touches a game.
 */
export function MapEditor({ mods, onClose }: { mods: Mods; onClose: () => void }) {
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion) || systemReducesMotion();
  const [found, setFound] = useState<{ maps: MapFile[]; problems: MapProblem[] }>({ maps: [], problems: [] });
  const [town, setTown] = useState<Doc<MapFile>>(none);
  const [opened, setOpened] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const busy = useRef(false);
  const [source, setSource] = useState<Source>({ kind: 'new' });
  const [clean, setClean] = useState('');
  const [message, setMessage] = useState<{ text: string; bad?: boolean }>();
  const [looks, setLooks] = useState<RegionId>('capital');

  const refresh = useCallback(() => loadMapMods(mods).then(setFound), [mods]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The town is put on the game's list of towns under a reserved name so the scene can draw it, and taken off when the editor closes.
  useEffect(() => () => stopPreviewMap(), []);

  const townText = useMemo(() => (town.file ? toMapFile(town.file) : ''), [town.file]);
  const dirty = town.file !== null && townText !== clean;
  const leave = () => !dirty || window.confirm(LEAVE);
  const close = () => {
    setTown(none);
    setMessage(undefined);
  };

  /** Makes a change the player can undo. */
  const commitTown = useCallback((next: MapFile) => setTown((d) => changed(d, next)), []);
  const undo = useCallback(() => {
    setTown(undone);
    setEpoch((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    setTown(redone);
    setEpoch((n) => n + 1);
  }, []);

  // Ctrl+Z and Ctrl+Y undo and redo; Escape steps back: from the map to the list, then to the menu. (The 3D editor steps back from its own tool or selection first.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
      if (e.key === 'Escape') {
        if (e.target instanceof HTMLElement && e.target.tagName === 'SELECT') return;
        if (town.file) {
          if (busy.current) return;
          if (!dirty || window.confirm(LEAVE)) close();
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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [town.file, dirty, onClose, undo, redo]);

  const taken = [...GAME_MAPS.map((m) => m.id), ...found.maps.map((m) => m.id), ...found.problems.map((p) => p.id)];

  const openTown = (next: MapFile, from: Source, saved = from.kind === 'default' || from.kind === 'mod') => {
    if (!leave()) return;
    setTown({ file: next, past: [], future: [] });
    setOpened((n) => n + 1);
    setEpoch((n) => n + 1);
    setSource(from);
    setClean(saved ? toMapFile(next) : '');
    setMessage(undefined);
    setLooks(townLookOf(next, from.kind === 'default' ? from.id : next.id));
  };

  const importFile = async () => {
    if (!leave()) return;
    const picked = await importMapFile(mods);
    if (!picked) return;
    if (!picked.ok) return setMessage({ text: `${picked.fileName} cannot be used: ${picked.reason}`, bad: true });
    openTown({ ...picked.file, id: uniqueId(picked.file.id, taken) }, { kind: 'import' });
    setMessage({ text: `Opened ${picked.fileName}. It is not in your folder until you save it.` });
  };

  const exists = (id: string) => taken.includes(id) && !(source.kind === 'mod' && source.id === id) && !window.confirm(`There is a map called “${id}” already. Replace it?`);

  const saveTown = async () => {
    const file = town.file;
    if (!file) return;
    if (exists(file.id)) return;
    if (GAME_MAPS.some((m) => m.id === file.id)) return setMessage({ text: `“${file.id}” is the id of one of the game’s maps. Choose another id.`, bad: true });
    try {
      await saveMapMod(file, mods);
      setSource({ kind: 'mod', id: file.id });
      setClean(toMapFile(file));
      setMessage({ text: `Saved “${file.name}” in your mods folder.` });
      await refresh();
    } catch (error) {
      setMessage({ text: `Could not save: ${error instanceof Error ? error.message : String(error)}`, bad: true });
    }
  };

  const exportTown = async () => {
    if (town.file && (await exportMapFile(town.file, mods))) setMessage({ text: 'Exported.' });
  };

  /** A copy of the game's own map, back as the file the game keeps (src/config/maps/<id>.json), for a developer to put in place: the same text as the game's own while nothing is changed. */
  const exportForGame = async () => {
    if (!town.file || source.kind !== 'default') return;
    if (await exportMapFile(forTheGameTown(town.file, source.id, source.name), mods, `${source.id}.json`)) setMessage({ text: 'Exported for the game.' });
  };

  const remove = async () => {
    if (source.kind !== 'mod' || !window.confirm(`Remove “${town.file?.name ?? source.id}” from your mods folder for good?`)) return;
    await mods.remove('maps', source.id);
    close();
    setMessage({ text: 'Removed.' });
    await refresh();
  };

  const current = (key: string) => (source.kind === 'mod' ? `mod:${source.id}` : source.kind === 'default' ? `default:${source.id}` : undefined) === key && town.file !== null;
  const listed = (key: string, label: string, onClick: () => void, extra?: string) => (
    <li key={key}>
      <button type="button" className={current(key) ? 'catalog-entry active' : 'catalog-entry'} aria-pressed={current(key)} onClick={onClick}>
        <strong>{label}</strong>
        {extra && <span className="small">{extra}</span>}
      </button>
    </li>
  );

  const list = (
    <nav className="fe-list" aria-label="Maps">
      <div className="row">
        <button type="button" className="primary" onClick={() => openTown(newTown('grid', taken), { kind: 'new' }, false)}>New grid map</button>
        <button type="button" onClick={() => openTown(newTown('roads', taken), { kind: 'new' }, false)}>New map of roads</button>
        <button type="button" onClick={() => void importFile()}>Import file…</button>
      </div>
      <h3>Your maps</h3>
      <ul className="catalog-list">
        {found.maps.map((map) => listed(`mod:${map.id}`, map.name, () => openTown(structuredClone(map), { kind: 'mod', id: map.id })))}
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
        {GAME_MAPS.map((map) => listed(`default:${map.id}`, map.name, () => openTown(copyOfMap(map.id, taken), { kind: 'default', id: map.id, name: map.name }), map.settings.layout === 'roads' ? 'Laid out by its roads' : 'Laid out as a grid'))}
      </ul>
    </nav>
  );

  const header = (
    <header className="fe-head">
      <h2>Map editor</h2>
      <p className="muted small">Maps you make are kept in your mods folder.</p>
      <button type="button" onClick={() => leave() && onClose()}>Back to the menu</button>
    </header>
  );

  const shell = (body: ReactNode, foot: ReactNode) => (
    <div className="furniture-editor map-editor">
      {header}
      <div className="fe-body me-body">
        {list}
        {body}
      </div>
      {foot}
      {!town.file && message && <p className={message.bad ? 'small fe-error' : 'small'} role="status">{message.text}</p>}
    </div>
  );

  if (town.file) {
    const file = town.file;
    return (
      <TownEditor
        key={opened}
        file={file}
        original={source.kind === 'default' ? MAPS[source.id] : undefined}
        looks={looks}
        onLooks={setLooks}
        reduceMotion={reduceMotion}
        commit={commitTown}
        epoch={epoch}
        busy={busy}
        message={message}
        frame={({ middle, side, foot }) => shell(<>{middle}{side}</>, foot)}
        buttons={(checked) => (
          <>
            <button type="button" disabled={town.past.length === 0} onClick={undo} title="Ctrl+Z">Undo</button>
            <button type="button" disabled={town.future.length === 0} onClick={redo} title="Ctrl+Y">Redo</button>
            <button type="button" className="primary" onClick={() => void saveTown()}>Save</button>
            <button type="button" onClick={() => void exportTown()}>Export…</button>
            {source.kind === 'default' && <button type="button" disabled={!checked.ok} onClick={() => void exportForGame()}>Export for the game</button>}
            {source.kind === 'mod' && <button type="button" onClick={() => void remove()}>Remove</button>}
          </>
        )}
      />
    );
  }

  return shell(<p className="muted fe-empty">Choose a map on the left, start a new one or import a file.</p>, null);
}
