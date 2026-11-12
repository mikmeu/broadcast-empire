import { describe, expect, it } from 'vitest';
import { EPISODE_COST } from '../config/balance';
import { getGenre, type GenreId } from '../config/genres';
import type { RoomType } from '../config/office';
import { buyLicense, buyRights, createChannel, createShow, hire, scheduleShow, setChannelManager, setRoomType, type ActionResult } from './actions';
import { addMissingEquipment, autoPlaceFurniture, rentRoom, setUpMasterControl, setUpPostRoom } from './fixtures';
import { showQuality, simulateDay, talksOnly } from './broadcast';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { unlockAll } from './unlocks';
import { isManager } from './office';
import type { GameState, Person } from './state';
import { tick } from './tick';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}
const logo = { shape: 'square' as const, color: '#000', initials: 'TV' };

/** Hires a made-up person and gives them a desk in office L (floor 2). */
function hireWithDesk(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  let s = structuredClone(state);
  const id = `p-tv-${s.nextId++}`;
  s.candidates.push({ id, name: 'Test Person', skill: 80, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  s = ok(hire(s, id));
  if (!s.rooms.some((r) => r.roomId === 'L')) s = ok(setRoomType(ok(rentRoom(s, 'L')), 'L', 'office'));
  // A manager's desk goes in the management office the station already has.
  if (isManager(person.role)) s = ok(autoPlaceFurniture(s, s.rooms.find((r) => r.type === 'managementOffice')!.roomId, 'managerDesk'));
  else if (person.role !== 'host') s = ok(autoPlaceFurniture(s, 'L', 'workstation'));
  return Object.assign(s, { lastId: id });
}

/** The sensible bot's radio station plus a rich company with a TV channel in the Capital and a library. */
function tvStation(): GameState & { tvId: string } {
  let s: GameState & { lastId?: string } = structuredClone(unlockAll(sensibleBot(createInitialState(1))));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  s = ok(createChannel(s, { name: 'Test TV', logo, medium: 'tv' }));
  const tvId = s.lastId!;
  s = ok(buyLicense(s, tvId, 'capital'));
  s = hireWithDesk(s, { role: 'channelManager' });
  s = ok(setChannelManager(s, tvId, s.lastId!));
  // The titles come by post (0.17.0).
  s = ok(addMissingEquipment(ok(setRoomType(ok(setUpPostRoom(ok(rentRoom(s, 'K')))), 'K', 'library')), 'K'));
  // A second channel goes out through a master control room (0.16.0).
  s = ok(setUpMasterControl(s));
  return Object.assign(s, { tvId });
}

/** A produced TV show with a studio, host and full staff, scheduled in a slot. */
function producedTvShow(
  state: GameState & { tvId: string },
  genre: GenreId,
  room: string,
  type: RoomType,
  staff: number,
  slot: number,
): GameState & { tvId: string; lastId?: string } {
  let s = ok(addMissingEquipment(ok(setRoomType(ok(rentRoom(state, room)), room, type)), room));
  s = hireWithDesk(s, { role: 'host', specialties: [genre] });
  const hostId = s.lastId!;
  const staffIds: string[] = [];
  for (let i = 0; i < staff; i++) {
    s = hireWithDesk(s, { role: 'production' });
    staffIds.push(s.lastId!);
  }
  s = ok(createShow(s, { name: 'Produced', genre, hostId, staffIds, studioId: room }));
  const showId = s.lastId!;
  s = ok(scheduleShow(s, state.tvId, slot, showId));
  return Object.assign(s, { tvId: state.tvId, lastId: showId });
}

describe('produced TV shows', () => {
  it('cost their episode budget each day they air', () => {
    const s = producedTvShow(tvStation(), 'kids', 'J', 'tvKidsStudio', 3, 0);
    const next = tick(s);
    expect(simulateDay(s).channels.find((c) => c.channelId === s.tvId)!.slots[0]!.showId).toBe(s.lastId);
    expect(next.ledger.production - s.ledger.production).toBe(EPISODE_COST.kids);
  });

  it('TV sports airs without broadcast rights, and talks about sport; with rights it shows the games and draws more', () => {
    const s = producedTvShow(tvStation(), 'tvSports', 'J', 'tvNewsStudio', 4, 3);
    const show = s.shows.find((sh) => sh.id === s.lastId)!;
    expect(showQuality(s, show).problems).toEqual([]);
    expect(talksOnly(s, getGenre('tvSports'))).toBe(true);
    const rights = { ...s.market.rights[0]!, prestige: 1 };
    const withRights = ok(buyRights({ ...s, market: { ...s.market, rights: [rights] } }, rights.id));
    expect(talksOnly(withRights, getGenre('tvSports'))).toBe(false);
    const evening = (state: GameState) => simulateDay(state).channels.find((c) => c.channelId === s.tvId)!.slots[3]!;
    expect(evening(s).programName).toBe('Produced');
    expect(evening(withRights).programName).toBe('Produced');
    expect(evening(withRights).listeners).toBeGreaterThan(evening(s).listeners);
  });
});
