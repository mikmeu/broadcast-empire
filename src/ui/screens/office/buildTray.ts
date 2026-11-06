// What the build tray above the bottom bar lists (0.21.0, #301): the kinds of room by group, and the pieces for a kind.

import { furnitureSpec, furnitureTypes, RENTABLE_ROOM_TYPES, ROOM_GROUP, ROOM_GROUP_NAMES, STUDIO_REQUIREMENTS, type FurnitureType, type RoomGroup, type RoomType } from '../../../config/office';

/** The pieces that go in a kind of room, in the order of the furniture list; what is no longer sold is left out. */
export const piecesFor = (type: RoomType): FurnitureType[] => furnitureTypes().filter((t) => furnitureSpec(t).rooms.includes(type) && !furnitureSpec(t).retired);

/** The kinds of room that can be built, by group, in the order of the groups; a group without a kind is left out. */
export function trayGroups(): { group: RoomGroup; name: string; kinds: RoomType[] }[] {
  return (Object.keys(ROOM_GROUP_NAMES) as RoomGroup[])
    .map((group) => ({ group, name: ROOM_GROUP_NAMES[group], kinds: RENTABLE_ROOM_TYPES.filter((t) => ROOM_GROUP[t] === group) }))
    .filter((g) => g.kinds.length > 0);
}

/**
 * The pieces for a kind of room. Required is what its checklist asks for, as far as it stands in the room itself
 * (a TV studio's control desk and mixer stand next door), with how many; an office has no checklist, but it is
 * no use without workstations, so they are its required piece, with no count. Improvements is the rest.
 */
export function trayPieces(kind: RoomType): { required: { type: FurnitureType; need: number | null }[]; improvements: FurnitureType[] } {
  const here = piecesFor(kind);
  const listed = (Object.entries(STUDIO_REQUIREMENTS[kind] ?? {}) as [FurnitureType, number][]).filter(([type]) => here.includes(type));
  const required = listed.map(([type, need]) => ({ type, need: need as number | null }));
  if (kind === 'office' && here.includes('workstation')) required.push({ type: 'workstation', need: null });
  return { required, improvements: here.filter((t) => !required.some((r) => r.type === t)) };
}
