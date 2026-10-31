import { afterEach, describe, expect, it } from 'vitest';
import { placeSound } from '../audio/sounds';
import { DECOR, ROYALTIES } from '../config/balance';
import { FURNITURE, furnitureSpec, furnitureTypes, registerFurniture, unregisterFurniture, type BuiltInFurniture, type FurnitureSpec } from '../config/office';
import { FURNITURE_ASSETS, furnitureAsset, registerFurnitureAsset, unregisterFurnitureAsset } from '../office/assets';
import { roomBoost } from './boosts';
import { dirtFactor } from './upkeep';
import type { RentedRoom } from './state';

const room = (type: RentedRoom['type'], ...pieces: string[]) => ({ type, furniture: pieces.map((p, i) => ({ id: `f${i}`, type: p })) }) as unknown as RentedRoom;

const BOOSTS: Record<string, unknown> = {
  recordingBooth: { kind: 'recorded', amount: DECOR.recordingBooth },
  recordShelves: { kind: 'genreQuality', genres: ROYALTIES.genres, amount: DECOR.recordShelves },
  flipChart: { kind: 'meetingMorale', amount: DECOR.flipChart },
  calendar: { kind: 'skill', role: 'production', amount: DECOR.calendar },
  salesChart: { kind: 'skill', role: 'sales', amount: DECOR.salesChart },
  printer: { kind: 'campaignCost', amount: DECOR.printer },
  bin: { kind: 'dirt', amount: DECOR.bin },
  dishwasher: { kind: 'dirt', amount: DECOR.dishwasher, roomType: 'canteen' },
};

const testBin: FurnitureSpec = { name: 'Test bin', about: 'A bin that came from outside.', cost: 30, w: 1, h: 1, rooms: ['office'], boosts: [{ kind: 'dirt', amount: DECOR.bin }] };

afterEach(() => {
  unregisterFurniture('mod:testBin');
  unregisterFurnitureAsset('mod:testBin');
});

describe('furniture as data (0.21.0)', () => {
  it('has 61 built-in pieces, and only the eight decor pieces carry boosts, each equal to its DECOR number', () => {
    expect(furnitureTypes()).toHaveLength(61);
    for (const type of Object.keys(FURNITURE) as BuiltInFurniture[]) {
      expect(furnitureSpec(type).boosts, type).toEqual(type in BOOSTS ? [BOOSTS[type]] : undefined);
    }
  });

  it('adds a piece with registerFurniture, and its boost slows dirt exactly like a bin', () => {
    registerFurniture('mod:testBin', testBin);
    expect(furnitureTypes()).toHaveLength(62);
    expect(furnitureSpec('mod:testBin').name).toBe('Test bin');
    expect(dirtFactor(room('office', 'mod:testBin'))).toBe(dirtFactor(room('office', 'bin')));
    expect(dirtFactor(room('office', 'mod:testBin'))).toBe(1 - DECOR.bin);
  });

  it('counts one piece of a kind per room', () => {
    registerFurniture('mod:testBin', testBin);
    expect(dirtFactor(room('office', 'bin', 'mod:testBin'))).toBe(1 - DECOR.bin);
    expect(dirtFactor(room('office', 'bin', 'bin'))).toBe(1 - DECOR.bin);
    expect(roomBoost(room('canteen', 'bin', 'dishwasher'), 'dirt')?.amount).toBe(DECOR.dishwasher);
  });

  it('keeps the bin and the dishwasher both counting in a canteen, and the dishwasher only there', () => {
    expect(dirtFactor(room('canteen', 'bin', 'dishwasher'))).toBe((1 - DECOR.bin) * (1 - DECOR.dishwasher));
    expect(dirtFactor(room('canteen', 'dishwasher'))).toBe(1 - DECOR.dishwasher);
    expect(dirtFactor(room('office', 'dishwasher'))).toBe(1);
    expect(dirtFactor(room('office'))).toBe(1);
  });

  it('gives an added piece a look, and an unknown piece the general place sound', () => {
    expect(() => furnitureAsset('mod:testBin')).toThrow();
    registerFurnitureAsset('mod:testBin', FURNITURE_ASSETS.bin);
    expect(furnitureAsset('mod:testBin')).toBe(FURNITURE_ASSETS.bin);
    expect(placeSound('mod:testBin')).toBe('woodMedium');
    expect(placeSound('bin')).toBe('metalLight');
  });

  it('refuses a piece registered twice, and a piece nobody registered', () => {
    registerFurniture('mod:testBin', testBin);
    expect(() => registerFurniture('mod:testBin', testBin)).toThrow();
    expect(() => furnitureSpec('mod:nothing')).toThrow();
  });
});
