import { Fragment, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BUILD_COST_PER_TILE, CLEANLINESS, FLOOR_UNLOCK_VALUE, FURNITURE_WORTH, MS_PER_DAY } from '../../config/balance';
import {
  CONTROL_ROOM_KIT,
  FURNITURE,
  REMOTE_DESKS,
  ROOM_MIN,
  ROOM_SIZES,
  ROOM_TYPE_NAMES,
  ROOM_TYPE_NOTES,
  STUDIO_REQUIREMENTS,
  floorsOf,
  inText,
  isStudioType,
  type FurnitureType,
  type RoomType,
} from '../../config/office';
import { GENRES } from '../../config/genres';
import { NAME_LENGTH } from '../../sim/newGame';
import { COMFORT, CONTROL_ROOM, COOKS, ENGINEERS, MEETINGS, POST } from '../../config/balance';
import {
  assignDesk,
  buildRoom,
  moveFurniture,
  placeFurniture,
  releaseRoom,
  renameRoom,
  reshapeRoom,
  rotateFurniture,
  seatGroup,
  sellFurniture,
  setRoomType,
  upgradeCost,
  upgradeEquipment,
} from '../../sim/actions';
import { buildCost, kindError, proposeDoor, proposeRoom, reshapeCost, roomError } from '../../sim/rooms';
import { cables as cablesOf, crewing, crewPosts, masterControlRoom, needsMasterControl, throughMasterControl } from '../../sim/control';
import { adjacentRooms, borrowedDesks, buildingOf, controlRoomOf, countOf, isTvStudio, tvControlRooms, deskFor, deskRoomFor, deskHolders, employeesWithDesk, findFreeSpot, isWorkplace, ownDesk, ownerOf, workplacesIn, findRoom, floorPlan, isBroken, isManager, managerDeskCount, monthlyRent, needsDesk, rentPerTile, placementError, requirements as checklist, roomLayout, roomName, roomsTaking, studioKit, wearsOut, workstationCount } from '../../sim/office';
import type { Employee, Furniture, GameState, Id, RentedRoom, Role } from '../../sim/state';
import { formatDate, officeHours, toCalendarDate } from '../../sim/calendar';
import { equipmentLevel, furniturePrice, outdatedItems, purchaseTier, resaleValue, saleBlocker, worthAt } from '../../sim/tech';
import { averageMorale, canteenSeats, canteenStatus, hasToilets, hotMeals, postSorted, roomComfort, technicianTitle, upkeepLoad, type Workload } from '../../sim/upkeep';
import { channelOffAirReason, engineeredShows, isEngineered } from '../../sim/broadcast';
import { getGenre } from '../../config/genres';
import { meetingSeats } from '../../sim/morale';
import { TEAMS, TEAM_IDS, onStrike } from '../../sim/teams';
import { CEO_ID, beatAt, whereaboutsOf } from '../../office/layout';
import { DEPARTMENT_NAMES } from '../../sim/staff';
import { Avatar } from '../Avatar';
import { Meter, Panel, Tag } from '../components';
import { Icon } from '../Icon';
import { formatMoney, formatPercent } from '../format';
import { play } from '../../audio/player';
import { PLACE_SOUND } from '../../audio/sounds';
import { useOfficeView, type Drawing } from '../officeView';
import { RoomKinds } from '../RoomKinds';
import { useGame, useGameStore } from '../store';
import { clock } from '../useGameLoop';
import { PersonDetails } from './StaffScreen';

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

/** The game's time in seconds at normal speed; it stands still while the game is paused. */
const worldTime = () => ((useGameStore.getState().game?.day ?? 0) + clock.dayProgress) * (MS_PER_DAY / 1000);

/** The time on the office clock, in hours that keep counting. */
const worldHours = () => officeHours(useGameStore.getState().game?.day ?? 0, clock.dayProgress);

/** "A, B or C": the choices in a sentence. */
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const listOf = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const either = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`);

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

/** Who was clicked in the office: who they are and what they are doing right now. */
function PersonPanel({ game, person, beat, onClose }: { game: GameState; person: Employee; beat: number; onClose: () => void }) {

  return (
    <Panel
      title={ROLE_TITLES[person.role]}
      actions={
        <button className="icon-button" onClick={onClose} aria-label="Close" title="Close">
          <Icon name="close-button" size={20} />
        </button>
      }
    >
      <div className="person-card">
        <Avatar name={person.name} size={72} />
        <PersonDetails person={person} />
      </div>
      <dl className="facts">
        <dt>Salary</dt>
        <dd>{formatMoney(person.salary)} / month</dd>
        <dt>Now</dt>
        <dd>{whereaboutsOf(game, person.id, beat)}</dd>
        {needsDesk(person.role) && (
          <>
            <dt>Workplace</dt>
            <dd><Seat game={game} person={person} /></dd>
          </>
        )}
      </dl>
      <p className="muted small">Hire, fire and assign people in the Staff window. A workplace is given out in the panel of an office.</p>
    </Panel>
  );
}

/** The player's own character, clicked in the office. */
function CeoPanel({ game, beat, onClose }: { game: GameState; beat: number; onClose: () => void }) {
  return (
    <Panel
      title="CEO"
      actions={
        <button className="icon-button" onClick={onClose} aria-label="Close" title="Close">
          <Icon name="close-button" size={20} />
        </button>
      }
    >
      <p>
        <strong>{game.playerName}</strong> <span className="muted">· CEO of {game.companyName}. That’s you.</span>
      </p>
      <dl className="facts">
        <dt>Now</dt>
        <dd>{whereaboutsOf(game, CEO_ID, beat)}</dd>
      </dl>
      <p className="muted small">Your name and your character can be changed in Settings.</p>
    </Panel>
  );
}

const ROLE_TITLES: Record<Role, string> = {
  host: 'Host',
  production: 'Production',
  channelManager: 'Channel manager',
  manager: 'Department manager',
  sales: 'Sales',
  marketing: 'Marketing',
  researcher: 'R&D',
  cleaner: 'Cleaner',
  technician: 'Technician',
  maintenance: 'Maintenance',
  writer: 'Writer',
  editor: 'Video editor',
  engineer: 'Audio engineer',
  cook: 'Cook',
  clerk: 'Post room clerk',
};

/**
 * The places of the desk workers who are not office staff or managers, by
 * job: the piece they work at and what they can't do without it.
 */
const OTHER_PLACES: { role: Role; place: string; whom: string; without: string }[] = [
  { role: 'writer', place: 'writer’s place', whom: 'writer', without: 'without a place in a writers’ room with a story board: they can’t write' },
  { role: 'editor', place: 'editing desk', whom: 'video editor', without: 'without a working editing desk: they can’t edit' },
  { role: 'engineer', place: 'audio desk', whom: 'audio engineer', without: 'without a working audio desk in an audio room' },
  { role: 'cook', place: 'stove', whom: 'cook', without: 'without a stove in a canteen that has all it needs: they can’t cook' },
  { role: 'clerk', place: 'sorting case', whom: 'clerk', without: 'without a sorting case in a post room' },
];

/** What someone does, in a few words: a department manager with their department. */
const jobOf = (person: Employee) => (person.role === 'manager' && person.department ? `${DEPARTMENT_NAMES[person.department]} manager` : ROLE_TITLES[person.role]);

/** Where someone works: the room of their desk today, and whether that place is their own. */
function Seat({ game, person }: { game: GameState; person: Employee }) {
  const run = useGameStore((s) => s.run);
  const desk = employeesWithDesk(game).get(person.id);
  const own = ownDesk(game, person);
  if (!desk) return <Tag tone="danger">{own ? `Their own desk in ${own.room.name} is broken, and no other is free` : 'None: they can’t work'}</Tag>;
  return (
    <>
      {roomName(game, desk.roomId)}
      <span className="muted small"> · {own ? (own.item.id === desk.itemId ? 'their own place' : `for now: their own desk in ${own.room.name} is broken`) : 'no place of their own'}</span>
      {own && (
        <>
          {' '}
          <button className="link" onClick={() => run((s) => assignDesk(s, person.id, null))} title="They take whatever desk is free again">Let it go</button>
        </>
      )}
    </>
  );
}

function DeskSummary({ game }: { game: GameState }) {
  const desked = employeesWithDesk(game);
  const deskWorkers = game.employees.filter((e) => needsDesk(e.role));
  const managers = deskWorkers.filter((e) => isManager(e.role));
  const staff = deskWorkers.filter((e) => deskFor(e.role) === 'workstation');
  // Whoever is on strike is at home: they need no desk today.
  const without = (people: Employee[]) => people.filter((e) => !desked.has(e.id) && !onStrike(game, e)).length;
  const broken = game.rooms.flatMap((r) => r.furniture).filter((f) => f.type === 'workstation' && isBroken(f)).length;
  const others = OTHER_PLACES.map((kind) => ({
    ...kind,
    people: deskWorkers.filter((e) => e.role === kind.role),
    places: game.rooms.filter((r) => r.type === deskRoomFor(kind.role)).reduce((n, r) => n + countOf(r.furniture, deskFor(kind.role)), 0),
  }));
  return (
    <p className="muted small">
      {plural(workstationCount(game), 'workstation')}
      {broken > 0 && ` (${broken} broken)`} for {staff.length} office staff.{' '}
      {without(staff) > 0 && <Tag tone="danger">{without(staff)} without a working workstation: they can’t work</Tag>}{' '}
      {plural(managerDeskCount(game), 'manager’s desk')} for {plural(managers.length, 'manager')}.{' '}
      {without(managers) > 0 && <Tag tone="danger">{without(managers)} without a desk in a management office: they can’t work</Tag>}{' '}
      {others.map((kind) => (
        <Fragment key={kind.role}>
          {(kind.people.length > 0 || kind.places > 0) && <>{plural(kind.places, kind.place)} for {plural(kind.people.length, kind.whom)}.{' '}</>}
          {without(kind.people) > 0 && <Tag tone="danger">{without(kind.people)} {kind.without}</Tag>}{' '}
        </Fragment>
      ))}
      {without(deskWorkers) === 0 && 'Hosts and support staff don’t need a desk.'}
    </p>
  );
}

/** What the cooks make, against what the staff eat (0.15.0). */
function hotMealsText(game: GameState): string {
  const cooks = game.employees.filter((e) => e.role === 'cook').length;
  if (cooks === 0) return `None: with a stove and a cook, everyone who gets a hot meal is happier (+${COOKS.morale} morale).`;
  return `${Math.floor(hotMeals(game, employeesWithDesk(game)))} a day for ${game.employees.length} staff, by ${plural(cooks, 'cook')} (+${COOKS.morale} morale for those who get one)`;
}

/** Which teams meet today (0.15.0). */
function meetingsToday(game: GameState): string {
  const met = TEAM_IDS.filter((team) => game.meetings[team]?.on === game.day).map((team) => TEAMS[team].inText);
  return met.length > 0 ? `A meeting of ${met.join(' and ')}.` : `No meeting. A team is called from the Staff window: +${MEETINGS.morale} morale for ${MEETINGS.lasts} days.`;
}

/** Whose post is sorted, and what fan mail does (0.15.0). */
function postText(game: GameState): string {
  const sorted = postSorted(game, employeesWithDesk(game));
  if (sorted === 0) return `Nobody sorts it: a clerk at a sorting case sorts the post of ${POST.staffEach} staff (+${POST.morale} morale), and fan mail makes the hosts famous faster.`;
  return `Sorted for ${Math.min(game.employees.length, Math.floor(sorted))} of ${game.employees.length} staff (+${POST.morale} morale). Fan mail makes the hosts famous ${POST.fameGrowth} times as fast.`;
}

/** The radio shows the audio engineers look after (0.15.0). */
function engineeringText(game: GameState): string {
  const radio = game.shows.filter((s) => isEngineered(getGenre(s.genre)) && game.channels.some((c) => c.schedule.includes(s.id))).length;
  const looked = engineeredShows(game, employeesWithDesk(game)).size;
  return `${looked} of ${plural(radio, 'radio show')} on the air. Each engineer looks after ${ENGINEERS.showsEach}; a show they look after loses up to ${Math.round(ENGINEERS.slower * 100)}% less of its freshness.`;
}

/** Whether the support staff keep up with the office, and how the staff feel about it. */
function UpkeepSummary({ game }: { game: GameState }) {
  const load = upkeepLoad(game, employeesWithDesk(game));
  const staff = (role: string, one: string, many = `${one}s`) => {
    const n = game.employees.filter((e) => e.role === role).length;
    return `${n} ${n === 1 ? one : many}`;
  };
  const items = game.rooms.flatMap((r) => r.furniture);
  const worst = Math.min(100, ...items.filter((f) => wearsOut(f.type)).map((f) => f.condition));
  const dirtiest = Math.min(100, ...game.rooms.map((r) => r.cleanliness));
  const issues = game.rooms.filter((r) => r.issue).length;
  const morale = averageMorale(game);
  const canteen = canteenStatus(game);
  const technician = technicianTitle(game).toLowerCase();

  return (
    <dl className="upkeep small">
      <div>
        <dt>Cleaning</dt>
        <dd className="muted">{staff('cleaner', 'cleaner')} · dirtiest room {Math.round(dirtiest)}%</dd>
        <dd><LoadTag load={load.cleaning} bad={dirtiest < CLEANLINESS.cleanEnough} hire="cleaners" /></dd>
      </div>
      <div>
        <dt>Repairs</dt>
        <dd className="muted">{staff('technician', technician)} · worst item {Math.round(worst)}%</dd>
        <dd><LoadTag load={load.repairs} bad={worst < 50} hire={`${technician}s`} /></dd>
      </div>
      <div>
        <dt>Building</dt>
        <dd className="muted">{staff('maintenance', 'maintenance worker')} · {issues} open fault{issues === 1 ? '' : 's'}</dd>
        <dd><LoadTag load={load.maintenance} bad={issues > 0} hire="maintenance staff" /></dd>
      </div>
      <div>
        <dt>Morale</dt>
        <dd className="muted">Average {Math.round(morale)} of 100</dd>
        <dd>
          {game.employees.length === 0 ? null : canteen.kind === 'none' ? (
            <Tag>A canteen would raise it</Tag>
          ) : canteen.kind === 'incomplete' ? (
            <Tag tone="warning">The canteen still needs {listOf(canteen.missing.map(([type, n]) => plural(n, FURNITURE[type].name.toLowerCase())))}</Tag>
          ) : canteen.kind === 'filthy' ? (
            <Tag tone="danger">The canteen is too dirty to eat in</Tag>
          ) : canteen.coverage < 1 ? (
            <Tag tone="warning">The canteen serves {formatPercent(canteen.coverage)} of staff</Tag>
          ) : (
            <Tag tone="good">The canteen serves everyone</Tag>
          )}
        </dd>
      </div>
    </dl>
  );
}

/** Whether the support staff can do the daily work, and whether something is already in a bad state (`bad`). */
function LoadTag({ load, bad, hire }: { load: Workload; bad: boolean; hire: string }) {
  if (load.needed === 0) return null;
  if (load.capacity >= load.needed) return bad ? <Tag>Catching up</Tag> : <Tag tone="good">Keeping up</Tag>;
  return <Tag tone={bad ? 'danger' : 'warning'}>{load.capacity === 0 ? `No ${hire}` : `Not enough ${hire}`}</Tag>;
}

/**
 * What is being drawn with another rectangle: the door stays where it is if
 * it can, and otherwise the game proposes one, which can then be moved.
 */
function withRect(game: GameState, floor: number, drawing: Drawing, rect: NonNullable<Drawing['rect']>): Drawing {
  const roomId = drawing.roomId ?? undefined;
  const keeps = drawing.door && roomError(game, { floor, ...rect, door: drawing.door }, roomId) === null;
  return { ...drawing, rect, door: keeps ? drawing.door : proposeDoor(game, { floor, ...rect }, roomId), proposed: false };
}

/** A drawing with the place the game proposes for its kind of room, if a place of the usual size is left. */
function withProposal(game: GameState, floor: number, drawing: Drawing, kind: RoomType): Drawing {
  const place = proposeRoom(game, floor, kind);
  return { ...drawing, kind, rect: place ? { x: place.x, y: place.y, w: place.w, h: place.h } : null, door: place?.door ?? null, proposed: place !== null };
}

const SIDES = [
  ['North', 'y', -1],
  ['South', 'h', 1],
  ['West', 'x', -1],
  ['East', 'w', 1],
] as const;

/**
 * Drawing a room: a new one, or one that exists and gets another shape. The
 * rectangle is dragged on the floor and the door is clicked into one of its
 * walls; here the kind is picked, the walls can be moved a tile at a time,
 * and the cost stands beside the button that builds it.
 */
function BuildPanel({ game, floor, drawing }: { game: GameState; floor: number; drawing: Drawing }) {
  const run = useGameStore((s) => s.run);
  const { draw, selectRoom } = useOfficeView.getState();
  const room = drawing.roomId ? findRoom(game, drawing.roomId) : undefined;
  const { rect, door, kind } = drawing;
  const taken = !room && kind ? kindError(game, kind) : null;
  const error = taken ?? (rect ? roomError(game, { floor, ...rect, door }, drawing.roomId ?? undefined) : null);
  const cost = rect ? (room ? reshapeCost(room, rect) : buildCost(rect)) : 0;
  const proposal = kind && !room ? proposeRoom(game, floor, kind) : null;
  const why = !room && !kind ? 'Choose what kind of room it is.' : taken ? taken : !rect ? 'Drag its outline on the floor first.' : error ?? (!door ? 'Click one of its walls for the door.' : game.money < cost ? `Not enough money (${formatMoney(cost)} needed).` : null);
  /** The size the game would give a room of this kind: what it needs fits in that. */
  const usual = kind ? ROOM_SIZES[kind] : null;
  const small = usual && rect ? Math.min(rect.w, rect.h) < Math.min(usual.w, usual.h) || Math.max(rect.w, rect.h) < Math.max(usual.w, usual.h) : false;
  const needs = kind ? (Object.entries(STUDIO_REQUIREMENTS[kind] ?? {}) as [FurnitureType, number][]) : [];
  const made = kind ? GENRES.filter((g) => g.studio === kind).map((g) => g.name) : [];
  /** Picking a kind puts its usual outline on the floor at once, unless the player has drawn one of their own. */
  const pick = (type: RoomType) => draw(rect && !drawing.proposed ? { ...drawing, kind: type } : withProposal(game, floor, drawing, type));

  /** Moves one wall a tile: the north and west walls take the corner of the rectangle with them. */
  const move = (side: (typeof SIDES)[number], outwards: boolean) => {
    if (!rect) return;
    const [, key, sign] = side;
    const by = outwards ? 1 : -1;
    const next = key === 'y' ? { ...rect, y: rect.y - by, h: rect.h + by } : key === 'x' ? { ...rect, x: rect.x - by, w: rect.w + by } : { ...rect, [key]: rect[key] + by * sign };
    if (next.w >= 1 && next.h >= 1) draw(withRect(game, floor, drawing, next));
  };
  const build = () => {
    if (!rect || !door) return;
    const done = room ? run((s) => reshapeRoom(s, room.roomId, { ...rect, door })) : kind ? run((s) => buildRoom(s, { floor, ...rect, door, type: kind })) : false;
    if (!done) return;
    play('woodHeavy');
    draw(null);
    selectRoom(typeof done === 'string' ? done : (room?.roomId ?? null));
  };

  return (
    <Panel
      title={room ? `Change ${room.name}` : 'Build a room'}
      className="room-panel build-panel"
      help="office"
      actions={
        <button className="icon-button" onClick={() => draw(null)} aria-label="Close" title="Stop (Esc)">
          <Icon name="close-button" size={20} />
        </button>
      }
    >
      {!room && (
        <>
          <h3>1 · What kind of room</h3>
          <RoomKinds value={kind} onChange={pick} locked={(type) => kindError(game, type)} />
          {kind && usual && (
            <div className="kind-card">
              <strong>{ROOM_TYPE_NAMES[kind]}</strong>
              <span className="small">{ROOM_TYPE_NOTES[kind]}{made.length > 0 && ` Made here: ${made.join(', ')}.`}</span>
              <dl className="facts">
                <dt>Usual size</dt>
                <dd>{usual.w} × {usual.h} tiles</dd>
                {needs.length > 0 && (
                  <>
                    <dt>It needs</dt>
                    <dd>{needs.map(([type, n]) => `${n} × ${inText(FURNITURE[type].name)}`).join(', ')}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
        </>
      )}
      <h3>{room ? '1' : '2'} · Where and how large</h3>
      <p className="muted small">
        {room
          ? 'Drag a rectangle on the floor for its new outline.'
          : rect && drawing.proposed
            ? 'Its outline is on the floor, at the usual size. For another place or size, drag a rectangle of your own.'
            : 'Drag a rectangle on the floor, from one corner to the opposite one.'}{' '}
        At least {ROOM_MIN} by {ROOM_MIN} tiles; the floor you leave open is corridor.
      </p>
      {kind && !room && !proposal && !rect && <p className="muted small">There is no free place left for one of the usual size in the two rows along the hall: draw it yourself.</p>}
      {rect && (
        <div className="wall-moves" role="group" aria-label="Move a wall by one tile">
          <span className="muted small">Move a wall by a tile:</span>
          {SIDES.map((side) => (
            <span key={side[0]} className="wall-move">
              {side[0]}
              <button onClick={() => move(side, false)} aria-label={`${side[0]} wall one tile in`} title="One tile in">−</button>
              <button onClick={() => move(side, true)} aria-label={`${side[0]} wall one tile out`} title="One tile out">+</button>
            </span>
          ))}
        </div>
      )}
      <h3>{room ? '2' : '3'} · The door</h3>
      <p className="muted small">
        {rect && door ? 'The yellow dot is the door. Click another place in a wall to move it there.' : 'Once the outline is there, click one of its walls. The door has to open onto the corridor.'}
      </p>

      {/* What it costs, what is still in the way and the button that builds stay in sight, however long the panel is. */}
      <div className="build-actions">
      {why && (
        <p className="build-why" role="status">
          {taken && <Icon name="locked" size={16} />}
          <span>{why}</span>
        </p>
      )}
      <dl className="facts">
        {rect && (
          <>
            <dt>Size</dt>
            <dd>
              {rect.w} × {rect.h} tiles
              {usual && !room && (usual.w !== rect.w || usual.h !== rect.h) && <span className="muted"> · usual {usual.w} × {usual.h}</span>}
            </dd>
          </>
        )}
        <dt>{room ? 'Rebuilding' : 'Building'}</dt>
        <dd>{rect ? `${formatMoney(cost)} once` : `${formatMoney(BUILD_COST_PER_TILE)} a tile, once`}</dd>
        <dt>Rent</dt>
        <dd>{rect ? `${formatMoney(monthlyRent(rect, game))} / month` : `${formatMoney(rentPerTile(game))} a tile each month`}</dd>
      </dl>
      {small && !room && !why && <p className="small"><Tag tone="warning">Smaller than usual: what it needs may not fit</Tag></p>}
      {room && rect && cost === 0 && rect.w * rect.h < room.w * room.h && <p className="muted small">Floor the room gives up brings nothing back.</p>}
      <div className="row">
        <button className="primary" data-guide="build-confirm" data-sound="none" disabled={why !== null} title={why ?? undefined} onClick={build}>
          {room ? (cost > 0 ? `Rebuild for ${formatMoney(cost)}` : 'Rebuild') : `Build for ${formatMoney(cost)}`}
        </button>
        {!room && (
          <button data-guide="propose-room" disabled={!proposal || (drawing.proposed && rect !== null)} title={!kind ? 'Choose a kind of room first' : !proposal ? 'No free place of the usual size is left along the hall' : 'Back to the place and the usual size the game proposes for this kind of room'} onClick={() => kind && draw(withProposal(game, floor, drawing, kind))}>
            Propose a place
          </button>
        )}
        <button className="link" onClick={() => draw(null)}>Cancel</button>
      </div>
      </div>
    </Panel>
  );
}

/** A room's name, with a pencil to give it another. */
function RoomName({ roomId, name }: { roomId: string; name: string }) {
  const run = useGameStore((s) => s.run);
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return (
      <span className="room-name">
        {name}{' '}
        <button className="icon-button" data-guide="rename-room" onClick={() => setDraft(name)} aria-label="Give the room another name" title="Give the room another name">
          <Icon name="edit" size={12} />
        </button>
      </span>
    );
  }
  return (
    <form
      className="room-name"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim() === name || run((s) => renameRoom(s, roomId, draft))) setDraft(null);
      }}
    >
      <input autoFocus value={draft} maxLength={NAME_LENGTH} aria-label="Name of the room" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setDraft(null))} />
      <button className="primary" type="submit">Save</button>
    </form>
  );
}

/** Who works at a desk, in its small window, with the way to give it to someone. */
function WorksHere({ game, item }: { game: GameState; item: Furniture }) {
  const { seat } = useOfficeView.getState();
  const sitter = game.employees.find((e) => e.id === deskHolders(game).get(item.id));
  const owner = ownerOf(game, item.id);
  return (
    <div className="small works-here">
      <span>
        {sitter ? <strong>{sitter.name}</strong> : owner ? <strong>{owner.name}</strong> : 'Nobody'} {sitter ? 'works here' : owner ? 'has this place' : 'works here'}
        <span className="muted"> · {owner ? (owner === sitter ? 'their own place' : 'their own, but they sit elsewhere while it is broken') : sitter ? 'for now' : 'free'}</span>
      </span>
      <button onClick={() => seat(item.id)} title="Choose in the room’s panel who gets this place">{owner ? 'Change' : 'Give to…'}</button>
    </div>
  );
}

/**
 * The small window of a piece of furniture that was picked in the office: what
 * it is, what it still brings, and what can be done with it. The office keeps
 * it beside the piece.
 */
function PieceWindow({ game, room, item }: { game: GameState; room: RentedRoom; item: Furniture }) {
  const run = useGameStore((s) => s.run);
  const { selectFurniture, move } = useOfficeView.getState();
  const el = useRef<HTMLDivElement>(null);
  // Opened from the room's panel with the keyboard: the keys go on in this window.
  useEffect(() => {
    if (document.activeElement?.closest('.office-side')) el.current?.focus({ preventScroll: true });
  }, []);
  const spec = FURNITURE[item.type];
  const pieces = room.furniture;
  const at = pieces.indexOf(item);
  const step = (by: number) => selectFurniture(pieces[(at + by + pieces.length) % pieces.length]!.id);
  const age = game.day - item.boughtOn;
  const fresh = age <= FURNITURE_WORTH.graceDays;

  return (
    <div ref={el} className="piece-window" role="dialog" aria-label={spec.name} tabIndex={-1}>
      <div className="piece-title">
        <strong>
          {spec.name}
          {spec.line && ` · tier ${item.tier}`}
        </strong>
        {pieces.length > 1 && (
          <span className="piece-steps">
            <button onClick={() => step(-1)} aria-label="The piece before this one" title="The piece before this one">‹</button>
            <span className="muted small">{at + 1}/{pieces.length}</span>
            <button onClick={() => step(1)} aria-label="The next piece" title="The next piece">›</button>
          </span>
        )}
      </div>
      {wearsOut(item.type) && (
        <div className="small">
          Condition <Meter value={item.condition / 100} tone="green" label={`Condition ${Math.round(item.condition)}%`} /> {Math.round(item.condition)}%{' '}
          {isBroken(item) && <Tag tone="danger">Broken</Tag>}
        </div>
      )}
      {isWorkplace(room, item) && <WorksHere game={game} item={item} />}
      <p className="muted small">
        {fresh
          ? `New: it gives its whole price back until ${formatDate(item.boughtOn + FURNITURE_WORTH.graceDays)}.`
          : `Second-hand: worth ${formatPercent(worthAt(age))} of its price${wearsOut(item.type) && item.condition < 100 ? ', less its wear' : ''}.`}
      </p>
      <div className="row">
        <button
          data-sound="none"
          aria-label={`Sell it for ${formatMoney(resaleValue(item, game.day))}`}
          title="Sell it"
          onClick={() => {
            if (!run((s) => sellFurniture(s, room.roomId, item.id))) return;
            play('sell');
            selectFurniture(null);
          }}
        >
          <Icon name="sell" size={14} /> {formatMoney(resaleValue(item, game.day))}
        </button>
        <button className="icon-only" data-sound="none" onClick={() => run((s) => rotateFurniture(s, room.roomId, item.id)) && play('turn')} aria-label="Turn it a quarter" title="Turn it a quarter (R)"><Icon name="turn" size={16} /></button>
        <button className="icon-only" onClick={() => move({ roomId: room.roomId, furnitureId: item.id, turn: item.turn })} aria-label="Move it" title="Move it: pick it up and put it down somewhere else"><Icon name="move" size={16} /></button>
        <button className="link" onClick={() => selectFurniture(null)} title="Close (Esc)">Cancel</button>
      </div>
    </div>
  );
}

/**
 * The workplaces of an office or a management office: how many are taken, who
 * works at each, and whose own place it is. A place is given to someone from
 * the list that opens under it; the places that are nobody's can go to a
 * whole job at once, so that a department gets the room to itself.
 */
function Workplaces({ game, room, onShow }: { game: GameState; room: RentedRoom; onShow: (furnitureId: Id) => void }) {
  const run = useGameStore((s) => s.run);
  const seating = useOfficeView((s) => s.seating);
  const { seat } = useOfficeView.getState();
  const places = workplacesIn(room);
  const holders = deskHolders(game);
  const words = WORKPLACE_WORDS[room.type!] ?? WORKPLACE_WORDS.office!;
  const piece = words.piece;
  const taken = places.filter((item) => holders.has(item.id)).length;
  /** Everyone who works at this kind of desk, by job and then by name. */
  const people = game.employees.filter((e) => needsDesk(e.role) && deskFor(e.role) === piece).sort((a, b) => jobOf(a).localeCompare(jobOf(b)) || a.name.localeCompare(b.name));
  const open = places.some((item) => !ownerOf(game, item.id));
  /** The jobs that have people without a place of their own, with how many. */
  const jobs = [...new Set(people.map((e) => e.role))].map((role) => ({ role, waiting: people.filter((e) => e.role === role && !ownDesk(game, e)).length })).filter((job) => job.waiting > 0);
  // The place whose list is open is brought into view, with the list under it.
  const row = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (seating) row.current?.scrollIntoView({ block: 'nearest' });
  }, [seating]);

  return (
    <div className="workplaces">
      <h3>
        Workplaces <span className="muted small">{places.length === 0 ? 'none yet' : `${taken} of ${places.length} taken`}</span>
      </h3>
      {places.length === 0 ? (
        <p className="muted small">Every {FURNITURE[piece].name.toLowerCase()} in this room is a workplace for one {words.one}.</p>
      ) : (
        <ol>
          {places.map((item, n) => {
            const sitter = game.employees.find((e) => e.id === holders.get(item.id));
            const owner = ownerOf(game, item.id);
            return (
              <li key={item.id} ref={seating === item.id ? row : undefined}>
                <div className="workplace">
                  <button className="place-number" onClick={() => onShow(item.id)} title="Show this desk in the office" aria-label={`Workplace ${n + 1}: show it in the office`}>{n + 1}</button>
                  <span className="place-who">
                    {sitter ? <strong>{sitter.name}</strong> : owner ? <strong>{owner.name}</strong> : <span className="muted">Free</span>}
                    {(sitter ?? owner) && <span className="muted small"> · {jobOf((sitter ?? owner)!)}</span>}
                    <span className="muted small place-note">
                      {isBroken(item) ? (owner ? 'Their own place, but it is broken' : 'Broken') : owner && owner === sitter ? 'Their own place' : null}
                    </span>
                  </span>
                  <button className={seating === item.id ? 'active' : undefined} aria-expanded={seating === item.id} onClick={() => seat(seating === item.id ? null : item.id)}>
                    {owner ? 'Change' : 'Give to…'}
                  </button>
                </div>
                {seating === item.id && (
                  <div className="seat-picker" role="group" aria-label={`Who gets workplace ${n + 1}`}>
                    {people.length === 0 && <p className="muted small">You have no {words.many} yet.</p>}
                    {people.map((e) => {
                      const own = ownDesk(game, e);
                      const has = employeesWithDesk(game).get(e.id);
                      return (
                        <button key={e.id} className={owner === e ? 'active' : undefined} aria-pressed={owner === e} onClick={() => run((s) => assignDesk(s, e.id, item.id)) && seat(null)}>
                          <Avatar name={e.name} size={28} />
                          <span>
                            <strong>{e.name}</strong>
                            <span className="muted small"> · {jobOf(e)}</span>
                            <span className="muted small place-note">{own ? (own.item.id === item.id ? 'This is their own place' : `Own place in ${own.room.name}`) : has ? `Now in ${roomName(game, has.roomId)}` : 'Has no desk at all'}</span>
                          </span>
                        </button>
                      );
                    })}
                    {owner && (
                      <button onClick={() => run((s) => assignDesk(s, owner.id, null)) && seat(null)}>
                        <span>
                          <strong>Nobody</strong>
                          <span className="muted small place-note">Whoever needs a desk takes it</span>
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {open && jobs.length > 0 && (
        <div className="seat-groups">
          <span className="muted small">Give the places that are nobody’s own to:</span>
          {jobs.map(({ role, waiting }) => (
            <button key={role} onClick={() => run((s) => seatGroup(s, room.roomId, role))} title={`${waiting} without a place of their own`}>
              {ROLE_TITLES[role]} ({waiting})
            </button>
          ))}
        </div>
      )}
      {places.length > 0 && <p className="muted small">Whoever has no place of their own takes a desk that is free, the newest first, and may be moved when others come or go. A room’s comfort and cleanliness count for whoever works in it.</p>}
    </div>
  );
}

/** The rooms that have workplaces, with the piece that is one and who works there. */
const WORKPLACE_WORDS: Partial<Record<RoomType, { piece: FurnitureType; one: string; many: string }>> = {
  office: { piece: 'workstation', one: 'member of the office staff', many: 'office staff' },
  managementOffice: { piece: 'managerDesk', one: 'manager', many: 'managers' },
  writersRoom: { piece: 'writingDesk', one: 'writer', many: 'writers' },
  editingRoom: { piece: 'editingDesk', one: 'video editor', many: 'video editors' },
  audioRoom: { piece: 'audioDesk', one: 'audio engineer', many: 'audio engineers' },
  canteen: { piece: 'stove', one: 'cook', many: 'cooks' },
  postRoom: { piece: 'sortingCase', one: 'clerk', many: 'post room clerks' },
};

/** Where each cable goes, in words (0.16.0), beside the cables drawn in the office. */
function CableLegend({ game }: { game: GameState }) {
  const list = cablesOf(game, (channel) => channelOffAirReason(game, channel) === null);
  const end = { mcr: 'master control', antenna: 'antenna', dish: 'dish' } as const;
  const state = { live: 'on the air', idle: 'nothing on it', cut: 'cut off' } as const;
  return (
    <div className="cable-legend" role="status">
      <strong>Cables</strong>
      {list.length === 0 ? (
        <span className="small muted">None yet: every studio gets one, to the master control room, and from there one goes up to the antenna.</span>
      ) : (
        <ul className="small">
          {list.map((cable) => (
            <li key={`${cable.from}-${cable.to}`} className={`cable-${cable.status}`}>
              {roomName(game, cable.from)} → {end[cable.to]} · {state[cable.status]}
            </li>
          ))}
        </ul>
      )}
      <span className="small muted">Green: on the air. Red: can’t go out. Grey: nothing on it.</span>
    </div>
  );
}

function RoomPanel({ roomId, room, placing, onPlace, onCatalog, onSelectFurniture, onClose }: {
  roomId: string;
  room: RentedRoom | undefined;
  placing: FurnitureType | null;
  onPlace: (type: FurnitureType | null) => void;
  /** Opens the furniture catalog at a room type. */
  onCatalog: (tab: RoomType) => void;
  /** Opens the small window of a piece, for those who can't click it in the office. */
  onSelectFurniture: (id: Id) => void;
  onClose: () => void;
}) {
  const run = useGameStore((s) => s.run);
  const game = useGame();
  const layout = roomLayout(game, roomId);
  // A room that is gone, in a game that was loaded while its panel stood open: nothing to show.
  if (!layout) return null;
  const rent = monthlyRent(layout, game);
  const close = (
    <button className="icon-button" onClick={onClose} aria-label="Close" title="Close">
      <Icon name="close-button" size={20} />
    </button>
  );

  if (!room) return null;

  const options = (Object.keys(FURNITURE) as FurnitureType[]).filter((t) => room.type && FURNITURE[t].rooms.includes(room.type) && !FURNITURE[t].retired);
  /** The room's own furniture, and the desk it uses in a control room next door. */
  const kit = studioKit(game, room);
  const desks = borrowedDesks(game);
  const lent = desks.get(roomId);
  const nextDoor = adjacentRooms(game, roomId).map((r) => r.name);
  const requirements = checklist(room);
  /** What the checklist still asks for. */
  const missing = requirements.filter(([type, count]) => countOf(kit, type) < count);
  const comfort = roomComfort(room);
  /** A TV studio's own control room (0.16.0), and whether a piece is one that stands there. */
  const control = isTvStudio(room.type) ? controlRoomOf(game, roomId) : undefined;
  const tvKit = (type: FurnitureType) => isTvStudio(room.type) && CONTROL_ROOM_KIT.includes(type);
  const crew = crewing(game);
  const outdated = outdatedItems(game, room);
  const level = equipmentLevel(game, room, toCalendarDate(game.day).year);
  const tiered = kit.some((f) => FURNITURE[f.type].line);

  return (
    <Panel title={layout.name} className="room-panel" help={room.type && isStudioType(room.type) ? 'studios' : room.type === 'canteen' || room.type === 'meetingRoom' || room.type === 'postRoom' ? 'morale' : room.type === 'audioRoom' ? 'writers' : room.type === 'library' ? 'content-market' : room.type === 'managementOffice' ? 'managers' : 'office'} actions={close}>
      <dl className="facts">
        <dt>Rent</dt>
        <dd>{layout.fixed ? 'Comes with the building' : `${formatMoney(rent)} / month`}</dd>
        {!layout.fixed && (
          <>
            <dt>Name</dt>
            <dd><RoomName key={`${roomId}:${room.name}`} roomId={roomId} name={room.name} /></dd>
          </>
        )}
        <dt>Kind</dt>
        <dd>{room.type ? ROOM_TYPE_NAMES[room.type] : 'Not chosen yet'}</dd>
        <dt>Size</dt>
        <dd>{layout.w} × {layout.h} tiles</dd>
        <dt>Cleanliness</dt>
        <dd>
          <Meter value={room.cleanliness / 100} tone="green" label={`Cleanliness ${Math.round(room.cleanliness)}%`} /> {Math.round(room.cleanliness)}%
          {room.cleanliness < CLEANLINESS.cleanEnough && <span className="muted small"> · work and morale suffer</span>}
        </dd>
        {room.type === 'canteen' && (
          <>
            <dt>Seats</dt>
            <dd>{Math.floor(canteenSeats(room))} for {game.employees.length} staff</dd>
            <dt>Hot meals</dt>
            <dd>{hotMealsText(game)}</dd>
          </>
        )}
        {room.type === 'meetingRoom' && (
          <>
            <dt>Seats</dt>
            <dd>{meetingSeats(room)}</dd>
            <dt>Today</dt>
            <dd>{meetingsToday(game)}</dd>
          </>
        )}
        {room.type === 'postRoom' && (
          <>
            <dt>Post</dt>
            <dd>{postText(game)}</dd>
          </>
        )}
        {room.type === 'audioRoom' && (
          <>
            <dt>Looks after</dt>
            <dd>{engineeringText(game)}</dd>
          </>
        )}
      </dl>

      {room.furniture.length === 0 && !layout.fixed && (
        <details className="change-kind" open={!room.type}>
          <summary>{room.type ? 'Make it another kind of room' : 'Choose what kind of room it is'}</summary>
          <RoomKinds value={room.type} onChange={(type) => run((s) => setRoomType(s, roomId, type))} />
        </details>
      )}

      {room.issue && (
        <p>
          <Tag tone="warning">The {room.issue.kind} has failed</Tag>{' '}
          <span className="muted small">Morale here suffers until maintenance staff fix it.</span>
        </p>
      )}

      {room.type && WORKPLACE_WORDS[room.type] && (room.type !== 'canteen' || room.furniture.some((f) => f.type === 'stove')) && <Workplaces game={game} room={room} onShow={onSelectFurniture} />}
      {room.type === 'ceoOffice' && (
        <p className="muted small">
          {room.furniture.some((f) => f.type === 'ceoDesk') ? `This is your own office, ${game.playerName}: you work at the desk here.` : 'This is your own office. With a CEO’s desk in it, you work here instead of standing in the hall.'}
        </p>
      )}

      {requirements.length > 0 && (
        <div className="requirements">
          <h3>{room.type && isStudioType(room.type) ? 'Studio checklist' : 'Checklist'}</h3>
          <ul>
            {requirements.map(([type, count]) => {
              const have = countOf(kit, type);
              return (
                <li key={type} className={have >= count ? 'done' : undefined}>
                  <span className="check" aria-hidden="true">{have >= count && <Icon name="check" size={9} />}</span>
                  <span>
                    {FURNITURE[type].name} {have}/{count}
                    {have < count && saleBlocker(game, type) && <span className="muted small"> · {saleBlocker(game, type)}</span>}
                    {lent?.item.type === type && <span className="muted small"> · in {roomName(game, lent.roomId)} next door</span>}
                    {tvKit(type) && <span className="muted small"> · {control ? `in ${control.name} next door` : 'in a control room next door'}</span>}
                  </span>
                  {have < count && (
                    <button
                      className={placing === type ? 'primary active' : 'primary'}
                      data-guide={`place-${type}`}
                      aria-pressed={placing === type}
                      disabled={saleBlocker(game, type) !== null || (tvKit(type) && !control)}
                      title={saleBlocker(game, type) ?? (tvKit(type) && !control ? 'Build a control room wall to wall with this studio first' : `${formatMoney(furniturePrice(type, purchaseTier(game, type)))}: you pick the spot ${tvKit(type) ? `in ${control!.name}` : 'in the room'}`)}
                      onClick={() => onPlace(placing === type ? null : type)}
                    >
                      Place
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {missing.length === 0 && <Tag tone="good">{room.type && isStudioType(room.type) ? 'Ready to broadcast' : 'Ready to use'}</Tag>}
          {room.type === 'radioTalkStudio' && !requirements.some(([type]) => type === 'talkTable') && (
            <p className="muted small">The mixing desk here seats the guests, so this studio needs no talk table.</p>
          )}
          {room.type === 'toilets' && (
            <p className="muted small">People on this floor come here instead of going down the stairs, and those who work on this floor are a little happier ({hasToilets(game, layout.floor) ? `+${COMFORT.toilets} morale` : `+${COMFORT.toilets} morale once complete`}).</p>
          )}
          {isTvStudio(room.type) && !control && (
            <p className="muted small">
              A TV studio has a control room of its own, wall to wall with it, for its control desk and its audio mixer: build one and choose “Control room”; the game proposes the place beside the studio.
              {nextDoor.length > 0 ? ` Next door now: ${either(nextDoor)}.` : ''}
            </p>
          )}
          {control && crewPosts(game).some((p) => p.key === roomId) && (
            <p className="muted small">
              {crew.posts.has(roomId)
                ? `${game.employees.find((e) => e.id === crew.posts.get(roomId))?.name ?? 'A technician'} works its control room while its shows are on.`
                : `Nobody works its control room: its shows go out at ${Math.round(CONTROL_ROOM.unmanned * 100)}% of the studio’s level. A technician works two control rooms, after the master control room.`}
            </p>
          )}
          {missing.some(([type]) => REMOTE_DESKS.includes(type)) && (
            <p className="muted small">
              The {FURNITURE[missing.find(([type]) => REMOTE_DESKS.includes(type))![0]].name.toLowerCase()} can also stand in a control room next door
              {nextDoor.length > 0 ? ` (${either(nextDoor)})` : ': a room built wall to wall with this one'}.
            </p>
          )}
          {lent && <p className="muted small">With its desk in a control room, this studio works {Math.round((CONTROL_ROOM.studioLevel - 1) * 100)}% better.</p>}
          {kit.some(isBroken) && room.type && isStudioType(room.type) && (
            <p><Tag tone="danger">Broken equipment halves this studio’s level</Tag></p>
          )}
          {tiered && room.type !== 'office' && (
            <p className="muted small">
              Equipment level {Math.round(level * 100)}%
              {level < 1 ? ': older than what rivals use now, which lowers show quality.' : level > 1 ? ': ahead of its time.' : '.'}
            </p>
          )}
        </div>
      )}

      {room.type === 'controlRoom' && (
        <div className="requirements">
          <h3>Serves</h3>
          {(() => {
            const studio = [...tvControlRooms(game)].find(([, c]) => c.roomId === roomId)?.[0];
            if (!studio) return null;
            const kit = CONTROL_ROOM_KIT.map((type) => `${FURNITURE[type].name.toLowerCase()} ${countOf(room.furniture, type) > 0 ? '✓' : 'missing'}`).join(', ');
            return (
              <p className="small">
                The control room of {roomName(game, studio)}: {kit}.{' '}
                {crew.posts.has(studio) ? `${game.employees.find((e) => e.id === crew.posts.get(studio))?.name ?? 'A technician'} works it.` : crewPosts(game).some((p) => p.key === studio) ? 'Nobody works it: hire a technician.' : 'A technician works it once the studio has a show on the schedule.'}
              </p>
            );
          })()}
          {room.furniture.length === 0 ? (
            <p className="muted small">
              Beside a TV studio, place a control desk and an audio mixer here. Beside a radio studio, a mixing desk: a radio studio next door that has none of its own uses it, and works{' '}
              {Math.round((CONTROL_ROOM.studioLevel - 1) * 100)}% better for it.
            </p>
          ) : (
            <ul>
              {room.furniture.filter((desk) => desk.type === 'mixingDesk').map((desk) => {
                const studio = [...desks].find(([, d]) => d.item.id === desk.id)?.[0];
                const type = studio ? findRoom(game, studio)?.type : undefined;
                return (
                  <li key={desk.id} className={studio ? 'done' : undefined}>
                    <span className="check" aria-hidden="true">{studio && <Icon name="check" size={9} />}</span>
                    {FURNITURE[desk.type].name}: {studio ? `${roomName(game, studio)}${type ? ` (${inText(ROOM_TYPE_NAMES[type])})` : ''}` : 'no studio next door needs it'}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="muted small">{nextDoor.length > 0 ? `Next door: ${nextDoor.join(' and ')}.` : 'No room stands wall to wall with this one yet.'} Each desk serves one studio.</p>
        </div>
      )}

      {room.type === 'masterControl' && (
        <div className="requirements">
          <h3>Sends out</h3>
          {(() => {
            const through = game.channels.filter((c) => throughMasterControl(game, c));
            const working = masterControlRoom(game)?.roomId === roomId;
            if (!needsMasterControl(game)) return <p className="muted small">Every channel goes out through here, once it has a license.</p>;
            return (
              <p className="small">
                {working ? `${through.map((c) => c.name).join(', ')}.` : 'Nothing yet: it needs everything on its checklist.'}{' '}
                {working && (crew.posts.has('mcr') ? `${game.employees.find((e) => e.id === crew.posts.get('mcr'))?.name ?? 'A technician'} works its desk.` : 'Nobody works its desk: hire a technician, or those channels stay off the air.')}
              </p>
            );
          })()}
        </div>
      )}

      {outdated.length > 0 && (
        <div className="row">
          <button className="primary" data-sound="none" onClick={() => run((s) => upgradeEquipment(s, roomId)) && play(PLACE_SOUND[outdated[0]!.type])}>
            Upgrade {outdated.length} item{outdated.length === 1 ? '' : 's'} · {formatMoney(upgradeCost(game, roomId))}
          </button>
          <span className="muted small">Old equipment is sold at half price.</span>
        </div>
      )}

      {room.furniture.some((f) => FURNITURE[f.type].comfort) && (
        <p className="muted small">
          Comfort +{comfort} morale{room.type === 'canteen' ? ' for everyone the canteen has a seat for' : room.type === 'reception' ? ': none, nobody works here' : ' for the people who work here'}
          {room.type !== 'reception' && ` (${COMFORT.maxPieces} pieces count at most).`}
        </p>
      )}

      {options.length > 0 && room.type && (
        <div className="furniture-shop">
          <h3>Furniture</h3>
          {room.furniture.length > 0 && (
            <p className="muted small">
              {plural(room.furniture.length, 'piece')} here. Click one in the office to sell, turn or move it.{' '}
              <button className="link" onClick={() => onSelectFurniture(room.furniture[0]!.id)}>Go through them</button>
            </p>
          )}
          <ul>
            {options.map((type) => (
              <li key={type}>
                <div>
                  <div>{FURNITURE[type].name}</div>
                  <div className="muted small">{formatMoney(furniturePrice(type, purchaseTier(game, type)))}</div>
                </div>
                {saleBlocker(game, type) ? (
                  <span className="muted small locked-piece" title={saleBlocker(game, type) ?? undefined}>
                    <Icon name="locked" size={16} label="Locked" /> {saleBlocker(game, type)}
                  </span>
                ) : (
                  <button className={placing === type ? 'active' : undefined} data-guide={`add-${type}`} aria-pressed={placing === type} onClick={() => onPlace(placing === type ? null : type)}>
                    Place
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button onClick={() => room.type && onCatalog(room.type)}>Look them up under Rooms</button>
        </div>
      )}

      {!layout.fixed && (
        <div className="row">
          <button data-guide="reshape-room" onClick={() => useOfficeView.getState().draw({ roomId, kind: room.type, rect: { x: room.x, y: room.y, w: room.w, h: room.h }, door: room.door })} title="Make it larger or smaller, or move its door">
            Change its shape or door
          </button>
          <button
            className="link danger"
            onClick={() => run((s) => releaseRoom(s, roomId)) && onClose()}
            disabled={room.furniture.length > 0}
            title={room.furniture.length > 0 ? 'Sell the furniture first' : 'Its walls go and the floor is corridor again; what it cost to build does not come back'}
          >
            Take this room away
          </button>
        </div>
      )}
    </Panel>
  );
}
