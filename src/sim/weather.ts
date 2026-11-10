// The weather studio (0.22.0, #394): a green screen room, wall to wall with a TV news studio or a radio talk studio,
// with a meteorologist at its weather desk. The news shows made in the studio next door are then more appealing. Sports
// shows and talk shows never gain. Pairing is built as the control rooms of TV studios are (see tvControlRooms in
// sim/office.ts). The numbers are in WEATHER in config/balance.ts. This file imports no broadcasting code;
// broadcast.ts and the screens call into it.

import { WEATHER } from '../config/balance';
import type { RoomType } from '../config/office';
import { inOrder, isFurnished, sharesWall, type Desks } from './office';
import { helperRate } from './upkeep';
import type { GameState, Id, RentedRoom, Show } from './state';

/** The studios a weather studio can serve, TV news first. */
export const WEATHER_STUDIOS: readonly RoomType[] = ['tvNewsStudio', 'radioTalkStudio'];

/**
 * The weather studio of each news studio, by the studio's room id: weather studios go in the order of the building,
 * and each serves one studio next door that has no weather studio yet, a TV news studio before a radio talk studio.
 * A weather studio that is not furnished serves nothing.
 */
export function weatherPairs(state: GameState): Map<string, RentedRoom> {
  const paired = new Map<string, RentedRoom>();
  const weather = inOrder(state.rooms.filter((r) => r.type === 'weatherStudio' && isFurnished(r)));
  if (weather.length === 0) return paired;
  for (const room of weather) {
    for (const type of WEATHER_STUDIOS) {
      const studio = inOrder(state.rooms.filter((r) => r.type === type)).find((r) => !paired.has(r.roomId) && sharesWall(r, room));
      if (!studio) continue;
      paired.set(studio.roomId, room);
      break;
    }
  }
  return paired;
}

/** The weather studio of a news studio, if it has one next door. */
export const weatherStudioOf = (state: GameState, studioId: string) => weatherPairs(state).get(studioId);

/** The studio a weather studio serves, if any. */
export function studioServed(state: GameState, weatherId: string): RentedRoom | undefined {
  for (const [studioId, room] of weatherPairs(state)) if (room.roomId === weatherId) return state.rooms.find((r) => r.roomId === studioId);
  return undefined;
}

/** How well a weather studio is worked: 0 with nobody at its desk, else the meteorologist's rate (skill and morale; at most WEATHER.maxCrew). */
export function weatherRate(state: GameState, desked: Desks, weatherId: Id): number {
  let best = 0;
  for (const e of state.employees) {
    if (e.role !== 'meteorologist' || desked.get(e.id)?.roomId !== weatherId) continue;
    best = Math.max(best, Math.min(WEATHER.maxCrew, helperRate(state, e, desked)));
  }
  return best;
}

/** The lift of a show: only a news show made in a studio with a weather studio and a meteorologist at it. 1 for anything else. */
export function weatherAppeal(state: GameState, desked: Desks, show: Pick<Show, 'genre' | 'studioId'>, pairs: ReadonlyMap<string, RentedRoom> = weatherPairs(state)): number {
  if (!show.studioId || !(WEATHER.newsGenres as readonly string[]).includes(show.genre)) return 1;
  const room = pairs.get(show.studioId);
  if (!room) return 1;
  return 1 + (WEATHER.lift - 1) * weatherRate(state, desked, room.roomId);
}
