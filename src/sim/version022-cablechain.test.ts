import { describe, expect, it } from 'vitest';
import { cableChain, cables } from './control';
import { createInitialState } from './newGame';
import type { Furniture, GameState, RentedRoom } from './state';
import type { FurnitureType, RoomType } from '../config/office';
import { layoutChain } from '../ui/cableDiagram';

let n = 0;
const item = (type: FurnitureType): Furniture => ({ id: `f${++n}`, type, x: 0, y: 0, turn: 0, tier: 1, condition: 100, boughtOn: 0 });

/** A room at a place in the building, with its furniture, as the sim keeps it. */
function room(id: string, type: RoomType, floor: number, x: number, y: number, w: number, h: number, kit: FurnitureType[]): RentedRoom {
  return { roomId: id, name: id, type, floor, x, y, w, h, door: { x, z: y }, furniture: kit.map(item), cleanliness: 100, issue: null };
}

const tvKit: FurnitureType[] = ['camera', 'camera', 'studioLights', 'studioLights', 'newsDesk'];
const controlKit: FurnitureType[] = ['controlDesk', 'audioMixer'];
const mcrKit: FurnitureType[] = ['mcrDesk', 'monitorWall'];

function game(rooms: RentedRoom[], extra: Partial<GameState> = {}): GameState {
  return { ...structuredClone(createInitialState(1)), rooms, ...extra };
}
const onAir = () => true;
const ids = (c: ReturnType<typeof cableChain>) => c.links.map((l) => `${l.from}>${l.to}`);

describe('the chain of the cables (#371)', () => {
  const tv = () => [room('tv', 'tvNewsStudio', 1, 0, 0, 5, 5, tvKit), room('ctl', 'controlRoom', 1, 5, 0, 3, 5, controlKit), room('mcr', 'masterControl', 1, 8, 0, 3, 5, mcrKit)];

  it('a TV studio: each camera to the video mixer, both mixers to master control, then the antenna', () => {
    const s = game(tv());
    const chain = cableChain(s, onAir);
    const cams = s.rooms[0]!.furniture.filter((f) => f.type === 'camera').map((f) => `camera:${f.id}>video:ctl`);
    expect(ids(chain)).toEqual(['video:ctl>mcr:mcr', 'audio:ctl>mcr:mcr', ...cams, 'mcr:mcr>antenna']);
    expect(chain.points.some((p) => p.kind === 'dish')).toBe(false);
  });

  it('the dish comes with the uplink', () => {
    const chain = cableChain(game(tv(), { techs: ['satelliteUplink'] as GameState['techs'] }), onAir);
    expect(ids(chain)).toContain('mcr:mcr>dish');
  });

  it('without a master control room the units go to the antenna', () => {
    const chain = cableChain(game(tv().slice(0, 2)), onAir);
    expect(ids(chain).slice(0, 2)).toEqual(['video:ctl>antenna', 'audio:ctl>antenna']);
  });

  it('a missing unit is a marked point', () => {
    const rooms = tv();
    rooms[1]!.furniture = [];
    const chain = cableChain(game(rooms), onAir);
    expect(chain.points.filter((p) => p.missing).map((p) => p.kind)).toEqual(['video', 'audio']);
  });

  it('a radio studio is one point, or goes through the mixer it borrows', () => {
    const own = game([room('r', 'radioStudio', 1, 0, 0, 3, 3, ['mixingDesk', 'onAirLight']), room('mcr', 'masterControl', 1, 8, 0, 3, 5, mcrKit)]);
    expect(ids(cableChain(own, onAir))[0]).toBe('studio:r>mcr:mcr');
    const lent = game([room('r', 'radioStudio', 1, 0, 0, 3, 3, ['onAirLight']), room('ctl', 'controlRoom', 1, 3, 0, 3, 3, ['audioMixer']), room('mcr', 'masterControl', 1, 8, 0, 3, 5, mcrKit)]);
    const chain = cableChain(lent, onAir);
    const mixer = lent.rooms[1]!.furniture[0]!.id;
    expect(ids(chain).slice(0, 2)).toEqual([`studio:r>audio:${mixer}`, `audio:${mixer}>mcr:mcr`]);
  });

  it('a weather studio sends its camera to the video mixer of the news studio it serves', () => {
    const weather = room('w', 'weatherStudio', 1, 0, 5, 3, 5, ['greenScreen', 'weatherDesk', 'camera', 'studioLights']);
    const s = game([...tv(), weather]);
    const camera = weather.furniture.find((f) => f.type === 'camera')!.id;
    expect(ids(cableChain(s, onAir))).toContain(`camera:${camera}>video:ctl`);
  });

  it('every line has the colour of the cable of its room', () => {
    const s = game(tv());
    const list = cables(s, onAir);
    const chain = cableChain(s, onAir);
    const control = list.find((c) => c.from === 'ctl')!.status;
    const master = list.find((c) => c.from === 'mcr')!.status;
    for (const link of chain.links) expect(link.status).toBe(link.from.startsWith('mcr:') ? master : control);
  });

  it('nothing is drawn with no cables', () => {
    expect(cableChain(game([]), onAir)).toEqual({ points: [], links: [] });
  });
});

describe('the layout of the drawing (#371)', () => {
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  function building(floors: number, studios: number) {
    const rooms: RentedRoom[] = [room('mcr', 'masterControl', 1, 40, 0, 3, 5, mcrKit)];
    for (let f = 1; f <= floors; f++) {
      for (let k = 0; k < studios; k++) {
        rooms.push(room(`tv${f}-${k}`, 'tvNewsStudio', f, k * 10, 10, 5, 5, tvKit), room(`ctl${f}-${k}`, 'controlRoom', f, k * 10 + 5, 10, 3, 5, controlKit));
      }
    }
    const s = game(rooms);
    const layout = layoutChain(cableChain(s, onAir), rooms.map((r) => r.roomId), (f) => (f === null ? 'Roof' : `Floor ${f}`), (id) => id);
    return { s, layout };
  }

  for (const [floors, studios] of [[1, 1], [5, 4]] as const) {
    it(`nothing overlaps on ${floors} floor(s) with ${studios} studio(s) each`, () => {
      const { layout } = building(floors, studios);
      for (const group of [layout.bands, layout.rooms, layout.points]) {
        for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) expect(overlap(group[i]!, group[j]!), `${i} ${j}`).toBe(false);
      }
      for (const p of layout.points) {
        const inside = layout.rooms.filter((r) => p.x >= r.x && p.x + p.w <= r.x + r.w && p.y >= r.y && p.y + p.h <= r.y + r.h);
        expect(inside).toHaveLength(1);
        expect(layout.bands.some((b) => p.y >= b.y && p.y + p.h <= b.y + b.h)).toBe(true);
      }
      for (const line of layout.lines) for (const [x, y] of line.path) expect(x >= 0 && x <= layout.width && y >= 0 && y <= layout.height).toBe(true);
      for (const line of layout.lines) {
        line.path.slice(1).forEach(([x, y], i) => expect(x === line.path[i]![0] || y === line.path[i]![1]).toBe(true));
      }
    });
  }

  it('the roof is on top and the floors go down', () => {
    const { layout } = building(3, 1);
    expect(layout.bands.map((b) => b.label)).toEqual(['Roof', 'Floor 3', 'Floor 2', 'Floor 1']);
  });
});
