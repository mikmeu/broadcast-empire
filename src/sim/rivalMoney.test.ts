import { describe, expect, it } from 'vitest';
import { RIVALRY } from '../config/balance';
import { createInitialState } from './newGame';
import { canAfford, chargeRival, growthLimit, pushed } from './rivalMoney';

const rival = () => structuredClone(createInitialState(1).rivals[0]!);

describe('what a rival can spend (#414)', () => {
  it('rivalry pushes a bid only at or over watch', () => {
    const r = rival();
    r.rivalry = RIVALRY.watch - 0.01;
    expect(pushed(r, 1)).toBe(1);
    r.rivalry = 1;
    expect(pushed(r, 1)).toBeCloseTo(1 + RIVALRY.bidPush);
  });

  it('growth keeps the cushion that canAfford keeps', () => {
    const r = rival();
    const cushion = RIVALRY.shortBelow * RIVALRY.startMoney[r.personality];
    r.money = cushion + 50_000;
    expect(growthLimit(r)).toBe(50_000);
    expect(canAfford(r, 50_000)).toBe(true);
    expect(canAfford(r, 50_001)).toBe(false);
    r.money = 0;
    expect(growthLimit(r)).toBe(0);
  });

  it('charging never takes money below 0', () => {
    const r = rival();
    r.money = 1_000;
    chargeRival(r, 5_000);
    expect(r.money).toBe(0);
  });
});
