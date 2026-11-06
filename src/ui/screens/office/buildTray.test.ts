import { describe, expect, it } from 'vitest';
import { CONTROL_ROOM_KIT, furnitureSpec, RENTABLE_ROOM_TYPES } from '../../../config/office';
import { piecesFor, trayGroups, trayPieces } from './buildTray';

describe('the build tray', () => {
  it('lists every rentable kind of room in exactly one group', () => {
    const listed = trayGroups().flatMap((g) => g.kinds);
    expect([...listed].sort()).toEqual([...RENTABLE_ROOM_TYPES].sort());
  });

  it('starts with the Offices group, which holds the office and the management office', () => {
    const [first] = trayGroups();
    expect(first!.name).toBe('Offices');
    expect(first!.kinds).toEqual(expect.arrayContaining(['office', 'managementOffice']));
  });

  it('requires a radio studio’s mixing desk and on-air light', () => {
    expect(trayPieces('radioStudio').required).toEqual([
      { type: 'mixingDesk', need: 1 },
      { type: 'onAirLight', need: 1 },
    ]);
  });

  it('lists the workstation under Required for an office, with no count', () => {
    expect(trayPieces('office').required).toEqual([{ type: 'workstation', need: null }]);
  });

  it('leaves a TV studio’s control room kit out of Required', () => {
    for (const type of CONTROL_ROOM_KIT) expect(trayPieces('tvTalkStudio').required.map((r) => r.type)).not.toContain(type);
  });

  it('lists every piece once, and nothing that is no longer sold', () => {
    for (const kind of RENTABLE_ROOM_TYPES) {
      const { required, improvements } = trayPieces(kind);
      const all = [...required.map((r) => r.type), ...improvements];
      expect(new Set(all).size).toBe(all.length);
      expect([...all].sort()).toEqual([...piecesFor(kind)].sort());
      for (const type of all) expect(furnitureSpec(type).retired).toBeFalsy();
    }
  });
});
