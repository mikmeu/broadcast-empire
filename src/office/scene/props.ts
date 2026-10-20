// What the office view is given, and the one shape the floor is drawn on.

import { type ReactNode } from 'react';
import { type FurnitureType, type RoomType } from '../../config/office';
import type { GameState, Id } from '../../sim/state';

export interface Props {
  game: GameState;
  floor: number;
  selectedRoomId: string | null;
  selectedFurnitureId: Id | null;
  /** Furniture type being placed, if any: it can go in every rented room on the floor that takes it. */
  placing: FurnitureType | null;
  /** Quarter turns of the furniture being placed or moved. */
  placingTurn: number;
  /** The piece that was picked up to be put somewhere else, if any: it goes wherever its kind can go. */
  moving: { roomId: string; furnitureId: Id } | null;
  /** The tile that what is being placed or moved is over, if any. */
  cursor: { roomId: string; x: number; y: number } | null;
  /** The pointer or the arrow keys went to another tile, or left the rooms. */
  onPoint: (cursor: { roomId: string; x: number; y: number } | null) => void;
  /** The small window of the selected piece of furniture: it is kept beside the piece. */
  pieceWindow?: ReactNode;
  /** No walking and no moving poses. */
  still: boolean;
  /** Where the office is in its own day; see ROUTINE in layout.ts. */
  beat: number;
  /** The game's time in seconds at normal speed: what the town and its traffic run on, so they stop when the game does. */
  now: () => number;
  /** The time on the office clock, in hours that keep counting from one day into the next (`officeHours` in calendar.ts). */
  hours: () => number;
  /** How fast the game runs: 0 when paused. People walk and move at this pace. */
  pace: number;
  onSelectRoom: (roomId: string) => void;
  /** The person whose details are shown, if any. */
  selectedPersonId: Id | null;
  onSelectFurniture: (furnitureId: Id) => void;
  onSelectPerson: (personId: Id) => void;
  /** A tile was picked for what is being placed or moved: with a click, or with Enter (`byKey`). */
  onPlace: (roomId: string, x: number, y: number, byKey?: boolean) => void;
  /** The room being drawn, if any: what was dragged so far and the door it has (see `Drawing` in ui/officeView.ts). */
  drawing: { roomId: string | null; kind?: RoomType | null; rect: Rect | null; door: { x: number; z: number } | null } | null;
  /** A rectangle was dragged on the floor. */
  onDrawRect: (rect: Rect) => void;
  /** A place in the wall of the drawn rectangle was picked for the door. */
  onDrawDoor: (door: { x: number; z: number }) => void;
  /** Shows the cables (0.16.0): from the studios to the master control room and on to the roof. */
  cables?: boolean;
}

export type Rect = { x: number; y: number; w: number; h: number };
