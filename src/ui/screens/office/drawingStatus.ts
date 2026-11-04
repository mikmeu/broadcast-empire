// What a room being drawn lacks and costs, and the steps back: the panel and the checkmark above the outline give the same answer.

import { buildCost, kindError, reshapeCost, roomError } from '../../../sim/rooms';
import { findRoom } from '../../../sim/office';
import type { GameState } from '../../../sim/state';
import { formatMoney } from '../../format';
import type { Drawing } from '../../officeView';

export function drawingStatus(game: GameState, floor: number, drawing: Drawing) {
  const room = drawing.roomId ? findRoom(game, drawing.roomId) : undefined;
  const { rect, door, kind } = drawing;
  const taken = !room && kind ? kindError(game, kind) : null;
  const error = taken ?? (rect ? roomError(game, { floor, ...rect, door }, drawing.roomId ?? undefined) : null);
  const cost = rect ? (room ? reshapeCost(room, rect) : buildCost(rect)) : 0;
  const why = !room && !kind ? 'Choose what kind of room it is.' : taken ? taken : !rect ? 'Drag its outline on the floor first.' : error ?? (!door ? 'Click one of its walls for the door.' : game.money < cost ? `Not enough money (${formatMoney(cost)} needed).` : null);
  return { room, rect, door, kind, taken, error, cost, why };
}

/** One step back for a new room with a kind: to the kinds. An outline the game proposed goes with it; one drawn by hand stays. Null when there is no step (no kind, or a room that exists). */
export function stepBack(drawing: Drawing): Drawing | null {
  if (drawing.roomId || !drawing.kind) return null;
  return drawing.proposed ? { ...drawing, kind: null, rect: null, door: null, proposed: false } : { ...drawing, kind: null };
}

/** Throws the outline and the door away and keeps the kind, so it can be dragged again. */
export function redraw(drawing: Drawing): Drawing {
  return { ...drawing, rect: null, door: null, proposed: false };
}
