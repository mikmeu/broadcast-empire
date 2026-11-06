// The three build buttons at the bottom left of the office, and the tray each folds out above the bottom bar (0.21.0, #301).

import type { ReactNode } from 'react';
import { furnitureSpec, ROOM_TYPE_NAMES, ROOM_TYPE_NOTES, type FurnitureType, type RoomType } from '../../../config/office';
import { getTech } from '../../../config/tech';
import { kindError } from '../../../sim/rooms';
import { findRoom, missingFurniture } from '../../../sim/office';
import type { GameState } from '../../../sim/state';
import { furniturePrice, ownsTech, purchaseTier } from '../../../sim/tech';
import { formatMoney } from '../../format';
import { Icon, type IconName } from '../../Icon';
import { useOfficeView, type Tray } from '../../officeView';
import { furniturePicture, roomPicture } from '../../RoomKinds';
import { StoredPieces } from '../InventoryScreen';
import { withProposal } from './BuildPanel';
import { selectedKind, trayGroups, trayPieces } from './buildTray';
import { plural } from './shared';

function TrayButton({ tray, icon, label, title, guide, open, disabled, count, onPress }: { tray: Tray; icon: IconName; label: string; title: string; guide: string; open: boolean; disabled?: boolean; count?: number; onPress: () => void }) {
  return (
    <button className={open ? 'tab tray-button active' : 'tab tray-button'} data-guide={guide} data-tray={tray} aria-pressed={open} aria-expanded={open} disabled={disabled} title={title} onClick={onPress}>
      <Icon name={icon} size={40} />
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span className="count" role="img" aria-label={`${count} stored`}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

/** One piece of the Furnishing tray: its picture, name and price, and for a lock the research it waits for. */
function PieceTile({ game, type, need, have, onPlace }: { game: GameState; type: FurnitureType; need: number | null; have: number; onPlace: (type: FurnitureType) => void }) {
  const spec = furnitureSpec(type);
  const unlock = spec.unlock && !ownsTech(game, spec.unlock) ? getTech(spec.unlock) : undefined;
  const picture = furniturePicture(type);
  return (
    <button
      type="button"
      className={unlock ? 'tray-tile locked' : 'tray-tile'}
      data-guide={`tray-piece-${type}`}
      title={unlock ? `Research ${unlock.name}` : spec.note ?? spec.about}
      aria-disabled={unlock ? true : undefined}
      onClick={() => !unlock && onPlace(type)}
    >
      {picture ? <img src={picture} alt="" width={64} height={48} /> : <span className="tray-initial" aria-hidden="true">{spec.name.charAt(0)}</span>}
      <strong>
        {unlock && <Icon name="locked" size={11} label="Locked" />} {spec.name}
      </strong>
      <span className="small">{unlock ? `Research ${unlock.name}` : formatMoney(furniturePrice(type, purchaseTier(game, type)))}</span>
      {need !== null && !unlock && <span className="small">{have} of {need}</span>}
    </button>
  );
}

function Group({ name, guide, open = true, children }: { name: string; guide: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="tray-group" open={open}>
      <summary data-guide={guide}>{name}</summary>
      <div className="tray-tiles">{children}</div>
    </details>
  );
}

/**
 * Room, Furnishing and Inventory: three buttons on the bottom edge of the
 * office, each folding a tray up from the bottom bar. Room lists the kinds of
 * room by group and starts drawing one; Furnishing lists the pieces for the
 * selected room, those it requires and the improvements, and puts one on the
 * pointer; Inventory lists the stored pieces. `onCatalog` opens the Catalog
 * window at a kind of room. Which tray is out is not saved.
 */
export function BuildTray({ game, floor, closed, onCatalog }: { game: GameState; floor: number; closed: string | null; onCatalog: (tab: RoomType) => void }) {
  const { tray, roomId, drawing } = useOfficeView();
  const { openTray, place, draw, selectRoom, selectFurniture } = useOfficeView.getState();
  const kind = selectedKind(game, roomId);
  const room = roomId ? findRoom(game, roomId) : undefined;
  /** The stored pieces that could go in this room. */
  const stored = kind ? game.storage.filter((f) => furnitureSpec(f.type).rooms.includes(kind)).length : 0;
  const drawingNew = Boolean(drawing && !drawing.roomId);
  const toggle = (which: Tray) => openTray(tray === which ? null : which);
  const pieces = kind ? trayPieces(kind) : null;
  const have = (type: FurnitureType, need: number) => (room ? need - (missingFurniture(game, room).find(([t]) => t === type)?.[1] ?? 0) : 0);

  return (
    <div className="build-tray-area">
      {tray && (
        <div key={`${tray}:${roomId ?? ''}`} className="build-tray" role="region" aria-label={tray === 'room' ? 'Kinds of room' : tray === 'furnish' ? 'Furnishing' : 'Inventory'} data-tray-open={tray}>
          {tray === 'room' &&
            trayGroups().map(({ group, name, kinds }) => (
              <Group key={group} name={name} guide={`tray-group-${group}`}>
                {kinds.map((type) => {
                  const lock = kindError(game, type);
                  const picture = roomPicture(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      className={lock ? 'tray-tile locked' : 'tray-tile'}
                      data-guide={`tray-kind-${type}`}
                      title={lock ?? ROOM_TYPE_NOTES[type]}
                      onClick={() => {
                        selectRoom(null);
                        draw(withProposal(game, floor, { roomId: null, kind: null, rect: null, door: null }, type));
                      }}
                    >
                      {picture && <img src={picture} alt="" width={64} height={48} />}
                      <strong>
                        {lock && <Icon name="locked" size={11} label="Locked" />} {ROOM_TYPE_NAMES[type]}
                      </strong>
                    </button>
                  );
                })}
              </Group>
            ))}
          {tray === 'furnish' && !kind && <p className="muted small">Select a room first: click it in the office.</p>}
          {tray === 'furnish' && kind && pieces && (
            <>
              <p className="muted small tray-note">
                For the {ROOM_TYPE_NAMES[kind].toLowerCase()}. Pick a piece, then click a free spot in the room.
                {room && room.furniture.length > 0 && (
                  <>
                    {' '}{plural(room.furniture.length, 'piece')} here: <button className="link" onClick={() => selectFurniture(room.furniture[0]!.id)}>Go through them</button>.
                  </>
                )}
                {stored > 0 && (
                  <>
                    {' '}{plural(stored, 'stored piece')} can go here: <button className="link" onClick={() => openTray('inventory')}>Inventory</button>.
                  </>
                )}
              </p>
              {pieces.required.length > 0 && (
                <Group name="Required" guide="tray-group-required">
                  {pieces.required.map(({ type, need }) => (
                    <PieceTile key={type} game={game} type={type} need={need} have={need === null ? 0 : have(type, need)} onPlace={place} />
                  ))}
                </Group>
              )}
              {pieces.improvements.length > 0 && (
                <Group name="Improvements" guide="tray-group-improvements" open={false}>
                  {pieces.improvements.map((type) => (
                    <PieceTile key={type} game={game} type={type} need={null} have={0} onPlace={place} />
                  ))}
                </Group>
              )}
              <button className="link" onClick={() => onCatalog(kind)}>More about these in the catalog</button>
            </>
          )}
          {tray === 'inventory' && <StoredPieces />}
        </div>
      )}
      <div className="tray-buttons">
        <TrayButton
          tray="room"
          icon="construction-helmet"
          label="Room"
          guide="build-room"
          open={tray === 'room' || drawingNew}
          disabled={closed !== null}
          title={closed ?? (drawingNew ? 'Stop drawing the room' : 'Draw a new room on this floor')}
          onPress={() => (drawingNew ? draw(null) : toggle('room'))}
        />
        <TrayButton tray="furnish" icon="catalog" label="Furnishing" guide="build-furnish" open={tray === 'furnish'} disabled={!kind && tray !== 'furnish'} title={kind ? 'Furnish the selected room' : 'Select a room first'} onPress={() => toggle('furnish')} />
        <TrayButton tray="inventory" icon="inventory" label="Inventory" guide="build-inventory" open={tray === 'inventory'} count={game.storage.length} title="The pieces you have put away" onPress={() => toggle('inventory')} />
      </div>
    </div>
  );
}
