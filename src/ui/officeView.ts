import { create } from 'zustand';
import type { FurnitureType, RoomType } from '../config/office';
import type { Id } from '../sim/state';
import { opensFurnishing } from './screens/office/trayContents';

/** A narrow screen shows the room's panel instead of an open tray (see styles.css), so the tray doesn't open by itself there. */
const isNarrow = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches;

/**
 * What the player is looking at and doing in the office: the floor, what is
 * selected, and the piece of furniture being placed or moved. It is shared by the
 * office itself and the furniture catalog, which is a window of its own.
 */
/**
 * A room that is being drawn: a new one, or one that exists and is given
 * another shape. It has a rectangle once one was dragged or proposed, and a
 * door once one was proposed for it or picked.
 */
export interface Drawing {
  /** The room that gets another shape, or null for a new room. */
  roomId: string | null;
  /** The kind of room a new one will be. */
  kind: RoomType | null;
  rect: { x: number; y: number; w: number; h: number } | null;
  door: { x: number; z: number } | null;
  /** The rectangle is the one the game proposed for the kind, untouched: picking another kind proposes anew. */
  proposed?: boolean;
}

/** A tile of a room, counted from the room's own corner. */
export interface Tile {
  roomId: string;
  x: number;
  y: number;
}

interface OfficeView {
  floor: number;
  roomId: string | null;
  furnitureId: Id | null;
  personId: Id | null;
  /** The furniture being placed, if any. */
  placing: FurnitureType | null;
  /** Quarter turns of the furniture being placed or moved. */
  placingTurn: number;
  /** The piece that was picked up to be put somewhere else, if any. */
  moving: { roomId: string | null; furnitureId: Id } | null;
  /** The tile of a room that what is being placed or moved is over: where the pointer is, or where the arrow keys took it. */
  cursor: Tile | null;
  /** The workplace that is being given to someone, if any: the room's panel lists who can have it. */
  seating: Id | null;
  /** The room being drawn, if any. */
  drawing: Drawing | null;
  /** The tray folded out above the bottom bar, if any (0.21.0). Not saved. */
  tray: Tray | null;
  /** The room type the catalog is open at. */
  catalogTab: RoomType;
  /** The piece the catalog shows in full. */
  catalogItem: FurnitureType | null;
  /** The version of that piece: a tier that is still locked, or null for the one on sale. */
  catalogTier: number | null;

  setFloor(floor: number): void;
  /** Selects a room, or none. Placing goes on: the piece can go in any room that takes it. */
  selectRoom(roomId: string | null): void;
  /**
   * Selects a room the player clicked, picked from the list or just built, and folds the Furnishing tray out for it
   * when `opensFurnishing` says so. `kind` is the room's kind. `selectRoom` doesn't open it: placing calls that.
   */
  openRoom(roomId: string, kind: RoomType | null): void;
  selectFurniture(furnitureId: Id | null): void;
  selectPerson(personId: Id | null): void;
  /** Starts placing a piece, or stops with null. */
  place(type: FurnitureType | null): void;
  turnPlacing(): void;
  /** Picks a piece up to move it, turned as it stands, or puts it back with null. A null room is the storage. */
  move(piece: { roomId: string | null; furnitureId: Id; turn: number } | null): void;
  point(cursor: Tile | null): void;
  /** Opens the list of people for a workplace, or closes it with null. */
  seat(furnitureId: Id | null): void;
  /** Starts drawing, changes what is drawn, or stops with null. Drawing and placing furniture don't go together. */
  draw(drawing: Drawing | null): void;
  openCatalog(tab: RoomType, item?: FurnitureType | null, tier?: number | null): void;
  /** Folds a tray out, or in with null. */
  openTray(tray: Tray | null): void;
}

/** The three trays of the build buttons: the kinds of room, the pieces for the selected room, and the stored pieces. */
export type Tray = 'room' | 'furnish' | 'inventory';

/**
 * The floor one step up (+1) or down (-1) from `floor`, in a building of `floors` floors with the roof above them.
 * Locked floors are passed through, as they can be looked at; it stops at floor 1 and at the roof.
 */
export function stepFloor(floor: number, step: 1 | -1, floors: number): number {
  return Math.max(1, Math.min(floors + 1, floor + step));
}

/** The text beside the floor arrows: the floor in view, whether it is still locked, or the roof. */
export function floorLabel(floor: number, floors: number, floorsUnlocked: number): string {
  if (floor > floors) return 'Roof';
  return floor > floorsUnlocked ? `Floor ${floor} · locked` : `Floor ${floor}`;
}

export const useOfficeView = create<OfficeView>()((setState) => ({
  floor: 1,
  roomId: null,
  furnitureId: null,
  personId: null,
  placing: null,
  placingTurn: 0,
  moving: null,
  cursor: null,
  seating: null,
  drawing: null,
  tray: null,
  catalogTab: 'office',
  catalogItem: null,
  catalogTier: null,

  setFloor: (floor) => setState({ floor, roomId: null, furnitureId: null, personId: null, drawing: null, seating: null, tray: null }),
  // With no room selected, a Furnishing tray left open has nothing to show.
  selectRoom: (roomId) => setState((s) => ({ roomId, furnitureId: null, personId: null, seating: null, ...(roomId === null && s.tray === 'furnish' ? { tray: null } : {}) })),
  openRoom: (roomId, kind) =>
    setState((s) => ({
      roomId,
      furnitureId: null,
      personId: null,
      seating: null,
      ...(opensFurnishing({ kind, placing: s.placing, moving: s.moving !== null, drawing: s.drawing !== null, tray: s.tray, narrow: isNarrow() }) ? { tray: 'furnish' as const } : {}),
    })),
  selectFurniture: (furnitureId) => setState(furnitureId ? { furnitureId, personId: null } : { furnitureId }),
  selectPerson: (personId) => setState(personId ? { personId, furnitureId: null } : { personId }),
  place: (placing) => setState(placing ? { placing, drawing: null, moving: null, furnitureId: null, tray: null } : { placing, cursor: null }),
  turnPlacing: () => setState((s) => ({ placingTurn: (s.placingTurn + 1) % 4 })),
  move: (piece) => setState(piece ? { moving: { roomId: piece.roomId, furnitureId: piece.furnitureId }, placingTurn: piece.turn, placing: null, drawing: null, furnitureId: null, personId: null, tray: null } : { moving: null, cursor: null }),
  seat: (seating) => setState({ seating }),
  point: (cursor) => setState((s) => (s.cursor?.roomId === cursor?.roomId && s.cursor?.x === cursor?.x && s.cursor?.y === cursor?.y ? s : { cursor })),
  draw: (drawing) => setState(drawing ? { drawing, placing: null, moving: null, furnitureId: null, personId: null, tray: null } : { drawing }),
  openTray: (tray) => setState({ tray }),
  openCatalog: (catalogTab, catalogItem = null, catalogTier = null) => setState({ catalogTab, catalogItem, catalogTier }),
}));
