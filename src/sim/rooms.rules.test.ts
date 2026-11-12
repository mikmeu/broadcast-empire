import { describe, expect, it } from 'vitest';
import { BUILD_COST_PER_TILE, GRACE } from '../config/balance';
import { BUILDINGS, getPlot } from '../config/office';
import { createInitialState } from './newGame';
import { newRoom } from './office';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import type { GameState } from './state';

/** A game with a TV studio, and a control room next door when `withControl`; no channels on the air. */
function game(withControl: boolean, grace: GameState['grace']): GameState {
  const s = structuredClone(createInitialState(1));
  s.money = 100_000;
  s.rooms.push({ ...newRoom(getPlot('A')), type: 'tvTalkStudio' });
  if (withControl) s.rooms.push({ ...newRoom(getPlot('B')), type: 'controlRoom' });
  s.grace = grace;
  return s;
}

const load = (s: GameState, version: number) => fromSaveFile({ ...JSON.parse(JSON.stringify(toSaveFile(s, 0))), version });

describe('the new room rules, gentler (#110)', () => {
  it('gives an older game 90 days', () => {
    expect(GRACE.days).toBe(90);
  });

  it('pays back the build cost of the control room of a game that was given time for it, once', () => {
    const s = game(true, { controlRooms: 10 });
    const { state, version } = load(s, 45);
    expect(version).toBe(SAVE_VERSION);
    const cost = BUILDINGS.standard.plan[1]!.w * BUILDINGS.standard.plan[1]!.h * BUILD_COST_PER_TILE;
    expect(state.money).toBe(s.money + cost);
    expect(state.ledger.purchases).toBe(s.ledger.purchases - cost);
    const message = state.messages.find((m) => /give back/.test(m.text))!;
    expect(message.from).toMatchObject({ kind: 'tabby' });
    // The studio has no kit yet: it gets its time again, from today.
    expect(state.grace.controlRooms).toBe(s.day + GRACE.days);
    // Loaded again from the new version, nothing more is paid.
    expect(load(state, SAVE_VERSION).state.money).toBe(state.money);
  });

  it('pays nothing to a game that was given no time', () => {
    const s = game(true, {});
    const { state } = load(s, 45);
    expect(state.money).toBe(s.money);
    expect(state.grace).toEqual({});
  });

  it('gives a studio that still lacks a control room time again', () => {
    const s = game(false, { controlRooms: 10 });
    const { state } = load(s, 45);
    expect(state.money).toBe(s.money);
    expect(state.grace.controlRooms).toBe(s.day + GRACE.days);
    expect(state.messages.at(-1)!.text).toMatch(/no control room/);
  });
});
