import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, SaveError } from '../sim/save';
import { createInitialState } from '../sim/newGame';
import { advance } from '../sim/tick';
import { AUTOSAVE, SAVE_SLOTS, deleteSave, desktopBackend, firstEmptySlot, listSaves, readLatestSave, readSave, slotId, slotNumber, writeSave, type SaveBackend } from './storage';

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
    await writeSave('slot-1', 'Before the auction', state, backend);
    const save = await readSave('slot-1', backend);
    expect(save?.state).toEqual(state);
    expect(save?.version).toBe(SAVE_VERSION);
    expect(await readSave('nothing-here', backend)).toBeUndefined();
  });

  it('lists every save newest first, with its name, game day and money', async () => {
    const backend = memoryBackend();
    await writeSave('slot-1', 'First', game(3), backend);
    await writeSave(AUTOSAVE, 'Autosave', game(40), backend);
    // Saves made in the same millisecond keep an order; give these their own times.
    backend.records.set('slot-1', { ...(backend.records.get('slot-1') as object), savedAt: 1000 });
    backend.records.set(AUTOSAVE, { ...(backend.records.get(AUTOSAVE) as object), savedAt: 2000 });

    const list = await listSaves(backend);
    expect(list.map((s) => s.id)).toEqual([AUTOSAVE, 'slot-1']);
    expect(list[0]).toMatchObject({ name: 'Autosave', auto: true, day: 40, savedAt: 2000 });
    expect(list[1]).toMatchObject({ name: 'First', auto: false, day: 3, money: game(3).money });
    expect(list.every((s) => s.problem === undefined)).toBe(true);
  });

  it('overwrites a slot and deletes one', async () => {
    const backend = memoryBackend();
    await writeSave('slot-1', 'Mine', game(1), backend);
    await writeSave('slot-1', 'Mine, later', game(9), backend);
    expect(await listSaves(backend)).toHaveLength(1);
    expect((await listSaves(backend))[0]).toMatchObject({ name: 'Mine, later', day: 9 });
    await deleteSave('slot-1', backend);
    expect(await listSaves(backend)).toEqual([]);
  });

  it('still loads the single save of the game before save slots', async () => {
    const state = game(5);
    const backend = memoryBackend(new Map<string, unknown>([['manual', { version: SAVE_VERSION, savedAt: 500, state }]]));
    // It moves into slot 1 when the list is first read.
    expect((await listSaves(backend))[0]).toMatchObject({ id: 'slot-1', name: 'Saved game', auto: false, day: 5 });
    expect((await readLatestSave(backend))?.save.state).toEqual(state);
  });

  it('shows a broken save with its problem, and continues from the newest one that loads', async () => {
    const backend = memoryBackend();
    await writeSave('slot-1', 'Good', game(7), backend);
    backend.records.set('slot-1', { ...(backend.records.get('slot-1') as object), savedAt: 1000 });
    backend.records.set('slot-2', { version: SAVE_VERSION + 1, savedAt: 3000, name: 'From the future', state: { day: 99, money: 1 } });
    backend.records.set('slot-3', 'not a save');
    backend.records.set('slot-4', { version: SAVE_VERSION, savedAt: 2000, name: 'Broken', state: { day: 1 } });

    const list = await listSaves(backend);
    expect(list.find((s) => s.id === 'slot-2')?.problem).toMatch(/newer version/);
    expect(list.find((s) => s.id === 'slot-3')?.problem).toMatch(/not a Broadcast Empire save/);
    // A save that looks right in the list can still fail when it is loaded.
    expect(list.find((s) => s.id === 'slot-4')?.problem).toBeUndefined();
    await expect(readSave('slot-4', backend)).rejects.toThrow(SaveError);

    const latest = await readLatestSave(backend);
    expect(latest?.info.id).toBe('slot-1');
    expect(await readLatestSave(memoryBackend())).toBeUndefined();
  });

  it('has ten slots with ids that are safe as file names', () => {
    expect(SAVE_SLOTS).toBe(10);
    for (let n = 1; n <= SAVE_SLOTS; n++) expect(slotNumber(slotId(n))).toBe(n);
    expect(slotId(10)).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    expect(slotNumber('slot-11')).toBeUndefined();
    expect(slotNumber(AUTOSAVE)).toBeUndefined();
    expect(slotNumber('save-abc')).toBeUndefined();
  });

  it('finds the first empty slot, and none when all ten are full', async () => {
    const backend = memoryBackend();
    expect(firstEmptySlot(await listSaves(backend))).toBe('slot-1');
    await writeSave('slot-1', 'A', game(1), backend);
    await writeSave('slot-3', 'C', game(1), backend);
    expect(firstEmptySlot(await listSaves(backend))).toBe('slot-2');
    for (let n = 1; n <= SAVE_SLOTS; n++) await writeSave(slotId(n), `S${n}`, game(1), backend);
    expect(firstEmptySlot(await listSaves(backend))).toBeUndefined();
  });

  it('moves saves from before the slots into empty slots, newest first, and keeps the rest', async () => {
    const records = new Map<string, unknown>();
    const record = (savedAt: number, name: string) => ({ version: SAVE_VERSION, savedAt, name, state: game(1) });
    records.set('slot-1', record(5, 'Already here'));
    for (let i = 0; i < 10; i++) records.set(`save-${i}`, record(100 + i, `Old ${i}`));
    const backend = memoryBackend(records);

    const list = await listSaves(backend);
    // Nine slots were free: the nine newest moved, in order; the oldest stays.
    expect(backend.records.get('slot-2')).toMatchObject({ name: 'Old 9' });
    expect(backend.records.get('slot-10')).toMatchObject({ name: 'Old 1' });
    expect(backend.records.has('save-0')).toBe(true);
    expect(backend.records.has('save-9')).toBe(false);
    expect(list).toHaveLength(11);
    expect(list.filter((s) => slotNumber(s.id) === undefined && !s.auto).map((s) => s.id)).toEqual(['save-0']);
  });

  it('writes the copy before it removes the original of an old save', async () => {
    const calls: string[] = [];
    const inner = memoryBackend(new Map<string, unknown>([['manual', { version: SAVE_VERSION, savedAt: 1, state: game(2) }]]));
    const backend: SaveBackend = {
      ...inner,
      write: async (id, record) => {
        calls.push(`write ${id}`);
        await inner.write(id, record);
      },
      remove: async (id) => {
        calls.push(`remove ${id}`);
        await inner.remove(id);
      },
    };
    await listSaves(backend);
    expect(calls).toEqual(['write slot-1', 'remove manual']);
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
    await writeSave('slot-1', 'On disk', state, backend);
    expect(JSON.parse(files.get('slot-1')!)).toMatchObject({ version: SAVE_VERSION, name: 'On disk' });
    expect((await readSave('slot-1', backend))?.state).toEqual(state);
    expect((await listSaves(backend))[0]).toMatchObject({ name: 'On disk', day: 4 });
    await deleteSave('slot-1', backend);
    expect(files.size).toBe(0);
  });
});
