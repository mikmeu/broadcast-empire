// What building a drawn room does: the Build button and the checkmark above the outline both come here.

import { buildRoom, reshapeRoom } from '../../../sim/actions';
import { play } from '../../../audio/player';
import { useGameStore } from '../../store';
import { useOfficeView, type Drawing } from '../../officeView';
import { drawingStatus } from './drawingStatus';

/** Builds the room (or gives the one that exists its new shape). It does nothing while something is in the way. */
export function buildDrawing(floor: number, drawing: Drawing): boolean {
  const { run, game } = useGameStore.getState();
  if (!game) return false;
  const { room, rect, door, kind, why } = drawingStatus(game, floor, drawing);
  if (why || !rect || !door) return false;
  const done = room ? run((s) => reshapeRoom(s, room.roomId, { ...rect, door })) : kind ? run((s) => buildRoom(s, { floor, ...rect, door, type: kind })) : false;
  if (!done) return false;
  play('woodHeavy');
  const { draw, selectRoom } = useOfficeView.getState();
  draw(null);
  selectRoom(typeof done === 'string' ? done : (room?.roomId ?? null));
  return true;
}
