// The mods folder of the desktop app (electron/mods.cjs): where a name from the page may lead, and where it may not.

import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { MODS } from '../config/balance';

const require = createRequire(import.meta.url);
const { LIMITS, MOD_ID, createMods, modPath, resolveServed } = require('../../electron/mods.cjs');

let root: string;
beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), 'mods-')), 'mods');
  mkdirSync(join(root, 'furniture', 'stool'), { recursive: true });
  writeFileSync(join(root, 'furniture', 'stool', 'piece.json'), '{}');
  writeFileSync(join(root, 'furniture', 'stool', 'model.glb'), 'glTF');
});

describe('the limits', () => {
  it('are the ones in balance.ts', () => {
    expect(LIMITS).toEqual({ fileBytes: MODS.fileBytes, modelBytes: MODS.modelBytes });
  });
});

describe('modPath', () => {
  it('names the files of a piece', () => {
    expect(modPath(root, 'furniture', 'stool', 'piece.json')).toBe(join(root, 'furniture', 'stool', 'piece.json'));
  });

  it('refuses a kind, an id or a file that is not allowed', () => {
    expect(() => modPath(root, 'maps', 'stool', 'piece.json')).toThrow();
    expect(() => modPath(root, '..', 'stool', 'piece.json')).toThrow();
    for (const id of ['', '..', '../x', 'a/b', 'a\\b', 'A', '-a', 'a'.repeat(65), 'a b', undefined, 5]) expect(() => modPath(root, 'furniture', id, 'piece.json'), String(id)).toThrow();
    expect(() => modPath(root, 'furniture', 'stool', 'other.json')).toThrow();
    expect(() => modPath(root, 'furniture', 'stool', '../piece.json')).toThrow();
  });

  it('has the same ids as the save files', () => {
    expect(MOD_ID.source).toBe('^[a-z0-9][a-z0-9-]{0,63}$');
  });
});

describe('resolveServed', () => {
  it('finds a file of a piece', async () => {
    const found = await resolveServed(root, '/mods/furniture/stool/model.glb');
    expect(found?.endsWith(join('furniture', 'stool', 'model.glb'))).toBe(true);
  });

  it('finds nothing outside the folder', async () => {
    writeFileSync(join(root, '..', 'secret.json'), 'secret');
    for (const path of [
      '/mods/furniture/stool/../../../secret.json',
      '/mods/furniture/%2e%2e/%2e%2e/secret.json',
      '/mods/furniture/stool%2f..%2f..%2f..%2fsecret.json',
      '/mods/furniture/stool/..%5c..%5csecret.json',
      '/mods/furniture\\stool\\piece.json',
      '/mods/../secret.json',
      '/mods/furniture/stool/piece.json/',
      '/mods/furniture/stool/other.json',
      '/mods/furniture/stool',
      '/mods/maps/stool/piece.json',
      '/mods/furniture/stool/piece.json%00.png',
      '/mods/furniture/%E0%A4%A/piece.json',
      '/other/furniture/stool/piece.json',
      '/mods/',
    ]) {
      expect(await resolveServed(root, path), path).toBeNull();
    }
  });

  it('finds nothing for a file that is not there', async () => {
    expect(await resolveServed(root, '/mods/furniture/gone/piece.json')).toBeNull();
  });

  it('does not follow a link out of the folder', async () => {
    const outside = join(root, '..', 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'secret.glb'), 'secret');
    mkdirSync(join(root, 'furniture', 'sly'));
    symlinkSync(join(outside, 'secret.glb'), join(root, 'furniture', 'sly', 'model.glb'));
    expect(await resolveServed(root, '/mods/furniture/sly/model.glb')).toBeNull();
    symlinkSync(outside, join(root, 'furniture', 'linked'));
    expect(await resolveServed(root, '/mods/furniture/linked/secret.glb')).toBeNull();
  });
});

describe('the calls', () => {
  it('list the pieces that have a piece.json', async () => {
    mkdirSync(join(root, 'furniture', 'empty'));
    mkdirSync(join(root, 'furniture', 'Not An Id'));
    writeFileSync(join(root, 'furniture', 'loose.json'), '{}');
    expect(await createMods(root).list('furniture')).toEqual(['stool']);
    expect(await createMods(join(root, 'nowhere')).list('furniture')).toEqual([]);
    await expect(createMods(root).list('maps')).rejects.toThrow();
  });

  it('read a piece and whether it has a model, or null', async () => {
    const mods = createMods(root);
    expect(await mods.read('furniture', 'stool')).toEqual({ text: '{}', model: true });
    expect(await mods.read('furniture', 'gone')).toBeNull();
    await expect(mods.read('furniture', '../stool')).rejects.toThrow();
  });

  it('write a piece, with its model or without, and remove it', async () => {
    const mods = createMods(root);
    await mods.write('furniture', 'new-one', '{"a":1}', new Uint8Array([1, 2, 3]));
    expect(await mods.read('furniture', 'new-one')).toEqual({ text: '{"a":1}', model: true });
    await mods.write('furniture', 'new-one', '{"a":2}');
    expect(await mods.read('furniture', 'new-one')).toEqual({ text: '{"a":2}', model: false });
    await mods.remove('furniture', 'new-one');
    expect(await mods.list('furniture')).toEqual(['stool']);
  });

  it('write nothing that is bigger than the limits or the wrong kind of thing', async () => {
    const mods = createMods(root);
    await expect(mods.write('furniture', 'big', 'x'.repeat(LIMITS.fileBytes + 1))).rejects.toThrow();
    await expect(mods.write('furniture', 'big', '{}', new Uint8Array(LIMITS.modelBytes + 1))).rejects.toThrow();
    await expect(mods.write('furniture', 'big', 5)).rejects.toThrow();
    await expect(mods.write('furniture', 'big', '{}', 'not bytes')).rejects.toThrow();
    await expect(mods.write('furniture', '../big', '{}')).rejects.toThrow();
    expect(await mods.list('furniture')).toEqual(['stool']);
  });
});
