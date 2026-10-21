// The panel of the selected room, with its pieces and who works there.

import { useEffect, useRef, useState } from 'react';
import { CLEANLINESS, FURNITURE_WORTH } from '../../../config/balance';
import { CONTROL_ROOM_KIT, FURNITURE, REMOTE_DESKS, ROOM_TYPE_NAMES, inText, isStudioType, type FurnitureType, type RoomType } from '../../../config/office';
import { NAME_LENGTH } from '../../../sim/newGame';
import { COMFORT, CONTROL_ROOM } from '../../../config/balance';
import { assignDesk, releaseRoom, renameRoom, rotateFurniture, seatGroup, sellFurniture, setRoomType, storeFurniture, upgradeCost, upgradeEquipment } from '../../../sim/actions';
import { cables as cablesOf, crewing, crewPosts, masterControlRoom, needsMasterControl, throughMasterControl } from '../../../sim/control';
import { adjacentRooms, borrowedDesks, controlRoomOf, countOf, isTvStudio, tvControlRooms, deskFor, deskHolders, employeesWithDesk, isWorkplace, ownDesk, ownerOf, workplacesIn, findRoom, isBroken, monthlyRent, needsDesk, requirements as checklist, roomLayout, roomName, studioKit, wearsOut } from '../../../sim/office';
import type { Furniture, GameState, Id, RentedRoom } from '../../../sim/state';
import { formatDate, toCalendarDate } from '../../../sim/calendar';
import { equipmentLevel, furniturePrice, outdatedItems, purchaseTier, resaleValue, saleBlocker, worthAt } from '../../../sim/tech';
import { canteenSeats, hasToilets, roomComfort } from '../../../sim/upkeep';
import { channelOffAirReason } from '../../../sim/broadcast';
import { meetingSeats } from '../../../sim/morale';
import { Avatar } from '../../Avatar';
import { Meter, Panel, Tag } from '../../components';
import { Icon } from '../../Icon';
import { formatMoney, formatPercent } from '../../format';
import { play } from '../../../audio/player';
import { PLACE_SOUND } from '../../../audio/sounds';
import { useOfficeView } from '../../officeView';
import { RoomKinds } from '../../RoomKinds';
import { useGame, useGameStore } from '../../store';
import { ROLE_TITLES, jobOf } from './people';
import { either, plural } from './shared';
import { WorkshopCourses, engineeringText, hotMealsText, meetingsToday, postText, schedulingText, securityText } from './summaries';

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
export function PieceWindow({ game, room, item }: { game: GameState; room: RentedRoom; item: Furniture }) {
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
        <button className="icon-only" onClick={() => move({ roomId: room.roomId, furnitureId: item.id, turn: item.turn })} aria-label="Move it" title="Move it: pick it up and put it down somewhere else, on this floor or another"><Icon name="move" size={16} /></button>
        <button
          className="icon-only"
          data-sound="none"
          aria-label="Store it"
          title="Store it: put it away for free, to place in any room that takes it later"
          onClick={() => {
            if (!run((s) => storeFurniture(s, room.roomId, item.id))) return;
            play(PLACE_SOUND[item.type]);
            selectFurniture(null);
          }}
        >
          <Icon name="store" size={16} />
        </button>
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
  musicSchedulingOffice: { piece: 'schedulingDesk', one: 'music scheduler', many: 'music schedulers' },
  canteen: { piece: 'stove', one: 'cook', many: 'cooks' },
  postRoom: { piece: 'sortingCase', one: 'clerk', many: 'post room clerks' },
  workshop: { piece: 'trainerDesk', one: 'talent manager', many: 'talent managers' },
  securityRoom: { piece: 'securityDesk', one: 'guard', many: 'guards' },
};

/** Where each cable goes, in words (0.16.0), beside the cables drawn in the office. */
export function CableLegend({ game }: { game: GameState }) {
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

export function RoomPanel({ roomId, room, placing, onPlace, onCatalog, onSelectFurniture, onClose }: {
  roomId: string;
  room: RentedRoom | undefined;
  placing: FurnitureType | null;
  onPlace: (type: FurnitureType | null) => void;
  /** Opens the furniture catalog at a room type. */
  onCatalog: (tab: RoomType | 'stored') => void;
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
    <Panel title={layout.name} className="room-panel" help={room.type && isStudioType(room.type) ? 'studios' : room.type === 'canteen' || room.type === 'meetingRoom' || room.type === 'postRoom' ? 'morale' : room.type === 'audioRoom' || room.type === 'musicSchedulingOffice' ? 'writers' : room.type === 'library' ? 'content-market' : room.type === 'managementOffice' ? 'managers' : room.type === 'workshop' ? 'staff' : 'office'} actions={close}>
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
        {room.type === 'securityRoom' && (
          <>
            <dt>Guarded</dt>
            <dd>{securityText(game)}</dd>
          </>
        )}
        {room.type === 'workshop' && (
          <>
            <dt>Courses</dt>
            <dd><WorkshopCourses game={game} room={room} /></dd>
          </>
        )}
        {room.type === 'audioRoom' && (
          <>
            <dt>Looks after</dt>
            <dd>{engineeringText(game)}</dd>
          </>
        )}
        {room.type === 'musicSchedulingOffice' && (
          <>
            <dt>Looks after</dt>
            <dd>{schedulingText(game)}</dd>
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
              {plural(room.furniture.length, 'piece')} here. Click one in the office to sell, turn, move or store it.{' '}
              <button className="link" onClick={() => onSelectFurniture(room.furniture[0]!.id)}>Go through them</button>
            </p>
          )}
          {game.storage.some((f) => room.type && FURNITURE[f.type].rooms.includes(room.type)) && (
            <p className="muted small">
              {plural(game.storage.filter((f) => room.type && FURNITURE[f.type].rooms.includes(room.type)).length, 'stored piece')} can go here.{' '}
              <button className="link" onClick={() => onCatalog('stored')}>Look at the stored pieces</button>
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
            title={room.furniture.length > 0 ? 'Sell or store the furniture first' : 'Its walls go and the floor is corridor again; what it cost to build does not come back'}
          >
            Take this room away
          </button>
        </div>
      )}
    </Panel>
  );
}
