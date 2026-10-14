import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, SaveError } from '../sim/save';
import { createInitialState } from '../sim/newGame';
import { advance } from '../sim/tick';
import { AUTOSAVE, deleteSave, desktopBackend, listSaves, newSaveId, readLatestSave, readSave, writeSave, type SaveBackend } from './storage';

/** Save records kept in memory, the way a backend keeps them. */
function memoryBackend(records = new Map<string, unknown>()): SaveBackend & { records: Map<string, unknown> } {
  return {
    records,
    ids: async () => [...records.keys()],
    // A stored record never shares objects with the game that wrote it.
    read: async (id) => (records.has(id) ? structuredClone(records.get(id)) : undefined),
    write: async (id, record) => void records.set(id, structuredClone(record)),
    remove: async (id) => void records.delete(id),
  };
}

const game = (days = 0) => advance(createInitialState(1), days);

describe('save slots (Phase 7)', () => {
  it('writes a named save and reads the same game back', async () => {
    const backend = memoryBackend();
    const state = game(12);
    await writeSave('save-a', 'Before the auction', state, backend);
    const save = await readSave('save-a', backend);
    expect(save?.state).toEqual(state);
    expect(save?.version).toBe(SAVE_VERSION);
    expect(await readSave('nothing-here', backend)).toBeUndefined();
  });

  it('lists every save newest first, with its name, game day and money', async () => {
    const backend = memoryBackend();
    await writeSave('save-a', 'First', game(3), backend);
    await writeSave(AUTOSAVE, 'Autosave', game(40), backend);
    // Saves made in the same millisecond keep an order; give these their own times.
    backend.records.set('save-a', { ...(backend.records.get('save-a') as object), savedAt: 1000 });
    backend.records.set(AUTOSAVE, { ...(backend.records.get(AUTOSAVE) as object), savedAt: 2000 });

    const list = await listSaves(backend);
    expect(list.map((s) => s.id)).toEqual([AUTOSAVE, 'save-a']);
    expect(list[0]).toMatchObject({ name: 'Autosave', auto: true, day: 40, savedAt: 2000 });
    expect(list[1]).toMatchObject({ name: 'First', auto: false, day: 3, money: game(3).money });
    expect(list.every((s) => s.problem === undefined)).toBe(true);
  });

  it('overwrites a slot and deletes one', async () => {
    const backend = memoryBackend();
    await writeSave('save-a', 'Mine', game(1), backend);
    await writeSave('save-a', 'Mine, later', game(9), backend);
    expect(await listSaves(backend)).toHaveLength(1);
    expect((await listSaves(backend))[0]).toMatchObject({ name: 'Mine, later', day: 9 });
    await deleteSave('save-a', backend);
    expect(await listSaves(backend)).toEqual([]);
  });

  it('still loads the single save of the game before save slots', async () => {
    const state = game(5);
    const backend = memoryBackend(new Map<string, unknown>([['manual', { version: SAVE_VERSION, savedAt: 500, state }]]));
    expect((await listSaves(backend))[0]).toMatchObject({ id: 'manual', name: 'Saved game', auto: false, day: 5 });
    expect((await readLatestSave(backend))?.save.state).toEqual(state);
  });

  it('shows a broken save with its problem, and continues from the newest one that loads', async () => {
    const backend = memoryBackend();
    await writeSave('save-good', 'Good', game(7), backend);
    backend.records.set('save-good', { ...(backend.records.get('save-good') as object), savedAt: 1000 });
    backend.records.set('save-future', { version: SAVE_VERSION + 1, savedAt: 3000, name: 'From the future', state: { day: 99, money: 1 } });
    backend.records.set('save-junk', 'not a save');
    backend.records.set('save-broken', { version: SAVE_VERSION, savedAt: 2000, name: 'Broken', state: { day: 1 } });

    const list = await listSaves(backend);
    expect(list.find((s) => s.id === 'save-future')?.problem).toMatch(/newer version/);
    expect(list.find((s) => s.id === 'save-junk')?.problem).toMatch(/not a Broadcast Empire save/);
    // A save that looks right in the list can still fail when it is loaded.
    expect(list.find((s) => s.id === 'save-broken')?.problem).toBeUndefined();
    await expect(readSave('save-broken', backend)).rejects.toThrow(SaveError);

    const latest = await readLatestSave(backend);
    expect(latest?.info.id).toBe('save-good');
    expect(await readLatestSave(memoryBackend())).toBeUndefined();
  });

  it('makes ids that are safe as file names', () => {
    expect(newSaveId(1_700_000_000_000)).toMatch(/^save-[a-z0-9]+$/);
    expect(newSaveId(1)).not.toBe(newSaveId(2));
  });

  it('keeps saves as JSON text in the desktop app', async () => {
    const files = new Map<string, string>();
    const backend = desktopBackend({
      folder: async () => '/saves',
      showFolder: async () => {},
      list: async () => [...files.keys()],
      read: async (id) => files.get(id) ?? null,
      write: async (id, text) => void files.set(id, text),
      remove: async (id) => void files.delete(id),
    });
    const state = game(4);
    await writeSave('save-a', 'On disk', state, backend);
    expect(JSON.parse(files.get('save-a')!)).toMatchObject({ version: SAVE_VERSION, name: 'On disk' });
    expect((await readSave('save-a', backend))?.state).toEqual(state);
    expect((await listSaves(backend))[0]).toMatchObject({ name: 'On disk', day: 4 });
    await deleteSave('save-a', backend);
    expect(files.size).toBe(0);
  });
});
