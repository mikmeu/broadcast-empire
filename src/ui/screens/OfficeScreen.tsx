

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { FLOOR_UNLOCK_VALUE } from '../../config/balance';
import { FURNITURE, ROOM_TYPE_NAMES, floorsOf, inText, type FurnitureType, type RoomType } from '../../config/office';
import { moveFurniture, placeFurniture, rotateFurniture } from '../../sim/actions';
import { buildingOf, countOf, findFreeSpot, findRoom, floorPlan, placementError, requirements as checklist, roomsTaking } from '../../sim/office';
import type { GameState } from '../../sim/state';
import { CEO_ID, beatAt } from '../../office/layout';
import { Panel } from '../components';
import { formatMoney } from '../format';
import { play } from '../../audio/player';
import { PLACE_SOUND } from '../../audio/sounds';
import { useOfficeView } from '../officeView';
import { useGame, useGameStore } from '../store';
import { clock } from '../useGameLoop';
import { BuildPanel, withRect } from './office/BuildPanel';
import { CableLegend, PieceWindow, RoomPanel } from './office/RoomPanel';
import { CeoPanel, PersonPanel } from './office/people';
import { either, worldHours, worldTime } from './office/shared';
import { DeskSummary, UpkeepSummary } from './office/summaries';

// The 3D view brings a large library with it, so it is only loaded when shown.
const Office3D = lazy(() => import('../../office/Office3D').then((m) => ({ default: m.Office3D })));

const systemReducesMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Where the office is in its day, in beats (see ROUTINE in layout.ts): read
 * from the game's clock a few times a second, as it moves on within a day.
 */
function useBeat(day: number): number {
  const [beat, setBeat] = useState(() => beatAt(day, clock.dayProgress));
  useEffect(() => {
    const update = () => setBeat(beatAt(day, clock.dayProgress));
    update();
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [day]);
  return beat;
}

/**
 * The office in 3D, filling the middle of the screen. The floors are picked
 * from the bar at the top left and a room by clicking it (or from the list in
 * the Office window); whatever is selected shows its panel on the right.
 * `onCatalog` opens the furniture catalog.
 */
export function OfficeStage({ onCatalog }: { onCatalog: () => void }) {
  const game = useGame();
  const run = useGameStore((s) => s.run);
  const { roomId, furnitureId, personId, placing, placingTurn, moving, cursor, drawing, cables } = useOfficeView();
  // The floor in view is one this building has, or its roof: another game may have been on a higher one.
  const floors = floorsOf(buildingOf(game));
  const roof = floors.length + 1;
  const floor = Math.min(useOfficeView((s) => s.floor), roof);
  const { setFloor, selectRoom, selectFurniture, selectPerson, place, turnPlacing, move, point, openCatalog, draw, showCables } = useOfficeView.getState();
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion) || systemReducesMotion();
  /** Nothing moves or is drawn again while the home screen covers the office. */
  const covered = useGameStore((s) => s.atHome);
  const beat = useBeat(game.day);
  const pace = useGameStore((s) => s.speed);

  // Escape cancels what is going on: placing, moving or drawing, or else the selected piece. R turns what is
  // being placed or moved, or else the selected piece.
  useEffect(() => {
    if (!placing && !moving && !furnitureId && !drawing) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'Escape') {
        if (placing || moving || drawing) (place(null), move(null), draw(null));
        else selectFurniture(null);
      }
      if (e.key !== 'r' && e.key !== 'R') return;
      if (placing || moving) (turnPlacing(), play('turn'));
      else if (roomId && furnitureId && run((s) => rotateFurniture(s, roomId, furnitureId))) play('turn');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing, moving, furnitureId, roomId, drawing, run, place, move, turnPlacing, draw, selectFurniture]);

  const room = roomId ? findRoom(game, roomId) : undefined;
  const person = personId ? game.employees.find((e) => e.id === personId) : undefined;
  /** The piece that was picked up to be moved, and what is on the pointer: that piece, or a new one. */
  const lifted = moving ? findRoom(game, moving.roomId)?.furniture.find((f) => f.id === moving.furnitureId) : undefined;
  const carried = placing ?? lifted?.type ?? null;
  /** The rooms on this floor that take it. */
  const takers = carried ? roomsTaking(game, floor, carried) : [];
  /** Why it can't go where it is now, if it can't. */
  const under = cursor ? takers.find((r) => r.roomId === cursor.roomId) : undefined;
  const blocked = carried && cursor && under ? placementError(game, under, carried, cursor.x, cursor.y, placingTurn, lifted?.id) : null;

  // What is on the pointer starts somewhere, so that the arrow keys and Enter can take it from there. A piece that
  // is moved starts where it stands. A new one starts over a free spot: in the selected room if that takes it,
  // and otherwise in the first room on this floor that has a place for it.
  const seed = (type: FurnitureType) => {
    if (moving && lifted && (!roomId || roomId === moving.roomId)) return point({ roomId: moving.roomId, x: lifted.x, y: lifted.y });
    const rooms = roomsTaking(game, floor, type);
    for (const candidate of [...rooms.filter((r) => r.roomId === roomId), ...rooms]) {
      const spot = findFreeSpot(game, candidate, type);
      if (spot) return point({ roomId: candidate.roomId, ...spot });
    }
    point(null);
  };
  const seeded = useRef('');
  useEffect(() => {
    const key = carried ? `${carried}/${moving?.furnitureId ?? ''}/${roomId ?? ''}/${floor}` : '';
    if (key === seeded.current) return;
    seeded.current = key;
    if (carried) seed(carried);
  });
  // A piece that is gone can't be moved.
  useEffect(() => {
    if (moving && !lifted) move(null);
  }, [moving, lifted, move]);

  /** The selected piece and the room it stands in. */
  const picked = room && furnitureId ? room.furniture.find((f) => f.id === furnitureId) : undefined;
  const showCatalog = (tab?: RoomType | null) => {
    if (tab) openCatalog(tab);
    onCatalog();
  };

  return (
    <div className="office-stage">
      <Suspense fallback={<div className="office3d loading-3d">Opening the office…</div>}>
        <Office3D
          game={game}
          floor={floor}
          selectedRoomId={roomId}
          selectedFurnitureId={furnitureId}
          selectedPersonId={personId}
          placing={placing}
          placingTurn={placingTurn}
          moving={moving}
          cursor={cursor}
          onPoint={point}
          pieceWindow={room && picked && !drawing ? <PieceWindow game={game} room={room} item={picked} /> : undefined}
          still={reduceMotion || covered}
          beat={beat}
          now={worldTime}
          hours={worldHours}
          pace={pace}
          onSelectRoom={(id) => id !== roomId && selectRoom(id)}
          onSelectFurniture={selectFurniture}
          onSelectPerson={selectPerson}
          onPlace={(id, x, y, byKey) => {
            if (moving && lifted) {
              if (!run((s) => moveFurniture(s, moving.roomId, moving.furnitureId, { roomId: id, x, y, turn: placingTurn }))) return;
              play(PLACE_SOUND[lifted.type]);
              move(null);
              if (id !== roomId) selectRoom(id);
              return;
            }
            const before = findRoom(game, id);
            if (!placing || !run((s) => placeFurniture(s, id, placing, x, y, placingTurn))) return;
            play(PLACE_SOUND[placing]);
            // The room it went into shows its panel, with what the room still needs.
            if (id !== roomId) selectRoom(id);
            // The piece that completes a line of the room's checklist is the last one: placing stops by itself.
            const after = findRoom(useGameStore.getState().game ?? game, id);
            const line = before && after ? checklist(after).find(([type]) => type === placing) : undefined;
            if (before && after && line && countOf(before.furniture, line[0]) < line[1] && countOf(after.furniture, line[0]) >= line[1]) place(null);
            // With the keys the next one starts over the next free spot; the pointer is where it is.
            if (byKey) seeded.current = '';
          }}
          drawing={drawing}
          onDrawRect={(rect) => drawing && draw(withRect(game, floor, drawing, rect))}
          onDrawDoor={(door) => drawing && draw({ ...drawing, door })}
          cables={cables}
        />
      </Suspense>

      <div className="office-bar">
        <div className="segmented" role="tablist" aria-label="Floor">
          {floors.map((f) => {
            const locked = f > game.floorsUnlocked;
            return (
              <button
                key={f}
                role="tab"
                aria-selected={f === floor}
                className={f === floor ? 'active' : undefined}
                disabled={locked}
                title={locked ? `Opens when your company is worth ${formatMoney(FLOOR_UNLOCK_VALUE[f] ?? 0)}` : undefined}
                onClick={() => setFloor(f)}
              >
                Floor {f}
                {locked ? ' · locked' : ''}
              </button>
            );
          })}
          <button role="tab" aria-selected={floor === roof} className={floor === roof ? 'active' : undefined} title="The roof, with the antenna" onClick={() => (draw(null), place(null), move(null), setFloor(roof))}>
            Roof
          </button>
        </div>
        <button className={cables ? 'active' : undefined} aria-pressed={cables} data-guide="cables" title="Show the cables from the studios to the master control room and the roof" onClick={() => showCables(!cables)}>
          Cables
        </button>
        <button
          className={drawing && !drawing.roomId ? 'primary active' : 'primary'}
          data-guide="build-room"
          disabled={floor === roof}
          aria-pressed={Boolean(drawing && !drawing.roomId)}
          onClick={() => (drawing ? draw(null) : (selectRoom(null), draw({ roomId: null, kind: null, rect: null, door: null })))}
          title="Draw a new room on this floor"
        >
          Build a room
        </button>
      </div>

      {cables && <CableLegend game={game} />}

      {carried && (
        <div className="placing-banner" role="status">
          <span>
            <strong>{lifted ? 'Moving' : 'Placing'}: {FURNITURE[carried].name}</strong>
            <span className="small">
              {blocked
                ? blocked
                : takers.length > 0
                  ? `Point at a free spot in ${either(takers.map((r) => r.name))} and click, or use the arrow keys and Enter. The shape shows how it will stand.`
                  : `No room on this floor takes it. It goes in a ${either(FURNITURE[carried].rooms.map((t) => inText(ROOM_TYPE_NAMES[t])))}.`}
            </span>
          </span>
          <button data-sound="turn" onClick={turnPlacing} title="Turn it a quarter">
            <kbd>R</kbd> Turn
          </button>
          <button onClick={() => (place(null), move(null))} title={lifted ? 'Leave it where it stood' : 'Stop placing'}>
            <kbd>Esc</kbd> {lifted ? 'Cancel' : 'Done'}
          </button>
        </div>
      )}

      {(person || personId === CEO_ID || roomId || drawing) && (
        <div className="office-side">
          {drawing && <BuildPanel game={game} floor={floor} drawing={drawing} />}
          {person && <PersonPanel game={game} person={person} beat={beat} onClose={() => selectPerson(null)} />}
          {personId === CEO_ID && <CeoPanel game={game} beat={beat} onClose={() => selectPerson(null)} />}
          {roomId && !drawing && (
            <RoomPanel
              key={roomId}
              roomId={roomId}
              room={room}
              placing={placing}
              onPlace={place}
              onCatalog={showCatalog}
              onSelectFurniture={selectFurniture}
              onClose={() => selectRoom(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** The office as a whole: whether everyone has a desk, and whether the support staff keep up. */
export function OfficeOverview() {
  const game = useGame();
  return (
    <div className="stack">
      <Panel title="Desks and upkeep" help="upkeep">
        <DeskSummary game={game} />
        <UpkeepSummary game={game} />
      </Panel>
      <RoomList game={game} />
    </div>
  );
}

/** Every room of the building, by floor: another way to a room than clicking it in the office, and the one for the keyboard. */
function RoomList({ game }: { game: GameState }) {
  const { roomId, setFloor, selectRoom, draw } = useOfficeView();
  const rooms = floorPlan(game);
  const floors = floorsOf(buildingOf(game)).filter((f) => rooms.some((r) => r.floor === f));
  return (
    <Panel title="Rooms" help="office">
      <p className="muted small">Click a room in the office, or pick it here, to see its panel and furnish it. “Build a room” above the office draws a new one.</p>
      {floors.map((f) => (
        <section key={f} className="room-list">
          {floors.length > 1 && <h3>Floor {f}</h3>}
          <ul>
            {rooms
              .filter((r) => r.floor === f)
              .sort((a, b) => Number(Boolean(a.fixed)) - Number(Boolean(b.fixed)) || a.name.localeCompare(b.name, undefined, { numeric: true }))
              .map((r) => {
                const type = findRoom(game, r.id)?.type ?? r.fixed;
                return (
                  <li key={r.id}>
                    <button className={r.id === roomId ? 'active' : undefined} aria-pressed={r.id === roomId} onClick={() => (draw(null), setFloor(f), selectRoom(r.id === roomId ? null : r.id))}>
                      <strong>{r.name}</strong>
                      <span className="muted small">{type ? ROOM_TYPE_NAMES[type] : 'Kind not chosen yet'}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </Panel>
  );
}
