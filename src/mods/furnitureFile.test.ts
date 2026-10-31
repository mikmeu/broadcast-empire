import { describe, expect, it } from 'vitest';
import { BOOSTS, MODS } from '../config/balance';
import { FURNITURE, type BuiltInFurniture } from '../config/office';
import { FURNITURE_ASSETS } from '../office/assets';
import { FURNITURE_FORMAT, checkFurnitureFile, toFurnitureFile, minimumPrice, type ModFurniture } from './furnitureFile';

/** A GLB built from bytes: one mesh of `triangles` triangles, in the glTF of `extra` (merged over the defaults). */
function glb(triangles: number, extra: Record<string, unknown> = {}, binary = 12): Uint8Array {
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ count: 3 }, { count: triangles * 3 }],
    buffers: [{ byteLength: binary }],
    ...extra,
  });
  const padded = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, ' '));
  const bin = new Uint8Array(binary);
  const out = new Uint8Array(12 + 8 + padded.length + 8 + bin.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(padded, 20);
  view.setUint32(20 + padded.length, bin.length, true);
  view.setUint32(24 + padded.length, 0x004e4942, true);
  out.set(bin, 28 + padded.length);
  return out;
}

const piece = (): ModFurniture => ({
  id: 'test-stool',
  spec: { name: 'Test stool', about: 'A stool for the tests.', note: 'Low', cost: 120, w: 1, h: 1, rooms: ['office', 'canteen'], durable: true, comfort: true, boosts: [{ kind: 'dirt', amount: 0.1 }] },
  asset: {
    parts: [
      { box: [0.5, 0.1, 0.5], tone: 'wood', at: [0.25, 0.4, 0.25] },
      { cylinder: [0.04, 0.4], tone: 'metal', at: [0.5, 0, 0.5] },
      { model: 'chair', tones: { wood: 'fabric' }, at: [0.5, 0, 0.5], size: 0.5 },
      { parts: [{ box: [0.1, 0.1, 0.1], tone: 'accent', at: [0, 0, 0] }], at: [0.5, 0.5, 0.5], tilt: 5 },
    ],
    spots: [{ at: [0.5, 0.5], turn: 1, activity: 'sit' }],
  },
});

/** The file of the good piece, changed by `edit`, and what the checker says. */
const checkEdited = (edit: (file: Record<string, any>) => void) => {
  const file = JSON.parse(toFurnitureFile(piece()));
  edit(file);
  return checkFurnitureFile(JSON.stringify(file));
};
const reason = (result: ReturnType<typeof checkFurnitureFile>) => (result.ok ? 'accepted' : result.reason);

describe('the furniture file', () => {
  it('round-trips a good piece', () => {
    const result = checkFurnitureFile(toFurnitureFile(piece()));
    expect(result).toEqual({ ok: true, piece: piece() });
  });

  it('round-trips a piece with a model of its own', () => {
    const model = glb(12);
    const result = checkFurnitureFile(toFurnitureFile({ ...piece(), glb: model }));
    expect(result.ok && result.piece.glb).toEqual(model);
  });

  it('writes the format number', () => {
    expect(JSON.parse(toFurnitureFile(piece())).format).toBe(FURNITURE_FORMAT);
  });

  it('holds every piece the game has', () => {
    for (const type of Object.keys(FURNITURE) as BuiltInFurniture[]) {
      const { name, about, note, cost, w, h, rooms, durable, comfort, boosts } = FURNITURE[type];
      const result = checkFurnitureFile(toFurnitureFile({ id: 'built-in', spec: { name, about, note, cost, w, h, rooms, durable, comfort, boosts }, asset: FURNITURE_ASSETS[type] }));
      expect(reason(result), type).toBe('accepted');
      if (result.ok) expect(result.piece.asset, type).toEqual(FURNITURE_ASSETS[type]);
    }
  });

  describe('rejects', () => {
    it('text that is not JSON, and JSON that is not a furniture file', () => {
      expect(reason(checkFurnitureFile('{nope'))).toBe('The file is not JSON.');
      expect(reason(checkFurnitureFile('[]'))).toBe('The file is not a furniture file.');
      expect(reason(checkEdited((f) => delete f.format))).toMatch(/no format number/);
    });

    it('a newer format, saying so', () => {
      expect(reason(checkEdited((f) => (f.format = FURNITURE_FORMAT + 1)))).toMatch(/newer version of the game/);
    });

    it('a bad id, name, size, price or room', () => {
      expect(reason(checkEdited((f) => (f.id = '../etc')))).toMatch(/The id must be/);
      expect(reason(checkEdited((f) => (f.spec.name = '')))).toMatch(/needs a name/);
      expect(reason(checkEdited((f) => (f.spec.w = MODS.maxTiles + 1)))).toMatch(/width must be a whole number of tiles from 1 to 4/);
      expect(reason(checkEdited((f) => (f.spec.h = 1.5)))).toMatch(/depth must be a whole number/);
      expect(reason(checkEdited((f) => (f.spec.cost = 0)))).toMatch(/price must be a whole number from 1 to 50,000/);
      expect(reason(checkEdited((f) => (f.spec.cost = 50_001)))).toMatch(/price must be/);
      expect(reason(checkEdited((f) => (f.spec.rooms = ['moonbase'])))).toBe('“moonbase” is not a room the game knows.');
      expect(reason(checkEdited((f) => (f.spec.rooms = [])))).toMatch(/at least one room/);
    });

    it('parts the game cannot draw', () => {
      expect(reason(checkEdited((f) => (f.asset.parts[0].tone = 'pink')))).toMatch(/color the game does not know \(pink\)/);
      expect(reason(checkEdited((f) => (f.asset.parts[2].model = 'ufo')))).toMatch(/model the game does not have \(ufo\)/);
      expect(reason(checkEdited((f) => (f.asset.parts[0].box = [1, 1])))).toMatch(/must be 3 numbers/);
      expect(reason(checkEdited((f) => (f.asset.parts[0].at = [Number.NaN, 0, 0])))).toMatch(/must be 3 numbers/);
      expect(reason(checkEdited((f) => (f.asset.parts[0].at = [9, 0, 0])))).toMatch(/Part 1 stands outside the piece/);
      expect(reason(checkEdited((f) => (f.asset.parts[0] = { at: [0, 0, 0] })))).toMatch(/not a model, a box/);
      expect(reason(checkEdited((f) => (f.asset.parts[0] = { glb: 'app://game/x.glb', at: [0, 0, 0] })))).toMatch(/goes in the file itself/);
    });

    it('too many parts, and parts nested too deep', () => {
      expect(reason(checkEdited((f) => (f.asset.parts = Array.from({ length: MODS.parts + 1 }, () => ({ box: [0.1, 0.1, 0.1], tone: 'wood', at: [0, 0, 0] })))))).toBe(`The piece has more than ${MODS.parts} parts.`);
      let nested: Record<string, unknown> = { box: [0.1, 0.1, 0.1], tone: 'wood', at: [0, 0, 0] };
      for (let i = 0; i < 6; i++) nested = { parts: [nested], at: [0, 0, 0] };
      expect(reason(checkEdited((f) => (f.asset.parts = [nested])))).toMatch(/more than 4 deep/);
    });

    it('places that are wrong or too many', () => {
      expect(reason(checkEdited((f) => (f.asset.spots[0].activity = 'fly')))).toMatch(/activity the game does not know \(fly\)/);
      expect(reason(checkEdited((f) => (f.asset.spots[0].at = [7, 0])))).toMatch(/Place 1 is outside the piece/);
      expect(reason(checkEdited((f) => (f.asset.spots = Array.from({ length: MODS.spots + 1 }, () => f.asset.spots[0]))))).toBe(`The piece has ${MODS.spots + 1} places for people; at most ${MODS.spots} fit.`);
    });

    it('boosts of a kind the game lacks or stronger than the strongest it has', () => {
      expect(reason(checkEdited((f) => (f.spec.boosts = [{ kind: 'money', amount: 1 }])))).toMatch(/kind the game does not know/);
      expect(reason(checkEdited((f) => (f.spec.boosts = [{ kind: 'dirt', amount: 0.9 }])))).toBe('Boost 1 gives 0.9; at most 0.2 is allowed for this kind of boost.');
      // 50% dirt is only for a named room type; any room is capped at the bin's 20%.
      expect(reason(checkEdited((f) => { f.spec.cost = 5_000; f.spec.boosts = [{ kind: 'dirt', amount: 0.5, roomType: 'canteen' }]; }))).toBe('accepted');
      expect(reason(checkEdited((f) => (f.spec.boosts = [{ kind: 'dirt', amount: 0.5 }])))).toMatch(/at most 0.2/);
      expect(reason(checkEdited((f) => (f.spec.boosts = [{ kind: 'dirt', amount: -1 }])))).toMatch(/amount above 0/);
      expect(reason(checkEdited((f) => (f.spec.boosts = [{ kind: 'skill', role: 'wizard', amount: 0.05 }])))).toMatch(/role the game does not know/);
      expect(reason(checkEdited((f) => (f.spec.boosts = [{ kind: 'genreQuality', genres: ['polka'], amount: 0.05 }])))).toMatch(/genres the game knows/);
    });
  });

  describe('the new kinds of boost', () => {
    const boosted = (cost: number, boosts: unknown[]) => checkEdited((f) => { f.spec.cost = cost; f.spec.boosts = boosts; });

    it('accepts each kind at its most, at its lowest price', () => {
      expect(reason(boosted(600, [{ kind: 'morale', amount: BOOSTS.moraleRoom.max, reach: 'room' }]))).toBe('accepted');
      expect(reason(boosted(2_000, [{ kind: 'morale', amount: BOOSTS.moraleFloor.max, reach: 'floor' }]))).toBe('accepted');
      expect(reason(boosted(2_000, [{ kind: 'wear', amount: BOOSTS.wear.max }]))).toBe('accepted');
      expect(reason(boosted(3_000, [{ kind: 'audience', amount: BOOSTS.audience.max }]))).toBe('accepted');
      expect(reason(boosted(100, [{ kind: 'skill', role: 'writer', amount: 0.05 }]))).toBe('accepted');
    });

    it('refuses more than the most, and a morale boost that reaches nowhere', () => {
      expect(reason(boosted(9_000, [{ kind: 'morale', amount: 1.5, reach: 'floor' }]))).toMatch(/gives 1.5; at most 1 is allowed/);
      expect(reason(boosted(9_000, [{ kind: 'morale', amount: 3, reach: 'room' }]))).toMatch(/at most 2/);
      expect(reason(boosted(9_000, [{ kind: 'wear', amount: 0.6 }]))).toMatch(/at most 0.25/);
      expect(reason(boosted(9_000, [{ kind: 'audience', amount: 0.1 }]))).toMatch(/at most 0.05/);
      expect(reason(boosted(9_000, [{ kind: 'morale', amount: 1 }]))).toMatch(/room or the floor/);
    });

    it('refuses a genre boost that names more genres than the record shelves do', () => {
      expect(reason(boosted(9_000, [{ kind: 'genreQuality', genres: ['top40', 'rock', 'news'], amount: 0.05 }]))).toBe('accepted');
      expect(reason(boosted(9_000, [{ kind: 'genreQuality', genres: ['top40', 'rock', 'news', 'sitcom'], amount: 0.05 }]))).toBe('Boost 1 names 4 genres; at most 3 are allowed.');
    });

    it('refuses a price under the minimum, and adds the boosts up', () => {
      expect(reason(boosted(1_999, [{ kind: 'wear', amount: 0.25 }]))).toBe('With these boosts the piece costs at least €2,000.');
      expect(reason(boosted(1_000, [{ kind: 'wear', amount: 0.125 }]))).toBe('accepted');
      const both = [{ kind: 'wear', amount: 0.25 }, { kind: 'audience', amount: 0.05 }];
      expect(reason(boosted(4_999, both))).toBe('With these boosts the piece costs at least €5,000.');
      expect(reason(boosted(5_000, both))).toBe('accepted');
    });

    it('refuses two boosts of the same kind, but not two skills for different roles', () => {
      expect(reason(boosted(9_000, [{ kind: 'morale', amount: 1, reach: 'room' }, { kind: 'morale', amount: 2, reach: 'room' }]))).toMatch(/two boosts of the same kind/);
      expect(reason(boosted(9_000, [{ kind: 'morale', amount: 1, reach: 'room' }, { kind: 'morale', amount: 1, reach: 'floor' }]))).toBe('accepted');
      expect(reason(boosted(9_000, [{ kind: 'skill', role: 'writer', amount: 0.05 }, { kind: 'skill', role: 'editor', amount: 0.05 }]))).toBe('accepted');
    });

    it('every limit has a price, and every piece of the game sits on its floor', () => {
      for (const [name, limit] of Object.entries(BOOSTS)) expect(limit.minCost, name).toBeGreaterThan(0);
      for (const type of Object.keys(FURNITURE) as BuiltInFurniture[]) {
        const { boosts, cost } = FURNITURE[type];
        if (boosts) expect(cost, type).toBeGreaterThanOrEqual(minimumPrice(boosts));
      }
    });
  });

  describe('the model', () => {
    const withModel = (bytes: Uint8Array) => checkEdited((f) => (f.glb = Buffer.from(bytes).toString('base64')));

    it('is accepted when it is plain and small', () => {
      expect(reason(withModel(glb(MODS.triangles)))).toBe('accepted');
    });

    it('is refused with too many triangles, saying how many', () => {
      expect(reason(withModel(glb(31_000)))).toBe('The model has 31,000 triangles; at most 20,000 fit.');
    });

    it('counts a mesh once for every node that uses it, and strips and fans', () => {
      expect(reason(withModel(glb(12_000, { nodes: [{ mesh: 0 }, { mesh: 0 }] })))).toMatch(/24,000 triangles/);
      const strip = glb(0, { meshes: [{ primitives: [{ mode: 5, attributes: { POSITION: 0 } }] }], accessors: [{ count: 30_000 }] });
      expect(reason(withModel(strip))).toMatch(/29,998 triangles/);
      expect(reason(withModel(glb(0, { meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ count: 60_003 }] })))).toMatch(/20,001 triangles/);
    });

    it('is refused when it is not a GLB, is cut short or is another version', () => {
      expect(reason(checkEdited((f) => (f.glb = Buffer.from('hello, I am a picture').toString('base64'))))).toBe('The model is not a GLB file.');
      expect(reason(withModel(glb(3).subarray(0, 40)))).toMatch(/cut short/);
      const v1 = glb(3);
      new DataView(v1.buffer).setUint32(4, 1, true);
      expect(reason(withModel(v1))).toBe('The model is not glTF version 2.');
      expect(reason(checkEdited((f) => (f.glb = '!!!')))).toBe('The model is not base64 text.');
    });

    it('is refused when it loads something from outside, or needs a decoder', () => {
      expect(reason(withModel(glb(3, { buffers: [{ byteLength: 1, uri: 'https://example.com/x.bin' }] })))).toMatch(/loads parts of itself from elsewhere/);
      expect(reason(withModel(glb(3, { images: [{ uri: 'texture.png' }] })))).toMatch(/loads parts of itself from elsewhere/);
      expect(reason(withModel(glb(3, { extensionsUsed: ['KHR_draco_mesh_compression'], extensionsRequired: ['KHR_draco_mesh_compression'] })))).toMatch(/compressed/);
      expect(reason(withModel(glb(3, { extensionsRequired: ['VENDOR_magic'] })))).toMatch(/needs “VENDOR_magic”/);
      expect(reason(withModel(glb(3, { extensionsRequired: ['KHR_materials_unlit'] })))).toBe('accepted');
    });

    it('is refused when a mesh points at nothing, or when there is nothing to draw', () => {
      expect(reason(withModel(glb(3, { accessors: [] })))).toMatch(/points at data that is not there/);
      expect(reason(withModel(glb(0)))).toBe('The model has nothing to draw.');
    });

    it('is refused when it is too big', () => {
      expect(reason(withModel(glb(3, {}, MODS.modelBytes)))).toMatch(/at most 5 MB|bigger than 5 MB/);
    });
  });

  it('is refused when the whole file is too big', () => {
    expect(reason(checkFurnitureFile(' '.repeat(MODS.fileBytes + 1)))).toBe('The file is bigger than 8 MB.');
  });
});
