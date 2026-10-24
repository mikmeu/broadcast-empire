// Saved games. A save is one record with an id: the autosave, or a slot the
// player named. Where the records live depends on where the game runs:
// IndexedDB in a browser, files in the player's own folder in the desktop app.

import { del, get, keys, set } from 'idb-keyval';
import { SAVE_VERSION, fromSaveFile, toSaveFile, type SaveFile } from '../sim/save';
import type { GameState } from '../sim/state';
import { desktop } from './desktop';

/** The slot the game saves to by itself. */
export const AUTOSAVE = 'auto';

/** A save as shown in a list, without loading the whole game. */
export interface SaveInfo {
  id: string;
  name: string;
  /** Real-world timestamp (ms) of when the save was made. */
  savedAt: number;
  /** The game day and the money in the save. */
  day: number;
  money: number;
  auto: boolean;
  /** Why this save can't be loaded, if it can't. */
  problem?: string;
}

/** Somewhere to keep save records by id. */
export interface SaveBackend {
  ids(): Promise<string[]>;
  /** The record as it was written, or undefined when there is none. */
  read(id: string): Promise<unknown>;
  write(id: string, record: unknown): Promise<void>;
  remove(id: string): Promise<void>;
}

const PREFIX = 'broadcast-empire:save:';

/** The browser: one IndexedDB entry per save. */
export const browserBackend: SaveBackend = {
  ids: async () => (await keys()).filter((key): key is string => typeof key === 'string' && key.startsWith(PREFIX)).map((key) => key.slice(PREFIX.length)),
  read: (id) => get(PREFIX + id),
  write: (id, record) => set(PREFIX + id, record),
  remove: (id) => del(PREFIX + id),
};

/** The desktop app: one JSON file per save, in the folder the app keeps for the player. */
export function desktopBackend(saves: NonNullable<typeof desktop>['saves']): SaveBackend {
  return {
    ids: () => saves.list(),
    read: async (id) => {
      const text = await saves.read(id);
      return text === null ? undefined : (JSON.parse(text) as unknown);
    },
    write: (id, record) => saves.write(id, JSON.stringify(record)),
    remove: (id) => saves.remove(id),
  };
}

const defaultBackend = (): SaveBackend => (desktop ? desktopBackend(desktop.saves) : browserBackend);

/** How many slots a player saves into (0.20.0). */
export const SAVE_SLOTS = 10;

/** The id of slot 1 to 10. Ids are also file names, so only lower-case letters, digits and dashes. */
export const slotId = (number: number) => `slot-${number}`;

/** The number of a slot id, or undefined for the autosave and for saves from before the slots. */
export function slotNumber(id: string): number | undefined {
  const match = /^slot-(\d+)$/.exec(id);
  const number = match ? Number(match[1]) : NaN;
  return number >= 1 && number <= SAVE_SLOTS ? number : undefined;
}

/** The first slot with nothing in it, if there is one. */
export const firstEmptySlot = (saves: readonly SaveInfo[]): string | undefined =>
  Array.from({ length: SAVE_SLOTS }, (_, i) => slotId(i + 1)).find((id) => !saves.some((s) => s.id === id));

const defaultName = (id: string) => (id === AUTOSAVE ? 'Autosave' : 'Saved game');

export async function writeSave(id: string, name: string, state: GameState, backend = defaultBackend()): Promise<void> {
  await backend.write(id, { ...toSaveFile(state, Date.now()), name });
}

/** Returns undefined if there is no such save; throws SaveError if it can't be read. */
export async function readSave(id: string, backend = defaultBackend()): Promise<SaveFile | undefined> {
  const record = await backend.read(id);
  return record === undefined ? undefined : fromSaveFile(record);
}

export async function deleteSave(id: string, backend = defaultBackend()): Promise<void> {
  await backend.remove(id);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** What a list needs to know about a record, read without migrating the game inside it. */
function describe(id: string, record: unknown): SaveInfo {
  const info: SaveInfo = { id, name: defaultName(id), savedAt: 0, day: 0, money: 0, auto: id === AUTOSAVE };
  if (!isRecord(record) || !isRecord(record.state) || typeof record.version !== 'number') return { ...info, problem: 'This is not a Broadcast Empire save.' };
  if (typeof record.name === 'string' && record.name.trim()) info.name = record.name;
  if (typeof record.savedAt === 'number') info.savedAt = record.savedAt;
  if (typeof record.state.day === 'number') info.day = record.state.day;
  if (typeof record.state.money === 'number') info.money = record.state.money;
  if (record.version > SAVE_VERSION) info.problem = 'This save is from a newer version of the game.';
  return info;
}

/**
 * Saves from before the slots (any id that is not the autosave or a slot) move into the empty slots, newest
 * first. The copy is written before the original goes, so a move that is interrupted leaves a copy, never a loss.
 * What doesn't fit stays where it is. A record that can't be read stays too.
 */
async function moveOldSaves(ids: string[], backend: SaveBackend): Promise<string[]> {
  const old = ids.filter((id) => id !== AUTOSAVE && slotNumber(id) === undefined);
  if (old.length === 0) return ids;
  const free = Array.from({ length: SAVE_SLOTS }, (_, i) => slotId(i + 1)).filter((id) => !ids.includes(id));
  if (free.length === 0) return ids;
  const records = (
    await Promise.all(old.map(async (id) => ({ id, record: await backend.read(id).catch(() => undefined) })))
  ).filter(({ record }) => isRecord(record) && isRecord(record.state) && typeof record.version === 'number');
  const savedAt = (record: unknown) => (isRecord(record) && typeof record.savedAt === 'number' ? record.savedAt : 0);
  records.sort((a, b) => savedAt(b.record) - savedAt(a.record));
  const result = [...ids];
  for (const { id, record } of records.slice(0, free.length)) {
    const target = free.shift()!;
    try {
      await backend.write(target, record);
      await backend.remove(id);
    } catch {
      // Left as it was: the save is listed under its old id.
      continue;
    }
    result.splice(result.indexOf(id), 1, target);
  }
  return result;
}

/** Every save, newest first. A record that can't be read is listed with its problem instead of hidden. */
export async function listSaves(backend = defaultBackend()): Promise<SaveInfo[]> {
  const ids = await moveOldSaves(await backend.ids(), backend);
  const saves = await Promise.all(
    ids.map(async (id) => {
      try {
        return describe(id, await backend.read(id));
      } catch {
        return { ...describe(id, undefined), problem: 'This save can’t be read.' };
      }
    }),
  );
  return saves.sort((a, b) => b.savedAt - a.savedAt);
}

/** The most recently written save that loads, with the slot it came from. */
export async function readLatestSave(backend = defaultBackend()): Promise<{ info: SaveInfo; save: SaveFile } | undefined> {
  for (const info of await listSaves(backend)) {
    if (info.problem) continue;
    const save = await readSave(info.id, backend).catch(() => undefined);
    if (save) return { info, save };
  }
  return undefined;
}

