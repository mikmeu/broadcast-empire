import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { furnitureTypes, furnitureSpec, FLOOR, FURNITURE, getPlot, type FurnitureType } from '../config/office';
import { type ActionResult } from '../sim/actions';
import { rentRoom } from '../sim/fixtures';
import { sensibleBot } from '../sim/bots';
import { createInitialState } from '../sim/newGame';
import { SUPPORT_ROLES, employeesWithDesk, findRoom, needsDesk, roomName } from '../sim/office';
import type { GameState } from '../sim/state';
import { tick } from '../sim/tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
import { GIVEN_NAMES_FEMALE, GIVEN_NAMES_MALE } from '../config/names';
import { furnitureAsset, ANIMATIONS, CHARACTERS, MODELS, characterFor, type ModelId, type Part } from './assets';
import { CORRIDOR_Z, deskSeats, partsAt, peopleOnFloor, whereabouts } from './layout';
import { walkPath } from './routes';

/** A staffed station after a month, so support staff have been sent to rooms. */
function station() {
  let s = createInitialState(1);
  for (let day = 0; day < 30; day++) s = tick(sensibleBot(s));
  return s;
}

describe('the asset registry', () => {
  it('has every model and character file in public/models', () => {
    for (const file of [...Object.values(MODELS), ...CHARACTERS.female, ...CHARACTERS.male]) expect(existsSync(`public/models/${file}`), file).toBe(true);
  });

  it('describes every kind of furniture inside its footprint, using only registered models', () => {
    for (const type of furnitureTypes()) {
      const asset = furnitureAsset(type);
      const spec = furnitureSpec(type);
      expect(asset.parts.length, type).toBeGreaterThan(0);
      for (const part of asset.parts) {
        expect(part.at[0], type).toBeGreaterThanOrEqual(0);
        expect(part.at[0], type).toBeLessThanOrEqual(spec.w);
        expect(part.at[2], type).toBeGreaterThanOrEqual(0);
        // The one exception: the guests of a mixing desk sit across from the presenter, on the tiles in front of it.
        expect(part.at[2], type).toBeLessThanOrEqual(type === 'mixingDesk' ? spec.h + 0.5 : spec.h);
        if ('model' in part) expect(MODELS[part.model as ModelId], type).toBeDefined();
      }
      for (const spot of asset.spots ?? []) expect(ANIMATIONS[spot.activity], type).toBeDefined();
    }
  });

  it('shows a workstation at every tier', () => {
    for (const tier of [1, 2, 3, 4]) {
      const parts = partsAt('workstation', tier);
      expect(parts.some((p) => 'model' in p && p.model === 'desk')).toBe(true);
      // Desk and chair plus what stands on the desk at that tier.
      expect(parts.length).toBeGreaterThan(2);
    }
    expect(partsAt('workstation', 1)).not.toEqual(partsAt('workstation', 4));
  });

  it('gives the master control desk a 1970s look and a later one, both inside its footprint', () => {
    // The looks are groups of parts; look inside them.
    const flat = (tier: number): Part[] => partsAt('mcrDesk', tier).flatMap((p) => ('parts' in p && p.parts ? p.parts.filter((q) => !q.tiers || (tier >= q.tiers[0] && tier <= q.tiers[1])) : [p]));
    const screens = (tier: number) => flat(tier).filter((p) => 'model' in p && (p.model === 'screen' || p.model === 'keyboard'));
    expect(flat(1).length).toBeGreaterThan(2);
    expect(flat(2).length).toBeGreaterThan(2);
    expect(flat(1)).not.toEqual(flat(2));
    expect(screens(1)).toHaveLength(0);
    expect(screens(2).length).toBeGreaterThan(0);
    for (const tier of [1, 2]) for (const part of flat(tier)) {
      expect(part.at[0]).toBeGreaterThanOrEqual(0);
      expect(part.at[0]).toBeLessThanOrEqual(FURNITURE.mcrDesk.w);
      expect(part.at[2]).toBeGreaterThanOrEqual(0);
      expect(part.at[2]).toBeLessThanOrEqual(FURNITURE.mcrDesk.h);
    }
  });

  it('puts a dial phone on the desks, then a push-button one, and none once there are laptops', () => {
    // The phones are the groups of parts on the desk.
    const phone = (type: FurnitureType, tier: number) => partsAt(type, tier).filter((p) => 'parts' in p);
    for (const type of ['workstation', 'writingDesk'] as const) {
      expect(phone(type, 1), type).toHaveLength(1);
      expect(phone(type, 2), type).toEqual(phone(type, 1));
      expect(phone(type, 3), type).toHaveLength(1);
      expect(phone(type, 3), type).not.toEqual(phone(type, 1));
      expect(phone(type, 4), type).toHaveLength(0);
    }
    // The manager and the CEO keep the same dial phone.
    const dial = (phone('workstation', 1)[0] as { parts: unknown }).parts;
    for (const type of ['managerDesk', 'ceoDesk'] as const) expect(phone(type, 4).map((p) => (p as { parts: unknown }).parts), type).toEqual([dial]);
  });
});

describe('who looks like whom', () => {
  it('gives the same name the same character, and has a portrait for every character', () => {
    expect(characterFor('Mila Holm')).toBe(characterFor('Mila Holm'));
    for (const file of [...CHARACTERS.female, ...CHARACTERS.male]) {
      const portrait = file.replace('characters/', 'src/assets/avatars/').replace('.glb', '.png');
      expect(existsSync(portrait), portrait).toBe(true);
    }
    for (const story of ['tabby', 'penny']) expect(existsSync(`src/assets/avatars/${story}.png`), story).toBe(true);
  });

  it('uses every character, a female one for the women’s names and a male one for the men’s', () => {
    const used = new Set<string>();
    const lasts = ['Albers', 'Brink', 'Vos', 'Stern', 'Kade', 'Roth', 'Lind', 'Haas'];
    for (const first of [...GIVEN_NAMES_FEMALE, ...GIVEN_NAMES_MALE]) {
      for (const last of lasts) used.add(characterFor(`${first} ${last}`));
    }
    expect(used.size).toBe(CHARACTERS.female.length + CHARACTERS.male.length);
    for (const first of GIVEN_NAMES_FEMALE.filter((n) => !GIVEN_NAMES_MALE.includes(n))) {
      expect(CHARACTERS.female as readonly string[]).toContain(characterFor(`${first} Albers`));
    }
    for (const first of GIVEN_NAMES_MALE.filter((n) => !GIVEN_NAMES_FEMALE.includes(n))) {
      expect(CHARACTERS.male as readonly string[]).toContain(characterFor(`${first} Albers`));
    }
  });
});

describe('who is where in the office', () => {
  it('says in words what each person is doing', () => {
    const s = station();
    const people = [1, 2, 3].flatMap((floor) => peopleOnFloor(s, floor));
    for (const p of people) expect(whereabouts(s, p)).toMatch(/\.$/);
    const seated = people.find((p) => p.activity === 'sit' && p.role === 'production')!;
    expect(whereabouts(s, seated)).toBe(`At their desk in ${roomName(s, seated.roomId!)}.`);
    const host = people.find((p) => p.role === 'host' && p.roomId)!;
    expect(whereabouts(s, host)).toMatch(new RegExp(`^In ${roomName(s, host.roomId!)}, presenting “`));
    expect(whereabouts(s, { ...seated, roomId: null })).toMatch(/no working workstation/);
    const manager = people.find((p) => p.role === 'channelManager')!;
    expect(whereabouts(s, manager)).toBe(`At their desk in ${roomName(s, manager.roomId!)}.`);
    expect(whereabouts(s, { ...manager, roomId: null })).toMatch(/no manager’s desk for them in a management office/);
  });

  it('seats everyone with a desk at a workstation of their own, in the room the simulation gave them', () => {
    const s = station();
    const seats = deskSeats(s);
    const desks = employeesWithDesk(s);
    expect(seats.size).toBe(desks.size);
    expect(new Set([...seats.values()].map((seat) => seat.item.id)).size).toBe(seats.size);
    for (const [id, seat] of seats) expect(seat.roomId).toBe(desks.get(id)!.roomId);
  });

  it('places every employee exactly once across the floors, inside their room or in the corridor', () => {
    const s = station();
    const everyone = [1, 2, 3].flatMap((floor) => peopleOnFloor(s, floor));
    // The player is there too, once.
    expect(everyone.filter((p) => p.role === 'ceo')).toHaveLength(1);
    const people = everyone.filter((p) => p.role !== 'ceo');
    expect(people.map((p) => p.id).sort()).toEqual(s.employees.map((e) => e.id).sort());
    for (const p of people) {
      if (!p.roomId) {
        expect(p.z).toBeGreaterThan(FLOOR.corridorY);
        expect(p.z).toBeLessThan(FLOOR.corridorY + 1);
        continue;
      }
      const room = findRoom(s, p.roomId)!;
      expect(p.x).toBeGreaterThan(room.x);
      expect(p.x).toBeLessThan(room.x + room.w);
      expect(p.z).toBeGreaterThan(room.y);
      expect(p.z).toBeLessThan(room.y + room.h);
    }
  });

  it('sits office staff down, puts hosts in their studio and support staff in the room they work in', () => {
    const s = station();
    const people = [1, 2, 3].flatMap((floor) => peopleOnFloor(s, floor));
    const byId = new Map(people.map((p) => [p.id, p]));
    for (const e of s.employees) {
      const p = byId.get(e.id)!;
      // At a desk they sit; a cook stands at the stove (0.15.0).
      if (needsDesk(e.role) && employeesWithDesk(s).has(e.id)) expect(p.activity).toBe(e.role === 'cook' ? 'work' : 'sit');
      if (SUPPORT_ROLES.includes(e.role)) expect(p.roomId).toBe(e.location);
      if (e.role === 'host') {
        const show = s.shows.find((sh) => sh.hostId === e.id && sh.studioId);
        expect(p.roomId).toBe(show?.studioId ?? null);
      }
    }
  });

  it('walks from room to room through both doors and along the corridor', () => {
    const s = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].reduce((game, id) => ok(rentRoom(game, id)), createInitialState(1));
    const from = getPlot('A');
    const to = getPlot('G');
    const path = walkPath(s, 1, { x: from.x + 1, z: from.y + 1 }, { x: to.x + 2, z: to.y + 2 });
    // Out through the door of the one, a stretch down the middle of the corridor, in through the door of the other.
    const near = (x: number, z: number) => path.some(([px, pz]) => Math.hypot(px - x, pz - z) <= 0.75);
    expect(near(from.door.x, from.door.z)).toBe(true);
    expect(near(to.door.x, to.door.z)).toBe(true);
    expect(path.filter(([, z]) => z === CORRIDOR_Z).length).toBeGreaterThanOrEqual(2);
    expect(path.at(-1)).toEqual([to.x + 2, to.y + 2]);
    // Within an empty room it is a straight line.
    expect(walkPath(s, 1, { x: 1, z: 1 }, { x: 3, z: 2 })).toEqual([[3, 2]]);
    // And on a floor without rooms there is no corridor to keep to: straight across.
    expect(walkPath(createInitialState(1), 1, { x: from.x + 1, z: from.y + 1 }, { x: to.x + 2, z: to.y + 2 })).toEqual([[to.x + 2, to.y + 2]]);
  });
});
