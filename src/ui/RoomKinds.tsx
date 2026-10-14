// The kinds of room, as a group of buttons with a picture of each: a piece
// that says what the room is for, drawn from the 3D office (src/assets/rooms).

import { RENTABLE_ROOM_TYPES, ROOM_TYPE_NAMES, ROOM_TYPE_NOTES, type RoomType } from '../config/office';
import { Icon } from './Icon';

const FILES = import.meta.glob<string>('../assets/rooms/*.png', { query: '?url', import: 'default', eager: true });
const PICTURES = new Map(Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]));

/** The picture that goes with a kind of room, if there is one. */
export const roomPicture = (type: RoomType) => PICTURES.get(type);

/**
 * One of the kinds of room is picked by pressing its button. `guide` names the
 * buttons for the tutorial's ring. `locked` says why a kind can't be built yet,
 * if it can't: such a kind is dimmed and carries a lock, and can still be
 * pressed to read what it waits for.
 */
export function RoomKinds({ value, onChange, label = 'Kind of room', locked }: { value: RoomType | null; onChange: (type: RoomType) => void; label?: string; locked?: (type: RoomType) => string | null }) {
  return (
    <div className="room-kinds" role="radiogroup" aria-label={label}>
      {RENTABLE_ROOM_TYPES.map((type) => {
        const lock = locked?.(type) ?? null;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={type === value}
            className={['room-kind', type === value && 'active', lock && 'locked'].filter(Boolean).join(' ')}
            data-guide={`kind-${type}`}
            title={lock ?? ROOM_TYPE_NOTES[type]}
            onClick={() => onChange(type)}
          >
            {roomPicture(type) && <img src={roomPicture(type)} alt="" width={64} height={48} />}
            <span>
              {lock && <Icon name="locked" size={11} label="Locked" />} {ROOM_TYPE_NAMES[type]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
