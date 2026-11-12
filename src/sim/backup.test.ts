// A host's back-up (0.21.0, #352): when a host is ill, the host they named presents their shows as well as their own.

import { describe, expect, it } from 'vitest';
import { LIFE, OFF_SPECIALTY_SKILL } from '../config/balance';
import { hireTemp, setBackupHost } from './actions';
import { coverToday, presenterOf, sameSlot, standInFor, tireBackups } from './backup';
import { sensibleBot } from './bots';
import { hostSkill, showQuality } from './broadcast';
import { slotsOf } from './deals';
import { lifeEvents, tellOfIllness } from './life';
import { createInitialState } from './newGame';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { removeEmployee } from './staff';
import type { Employee, GameState, Show } from './state';
import { tick } from './tick';
import { unlockAll } from './unlocks';

/** A game after its first broadcast, with a host who presents a show, and a better host beside them who is their back-up. */
function pair(): { s: GameState; host: Employee; backup: Employee; show: Show } {
  const s = tick(structuredClone(unlockAll(sensibleBot(createInitialState(1)))));
  const show = s.shows.find((x) => x.hostId && x.genre !== 'news')!;
  const host = s.employees.find((e) => e.id === show.hostId)!;
  const backup: Employee = { ...structuredClone(host), id: 'backup-1', name: 'Bea Backup', skill: 90, fame: 40, morale: 70, away: null, backupId: null };
  backup.specialties = [...host.specialties];
  host.skill = 30;
  s.employees.push(backup);
  host.backupId = backup.id;
  return { s, host, backup, show };
}

const fallIll = (s: GameState, host: Employee, since = s.day) => {
  host.away = { reason: 'sick', from: since, until: since + 20, temp: null };
};

/** A show of the back-up that airs in the same slot as the given one, sold to a rival. */
function clashWith(s: GameState, show: Show, backup: Employee): void {
  const other: Show = { ...structuredClone(show), id: 'show-b', hostId: backup.id };
  s.shows.push(other);
  s.showSales.push({ id: 'sale-b', showId: other.id, rivalId: 'r', channelId: 'rc', slot: slotsOf(s, show.id)[0]!, startDay: 0, endDay: 99_999, earned: 0 });
}

describe('who presents', () => {
  it('a healthy host presents their own show', () => {
    const { s, host, show } = pair();
    expect(presenterOf(s, show)).toBe(host);
  });

  it('the back-up of an ill host presents, at their own skill', () => {
    const { s, host, backup, show } = pair();
    const own = showQuality(s, show);
    fallIll(s, host);
    expect(standInFor(s, host)).toBe(backup);
    const covered = showQuality(s, show);
    expect(covered.problems).toHaveLength(0);
    expect(covered.host).toBeGreaterThan(own.host);
    // The same as if the backup had presented it all along.
    const theirs = structuredClone(s);
    theirs.employees.find((e) => e.id === host.id)!.away = null;
    theirs.shows.find((x) => x.id === show.id)!.hostId = backup.id;
    expect(covered.quality).toBeCloseTo(showQuality(theirs, theirs.shows.find((x) => x.id === show.id)!).quality, 6);
    expect(covered.host).toBeGreaterThan(hostSkill(host, show.genre));
  });

  it('outside their genre the back-up has the off-genre skill', () => {
    const { s, host, backup, show } = pair();
    fallIll(s, host);
    backup.specialties = [show.genre];
    const inGenre = showQuality(s, show).host;
    backup.specialties = [];
    expect(showQuality(s, show).host).toBeCloseTo(inGenre * OFF_SPECIALTY_SKILL, 6);
  });

  it('without a back-up, an ill host leaves the show with a problem, as before', () => {
    const { s, host, show } = pair();
    host.backupId = null;
    fallIll(s, host);
    expect(presenterOf(s, show)).toBe(host);
    expect(showQuality(s, show).problems).toContain('The host is away');
  });

  it('a temp wins over the back-up', () => {
    const { s, host, show } = pair();
    fallIll(s, host);
    const hired = hireTemp(s, host.id);
    expect(hired.ok).toBe(true);
    const withTemp = hired.ok ? hired.state : s;
    expect(standInFor(withTemp, withTemp.employees.find((e) => e.id === host.id)!)).toBeNull();
    expect(presenterOf(withTemp, withTemp.shows.find((x) => x.id === show.id)!)?.id).toBe(host.id);
  });

  it('parental leave is not covered', () => {
    const { s, host, show } = pair();
    host.away = { reason: 'leave', from: s.day, until: s.day + 60, temp: null };
    expect(standInFor(s, host)).toBeNull();
    expect(showQuality(s, show).problems).toContain('The host is away');
  });

  it('the cover ends on the day after the last of its days', () => {
    const { s, host, backup } = pair();
    fallIll(s, host, s.day - (LIFE.backup.maxDays - 1));
    expect(standInFor(s, host)).toBe(backup);
    fallIll(s, host, s.day - LIFE.backup.maxDays);
    expect(standInFor(s, host)).toBeNull();
  });
});

describe('when the back-up cannot', () => {
  it('goes to reruns when the back-up is on the air at the same time', () => {
    const { s, host, backup, show } = pair();
    clashWith(s, show, backup);
    fallIll(s, host);
    expect(sameSlot(s, host, backup)).toBe(true);
    expect(standInFor(s, host)).toBeNull();
    expect(showQuality(s, show).quality).toBe(0);
  });

  it('goes to reruns when the back-up is away, on a course or in the talent programme', () => {
    const { s, host, backup, show } = pair();
    fallIll(s, host);
    backup.away = { reason: 'sick', from: s.day, until: s.day + 3, temp: null };
    expect(standInFor(s, host)).toBeNull();
    expect(showQuality(s, show).quality).toBe(0);
    backup.away = null;
    backup.trainingUntil = s.day + 5;
    expect(standInFor(s, host)).toBeNull();
    backup.trainingUntil = null;
    backup.talentUntil = s.day + 100;
    expect(standInFor(s, host)).toBeNull();
  });

  it('serves one ill host a day: the one who fell ill first', () => {
    const { s, host, backup } = pair();
    const second: Employee = { ...structuredClone(host), id: 'host-2', name: 'Second Host', backupId: backup.id, away: null };
    s.employees.push(second);
    fallIll(s, host, s.day - 1);
    fallIll(s, second, s.day);
    expect(standInFor(s, host)).toBe(backup);
    expect(standInFor(s, second)).toBeNull();
    // Once the first is back, the second has the back-up.
    host.away = null;
    expect(standInFor(s, second)).toBe(backup);
  });

  it('a pair may cover each other', () => {
    const { s, host, backup } = pair();
    backup.backupId = host.id;
    fallIll(s, host);
    expect(standInFor(s, host)).toBe(backup);
    expect(standInFor(s, backup)).toBeNull();
  });
});

describe('the cost and the credit', () => {
  it('the back-up loses morale for each day of cover, and nobody else does', () => {
    const { s, host, backup } = pair();
    tireBackups(s);
    expect(backup.morale).toBe(70);
    fallIll(s, host);
    expect(coverToday(s)).toEqual([{ host, backup }]);
    tireBackups(s);
    expect(backup.morale).toBe(70 - LIFE.backup.morale);
  });

  it('the back-up earns the fame of the covered show and the ill host none', () => {
    const { s, host, backup } = pair();
    host.fame = 60;
    backup.fame = 0;
    fallIll(s, host, s.day);
    host.away!.until = s.day + 30;
    const next = tick(s);
    const h = next.employees.find((e) => e.id === host.id)!;
    const b = next.employees.find((e) => e.id === backup.id)!;
    expect(b.fame).toBeGreaterThan(0);
    expect(h.fame).toBeLessThan(60);
  });

  it('the message of the illness names the back-up', () => {
    const { s, host, backup } = pair();
    fallIll(s, host);
    tellOfIllness(s, host);
    expect(s.messages.at(-1)!.text).toContain(`Their back-up ${backup.name} presents their shows`);
    backup.away = { reason: 'sick', from: s.day, until: s.day + 3, temp: null };
    tellOfIllness(s, host);
    expect(s.messages.at(-1)!.text).toContain(`Their back-up cannot stand in: ${backup.name} is away too`);
  });

  it('a day of illness with a back-up runs through the daily life without error', () => {
    const { s, host } = pair();
    fallIll(s, host);
    s.day += 1;
    lifeEvents(s);
    expect(host.backupId).toBeDefined();
  });
});

describe('the command and who leaves', () => {
  it('names a back-up, or none, and refuses a non-host and the host themselves', () => {
    const { s, host, backup } = pair();
    host.backupId = null;
    const named = setBackupHost(s, host.id, backup.id);
    expect(named.ok && named.state.employees.find((e) => e.id === host.id)!.backupId).toBe(backup.id);
    expect(setBackupHost(s, host.id, host.id).ok).toBe(false);
    const other = s.employees.find((e) => e.role !== 'host')!;
    expect(setBackupHost(s, host.id, other.id).ok).toBe(false);
    expect(setBackupHost(s, other.id, backup.id).ok).toBe(false);
    const cleared = setBackupHost(named.ok ? named.state : s, host.id, null);
    expect(cleared.ok && cleared.state.employees.find((e) => e.id === host.id)!.backupId).toBeNull();
  });

  it('whoever leaves is nobody’s back-up, and has none', () => {
    const { s, host, backup } = pair();
    backup.backupId = host.id;
    removeEmployee(s, backup.id);
    expect(host.backupId).toBeNull();
    host.backupId = 'backup-1';
    const other = s.employees.find((e) => e.role !== 'host')!;
    other.backupId = host.id;
    removeEmployee(s, host.id);
    expect(other.backupId).toBeNull();
  });
});

describe('the save', () => {
  it('loads a save of version 74 with nobody as back-up', () => {
    const file = JSON.parse(JSON.stringify(toSaveFile(sensibleBot(createInitialState(1)), 0)));
    for (const e of file.state.employees) delete e.backupId;
    const { version, state } = fromSaveFile({ ...file, version: 74 });
    expect(version).toBe(SAVE_VERSION);
    expect(state.employees.length).toBeGreaterThan(0);
    expect(state.employees.every((e) => !e.backupId)).toBe(true);
    // And the old game plays on.
    expect(tick(state).day).toBe(state.day + 1);
  });
});

describe('a game with no back-ups', () => {
  it('plays out as before', () => {
    const a = tick(structuredClone(unlockAll(sensibleBot(createInitialState(2)))));
    expect(coverToday(a)).toEqual([]);
    expect(a.employees.every((e) => !e.backupId)).toBe(true);
  });
});
