// The panel for building, reshaping and removing a room.

import { BUILD_COST_PER_TILE } from '../../../config/balance';
import { FURNITURE, ROOM_MIN_LONG, ROOM_MIN_SHORT, ROOM_SIZES, ROOM_TYPE_NAMES, ROOM_TYPE_NOTES, STUDIO_REQUIREMENTS, inText, type FurnitureType, type RoomType } from '../../../config/office';
import { GENRES } from '../../../config/genres';
import { buildRoom, reshapeRoom } from '../../../sim/actions';
import { buildCost, kindError, proposeDoor, proposeRoom, reshapeCost, roomError } from '../../../sim/rooms';
import { findRoom, monthlyRent, rentPerTile } from '../../../sim/office';
import type { GameState } from '../../../sim/state';
import { Panel, Tag } from '../../components';
import { Icon } from '../../Icon';
import { formatMoney } from '../../format';
import { play } from '../../../audio/player';
import { useOfficeView, type Drawing } from '../../officeView';
import { RoomKinds } from '../../RoomKinds';
import { useGameStore } from '../../store';

/**
 * What is being drawn with another rectangle: the door stays where it is if
 * it can, and otherwise the game proposes one, which can then be moved.
 */
export function withRect(game: GameState, floor: number, drawing: Drawing, rect: NonNullable<Drawing['rect']>): Drawing {
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
export function BuildPanel({ game, floor, drawing }: { game: GameState; floor: number; drawing: Drawing }) {
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
        At least {ROOM_MIN_SHORT} by {ROOM_MIN_LONG} tiles; the floor you leave open is corridor.
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
