import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BODIES, BODY_IDS, FEATURES, FEATURE_COLORS, SWATCHES, SWATCH_GRID, bodyFile, cleanLook, colorOf, defaultLook, isLook, type BodyId, type Look, type SwatchId } from '../config/looks';
import { CHARACTERS } from '../office/assets';
import { CEO_ID, beatOfHour, peopleOnFloor, whereabouts } from '../office/layout';
import { partOf, restyle, swatchAt, type BodyPart, type Shape } from '../office/looks';
import { buildRoom, setLook, type ActionResult } from './actions';
import { autoPlaceFurniture } from './fixtures';
import { sensibleBot } from './bots';
import { createInitialState } from './newGame';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const keyOf = (id: SwatchId) => SWATCHES[id].row * SWATCH_GRID.cols + SWATCHES[id].col;

/** One part of a character's model as its file has it: an attribute of its points, or the triangles. */
function readModel(body: BodyId, read: (attributes: Record<string, number>, primitive: { indices?: number }) => number | undefined): Record<BodyPart, number[]> {
  const file = readFileSync(`public/models/${bodyFile(body)}`);
  const jsonLength = file.readUInt32LE(12);
  const doc = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8'));
  const bin = file.subarray(20 + jsonLength + 8);
  const sizes: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3 };
  const parts: Partial<Record<BodyPart, number[]>> = {};
  for (const node of doc.nodes) {
    const part = node.mesh === undefined ? null : partOf(node.name);
    if (!part) continue;
    const primitive = doc.meshes[node.mesh].primitives[0];
    const accessor = doc.accessors[read(primitive.attributes, primitive)!];
    const view = doc.bufferViews[accessor.bufferView];
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const n = sizes[accessor.type]!;
    const bytes = accessor.componentType === 5123 ? 2 : 4;
    const stride = view.byteStride ?? n * bytes;
    const at = (o: number) => (accessor.componentType === 5126 ? bin.readFloatLE(o) : accessor.componentType === 5125 ? bin.readUInt32LE(o) : bin.readUInt16LE(o));
    parts[part] = Array.from({ length: accessor.count * n }, (_, i) => at(offset + Math.floor(i / n) * stride + (i % n) * bytes));
  }
  return parts as Record<BodyPart, number[]>;
}

/** The texture coordinates of the head and the body of a character's model, read from its file. */
function modelOf(body: BodyId): Record<BodyPart, Float32Array> {
  const uv = readModel(body, (a) => a.TEXCOORD_0);
  return { head: Float32Array.from(uv.head), body: Float32Array.from(uv.body) };
}

/** The shape of the head and the body of a character's model, read from its file. */
function shapeOf(body: BodyId): Record<BodyPart, Shape> {
  const position = readModel(body, (a) => a.POSITION);
  const index = readModel(body, (_, p) => p.indices);
  return { head: { position: position.head, index: index.head }, body: { position: position.body, index: index.body } };
}

/**
 * Whether a point of the head is on the front of the face between the mouth
 * and the top of the eyes, where they are on every character; the hairline
 * starts just above (0.514 on male-a).
 */
const onFace = (position: ArrayLike<number>, point: number) =>
  Math.abs(position[point * 3]!) < 0.12 && position[point * 3 + 1]! > 0.4 && position[point * 3 + 1]! < 0.512 && position[point * 3 + 2]! > 0.15;

/**
 * The characters whose eyes and mouth are painted from their hair's swatch,
 * with how many points they are: two eyes and a mouth (#61). These are the
 * black-haired ones.
 */
const FACE_IN_HAIR_COLOR: Partial<Record<BodyId, number>> = { 'female-a': 26, 'female-e': 26, 'male-a': 26, 'male-f': 22 };

/** How many points of a part are painted from each swatch. */
function count(uv: ArrayLike<number>): Map<number, number> {
  const seen = new Map<number, number>();
  for (let i = 0; i < uv.length; i += 2) seen.set(swatchAt(uv[i]!, uv[i + 1]!), (seen.get(swatchAt(uv[i]!, uv[i + 1]!)) ?? 0) + 1);
  return seen;
}

describe('the characters to choose from (Phase 11d)', () => {
  it('are the people of the office, each with its model file', () => {
    expect(BODY_IDS.map(bodyFile).sort()).toEqual([...CHARACTERS.female, ...CHARACTERS.male].sort());
    for (const body of BODY_IDS) expect(existsSync(`public/models/${bodyFile(body)}`), body).toBe(true);
  });

  it('are painted the way the list says: skin and hair on the head, clothes on the body', () => {
    for (const body of BODY_IDS) {
      const model = modelOf(body);
      const own = BODIES[body];
      const [head, rest] = [count(model.head), count(model.body)];
      expect(head.get(keyOf(own.skin)), `${body} face`).toBeGreaterThan(100);
      expect(head.get(keyOf(own.hair)), `${body} hair`).toBeGreaterThan(100);
      expect(rest.get(keyOf(own.outfit)), `${body} clothes`).toBeGreaterThan(100);
      // Three different swatches, or one color could not be changed without another.
      expect(new Set([own.skin, own.hair]).size).toBe(2);
      expect(new Set([own.skin, own.outfit]).size).toBe(2);
    }
  });

  it('offer colors that are all in the picture, each on a swatch of its own', () => {
    const places = Object.values(SWATCHES).map((s) => `${s.row}:${s.col}`);
    expect(new Set(places).size).toBe(places.length);
    for (const s of Object.values(SWATCHES)) {
      expect(s.row).toBeLessThan(SWATCH_GRID.rows);
      expect(s.col).toBeLessThan(SWATCH_GRID.cols);
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const feature of FEATURES) {
      expect(new Set(FEATURE_COLORS[feature]).size).toBe(FEATURE_COLORS[feature].length);
      // Whatever a character comes with can be chosen for another.
      for (const body of BODY_IDS) expect(FEATURE_COLORS[feature], `${body} ${feature}`).toContain(BODIES[body][feature]);
    }
  });
});

describe('recoloring a character (Phase 11d)', () => {
  it('leaves a character alone when its look changes nothing', () => {
    for (const body of BODY_IDS) {
      const model = modelOf(body);
      const shape = shapeOf(body);
      const own = BODIES[body];
      expect(restyle('head', model.head, { body, skin: null, hair: null, outfit: null }, shape.head)).toBeNull();
      expect(restyle('body', model.body, { body, ...own }, shape.body)).toBeNull();
      // Hair is not on the body, clothes are not on the head.
      expect(restyle('body', model.body, { body, skin: null, hair: 'pink', outfit: null }, shape.body)).toBeNull();
      expect(restyle('head', model.head, { body, skin: null, hair: null, outfit: 'pink' }, shape.head)).toBeNull();
    }
  });

  it('keeps the eyes and the mouth their own color whatever the hair is (#61)', () => {
    // Characters 1, 5 and 11 in the creator, as the player saw it, and character 7, black-haired too.
    for (const body of ['female-a', 'female-e', 'male-a', 'male-f'] as const) {
      const before = modelOf(body).head;
      const shape = shapeOf(body).head;
      const black = keyOf(BODIES[body].hair);
      for (const hair of FEATURE_COLORS.hair.filter((c) => c !== BODIES[body].hair)) {
        const after = restyle('head', before, { body, skin: null, hair, outfit: null }, shape)!;
        let eyes = 0;
        let moved = 0;
        for (let i = 0; i < before.length; i += 2) {
          if (swatchAt(before[i]!, before[i + 1]!) !== black) continue;
          if (onFace(shape.position, i / 2)) {
            eyes++;
            expect([after[i], after[i + 1]], `${body} ${hair}`).toEqual([before[i], before[i + 1]]);
          } else {
            moved++;
            expect(swatchAt(after[i]!, after[i + 1]!), `${body} ${hair}`).toBe(keyOf(hair));
          }
        }
        expect(eyes).toBe(FACE_IN_HAIR_COLOR[body]);
        expect(moved, `${body} ${hair}`).toBeGreaterThan(100);
      }
    }
  });

  it('moves every point of a part to the new color, and no other point', () => {
    for (const body of BODY_IDS) {
      const model = modelOf(body);
      const shape = shapeOf(body);
      const own = BODIES[body];
      // Three colors no character comes with.
      const look: Look = { body, skin: 'cream', hair: 'pink', outfit: 'purple' };
      for (const part of ['head', 'body'] as const) {
        const before = model[part];
        const after = restyle(part, before, look, shape[part])!;
        expect(after).toHaveLength(before.length);
        const feature = part === 'head' ? 'hair' : 'outfit';
        let moved = 0;
        let kept = 0;
        for (let i = 0; i < before.length; i += 2) {
          const was = swatchAt(before[i]!, before[i + 1]!);
          const is = swatchAt(after[i]!, after[i + 1]!);
          // The eyes and the mouth keep their color, even where it is the hair's (#61). A beard is hair.
          const face = part === 'head' && body in FACE_IN_HAIR_COLOR && was === keyOf(own.hair) && onFace(shape.head.position, i / 2);
          if (face) kept++;
          const to = was === keyOf(own.skin) ? look.skin! : was === keyOf(own[feature]) && !face ? look[feature]! : null;
          if (to) {
            moved++;
            expect(is).toBe(keyOf(to));
            // The same place within the swatch, so the shading stays.
            expect((after[i]! * SWATCH_GRID.cols) % 1).toBeCloseTo((before[i]! * SWATCH_GRID.cols) % 1, 4);
            expect((after[i + 1]! * SWATCH_GRID.rows) % 1).toBeCloseTo((before[i + 1]! * SWATCH_GRID.rows) % 1, 4);
          } else {
            expect([after[i], after[i + 1]]).toEqual([before[i], before[i + 1]]);
          }
        }
        expect(moved, `${body} ${part}`).toBeGreaterThan(100);
        if (part === 'head') expect(kept, `${body} eyes and mouth`).toBe(FACE_IN_HAIR_COLOR[body] ?? 0);
        // Nothing lands outside the picture.
        expect(after.every((n) => n >= 0 && n <= 1)).toBe(true);
      }
    }
  });
});

describe('the player’s look (Phase 11d)', () => {
  const setup = { playerName: 'Robin', companyName: 'Coax FM', headquarters: 'capital' as const };

  it('is part of a new game: the one chosen, or one that goes with the name', () => {
    const chosen: Look = { body: 'female-c', skin: 'brown', hair: 'pink', outfit: null };
    expect(createInitialState(1, 'normal', { ...setup, look: chosen }).look).toEqual(chosen);
    expect(createInitialState(1, 'normal', setup).look).toEqual(defaultLook('Robin'));
    expect(defaultLook('Robin')).toEqual(defaultLook('Robin'));
    expect(new Set(['Robin', 'Mik', 'Ada', 'Penny', 'Tabby', 'Olga', 'Sam'].map((name) => defaultLook(name).body)).size).toBeGreaterThan(2);
    expect(() => createInitialState(1, 'normal', { ...setup, look: { body: 'robot' } as unknown as Look })).toThrow();
  });

  it('keeps a color only where it differs from the character’s own', () => {
    const own = BODIES['male-a'];
    expect(cleanLook({ body: 'male-a', ...own })).toEqual({ body: 'male-a', skin: null, hair: null, outfit: null });
    expect(colorOf({ body: 'male-a', skin: null, hair: 'pink', outfit: null }, 'hair')).toBe('pink');
    expect(colorOf({ body: 'male-a', skin: null, hair: 'pink', outfit: null }, 'skin')).toBe(own.skin);
  });

  it('is only accepted if the game can show it', () => {
    expect(isLook({ body: 'male-a', skin: null, hair: null, outfit: null })).toBe(true);
    expect(isLook({ body: 'male-a', skin: 'cream', hair: 'green', outfit: 'pink' })).toBe(true);
    expect(isLook({ body: 'male-c', skin: null, hair: null, outfit: null })).toBe(false);
    expect(isLook({ body: 'male-a', skin: 'green', hair: null, outfit: null })).toBe(false);
    expect(isLook({ body: 'male-a', skin: null, hair: null })).toBe(false);
    expect(isLook(null)).toBe(false);
  });

  it('can be changed while playing', () => {
    const s = ok(setLook(createInitialState(1, 'normal', setup), { body: 'female-a', skin: null, hair: 'white', outfit: BODIES['female-a'].outfit }));
    expect(s.look).toEqual({ body: 'female-a', skin: null, hair: 'white', outfit: null });
    expect(setLook(s, { body: 'nobody' } as unknown as Look).ok).toBe(false);
  });

  it('is saved, and older saves get the look that goes with the player’s name', () => {
    const s = ok(setLook(createInitialState(3, 'normal', setup), { body: 'male-e', skin: 'brown', hair: null, outfit: 'red' }));
    const file = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
    expect(fromSaveFile(file).state.look).toEqual(s.look);
    const { look: _look, ...old } = file.state;
    const loaded = fromSaveFile({ ...file, version: 17, state: old });
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.state.look).toEqual(defaultLook('Robin'));
    expect(() => fromSaveFile({ ...file, state: { ...file.state, look: { body: 'robot' } } })).toThrow();
  });
});

describe('the CEO in the office (Phase 11d)', () => {
  const everyone = (s: GameState, beat?: number) => [1, 2, 3].flatMap((floor) => peopleOnFloor(s, floor, beat));
  const ceo = (s: GameState, beat?: number) => everyone(s, beat).filter((p) => p.role === 'ceo');

  it('is there from the first day, in the reception, under the player’s name', () => {
    const s = createInitialState(1, 'normal', { playerName: 'Robin', companyName: 'Coax FM', headquarters: 'capital' });
    expect(ceo(s)).toHaveLength(1);
    expect(ceo(s)[0]).toMatchObject({ id: CEO_ID, name: 'Robin', floor: 1, roomId: 'reception', activity: 'idle' });
    expect(whereabouts(s, ceo(s)[0]!)).toMatch(/^In the reception\./);
    // Only on the ground floor, and all through office hours.
    expect(peopleOnFloor(s, 2).some((p) => p.role === 'ceo')).toBe(false);
    for (const hour of [10, 12.5, 15, 16.75]) expect(ceo(s, beatOfHour(hour)).filter((p) => !p.away)).toHaveLength(1);
  });

  it('works at the desk in their own office, and stands in the reception until there is one (13f)', () => {
    // The test player's company without the office it builds itself (0.16.0).
    const bot = sensibleBot(createInitialState(1));
    let s: GameState = { ...bot, rooms: bot.rooms.filter((r) => r.type !== 'ceoOffice'), money: 1_000_000, floorsUnlocked: 3 };
    const office = s.rooms.find((r) => r.type === 'managementOffice')!;
    // A manager's desk that no manager needs is no longer the CEO's: they stand in the reception.
    s = ok(autoPlaceFurniture(s, office.roomId, 'managerDesk'));
    expect(ceo(s)[0]!.roomId).toBe('reception');
    expect(whereabouts(s, ceo(s)[0]!)).toMatch(/Build a CEO’s office/);

    const built = buildRoom(s, { floor: 2, x: 0, y: 0, w: 4, h: 5, door: { x: 2.5, z: 5 }, type: 'ceoOffice' });
    s = ok(built);
    const own = s.rooms.find((r) => r.type === 'ceoOffice')!;
    expect(ceo(s)[0]!.roomId).toBe('reception');
    s = ok(autoPlaceFurniture(s, own.roomId, 'ceoDesk'));
    const seated = ceo(s)[0]!;
    expect(seated).toMatchObject({ roomId: own.roomId, floor: 2, activity: 'sit' });
    expect(whereabouts(s, seated)).toBe('At your desk in your own office.');
    const others = everyone(s).filter((p) => p.role !== 'ceo');
    expect(others.some((p) => p.x === seated.x && p.z === seated.z)).toBe(false);
  });
});
