import { describe, expect, it } from 'vitest';
import { STRIKES } from '../config/balance';
import { peopleAt, whereaboutsOf } from '../office/layout';
import { endStrike, hire, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { showQuality } from './broadcast';
import { runCheat } from './cheats';
import { withoutRecordRooms } from './fixtures';
import { runUnrest, strikeBonus, strikeDay } from './morale';
import { createInitialState } from './newGame';
import { employeesWithDesk } from './office';
import type { GameState, Person, TeamId } from './state';
import { TEAMS, TEAM_IDS, isStriking, teamMembers, teamOf } from './teams';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';
import { upkeepLoad } from './upkeep';

function ok(result: ActionResult): GameState & { lastId?: string } {
  if (!result.ok) throw new Error(result.error);
  return Object.assign(result.state, { lastId: result.id });
}

/** A radio station from the sensible test player, a month on the air, with everything open, money to spare and two floors; without the cooks it may have hired. */
const station = (): GameState => {
  // Without the library and post room the bot keeps its records in (0.18.0): the tests below build rooms where the game proposes them.
  const s = structuredClone(withoutRecordRooms(unlockAll(advance(sensibleBot(createInitialState(1)), 30))));
  s.money = 5_000_000;
  s.floorsUnlocked = 2;
  s.employees = s.employees.filter((e) => e.role !== 'cook');
  for (const room of s.rooms) room.furniture = room.furniture.filter((f) => f.type !== 'stove');
  return s;
};

/** Hires a made-up person straight from the pool. */
function hirePerson(state: GameState, person: Partial<Person> & Pick<Person, 'role'>): GameState & { lastId?: string } {
  const s = structuredClone(state);
  const id = `p-${s.nextId++}`;
  s.candidates.push({ id, name: `Test ${person.role} ${id}`, skill: 50, salary: 2_000, specialties: [], fame: 0, department: null, ...person });
  return Object.assign(ok(hire(s, id)), { lastId: id });
}

/** Everyone in a team at this morale. */
function setMorale(state: GameState, team: TeamId, morale: number): void {
  for (const e of teamMembers(state, team)) e.morale = morale;
}

describe('version 0.15.0', () => {
  describe('strikes (R122)', () => {
    /** Runs the daily check for strikes `days` times with a team's morale held where it is. */
    const unrest = (state: GameState, team: TeamId, morale: number, days: number) => {
      const s = structuredClone(state);
      for (let i = 0; i < days; i++) {
        setMorale(s, team, morale);
        runUnrest(s);
        s.day += 1;
      }
      return s;
    };

    it('come after a warning, unless morale recovers', () => {
      const s = station();
      const low = unrest(s, 'production', 20, STRIKES.warnAfter + 1);
      expect(low.unrest.production).toMatchObject({ since: s.day, warnedOn: s.day + STRIKES.warnAfter, strikeUntil: null });
      expect(low.messages.at(-1)).toMatchObject({ kind: 'warning', about: 'staff' });
      expect(low.messages.at(-1)!.text).toMatch(/threaten to strike/);
      // Better in time: the threat is off.
      const calm = unrest(low, 'production', STRIKES.recover, 1);
      expect(calm.unrest.production).toBeUndefined();
      expect(calm.messages.at(-1)!.text).toMatch(/threat of a strike is off/);
      // Still low on the day: they walk out.
      const out = unrest(low, 'production', 20, STRIKES.strikeAfter);
      expect(isStriking(out, 'production')).toBe(true);
      expect(out.unrest.production!.strikeUntil).toBe(strikeDay(low.unrest.production!.warnedOn!) + 1 + STRIKES.days);
      expect(out.messages.at(-1)).toMatchObject({ kind: 'danger', about: 'staff' });
      // Morale between the two lines keeps the team where it is.
      expect(unrest(low, 'production', (STRIKES.below + STRIKES.recover) / 2, 30).unrest.production).toMatchObject({ strikeUntil: null });
    });

    it('stop everything the team does', () => {
      const start = station();
      const s = start.employees.some((e) => e.role === 'cleaner') ? start : hirePerson(start, { role: 'cleaner' });
      const out = (team: TeamId) => ok(runCheat(s, `strike ${team}`) as ActionResult);
      // Production: nothing is made, and nobody sits at a workstation.
      const production = out('production');
      const show = production.shows.find((x) => x.staffIds.length > 0)!;
      expect(showQuality(production, show).problems).toContain('The production team is on strike');
      expect(teamMembers(production, 'production').some((e) => employeesWithDesk(production).has(e.id))).toBe(false);
      // Hosts: their shows go to reruns.
      const hosts = out('hosts');
      const hosted = hosts.shows.find((x) => x.hostId)!;
      expect(showQuality(hosts, hosted).problems).toContain('The host is on strike');
      const aired = tick(hosts).lastDay!.channels.filter((c) => c.isPlayer).flatMap((c) => c.slots);
      expect(aired.some((slot) => slot.showId === hosted.id)).toBe(false);
      // Support: nobody cleans.
      const support = out('support');
      expect(upkeepLoad(support, employeesWithDesk(support)).cleaning.capacity).toBe(0);
      // Strikers stay at home.
      const striker = teamMembers(production, 'production')[0]!;
      expect(peopleAt(production).has(striker.id)).toBe(false);
      expect(whereaboutsOf(production, striker.id, 0)).toMatch(/On strike/);
    });

    it('end with a bonus, or by themselves, and leave the team happier', () => {
      const s = ok(runCheat(station(), 'strike production') as ActionResult);
      const bonus = strikeBonus(s, 'production');
      expect(bonus).toBe(Math.round(teamMembers(s, 'production').reduce((sum, e) => sum + e.salary * STRIKES.bonusMonths, 0) / 100) * 100);
      const paid = ok(endStrike(s, 'production'));
      expect(paid.money).toBe(s.money - bonus);
      expect(paid.ledger.salaries).toBe(s.ledger.salaries + bonus);
      expect(isStriking(paid, 'production')).toBe(false);
      const before = teamMembers(s, 'production')[0]!;
      expect(paid.employees.find((e) => e.id === before.id)!.morale).toBeCloseTo(Math.min(100, before.morale + STRIKES.moraleAfter));
      expect(endStrike(paid, 'production').ok).toBe(false);
      // Left alone, it is over after STRIKES.days.
      const waited = advance(s, STRIKES.days);
      expect(isStriking(waited, 'production')).toBe(false);
      expect(waited.messages.some((m) => /strike is over/.test(m.text))).toBe(true);
    });

    it('do not touch the managers', () => {
      expect(teamOf('manager')).toBeNull();
      expect(teamOf('channelManager')).toBeNull();
      expect(TEAM_IDS.flatMap((t) => TEAMS[t].roles)).toHaveLength(new Set(TEAM_IDS.flatMap((t) => TEAMS[t].roles)).size);
    });
  });
});
