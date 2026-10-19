import { describe, expect, it } from 'vitest';
import { EXTRA_PRODUCER } from '../config/balance';
import { getGenre } from '../config/genres';
import { SLOTS } from '../config/world';
import { growthBot, sensibleBot } from './bots';
import { productionSkill } from './broadcast';
import { createInitialState } from './newGame';
import { employeesWithDesk, type Desks } from './office';
import { SAVE_VERSION, fromSaveFile, toSaveFile } from './save';
import { crewReport, freeHands, shortOfProducers, shortOnAir, showCrew, studioDays, watchCrews } from './staffing';
import { effectiveSkill } from './staff';
import type { Employee, GameState, Show } from './state';
import { meetingFactor } from './teams';
import { techMultiplier } from './tech';
import { advance, tick } from './tick';
import { unlockAll } from './unlocks';

/** A radio station from the sensible test player, a month on the air, with everything open. */
const station = (): GameState => structuredClone(unlockAll(advance(sensibleBot(createInitialState(1)), 30)));

/** The first show on the air that has a producer at a desk. */
function producedShow(s: GameState): Show {
  const desked = employeesWithDesk(s);
  const scheduled = new Set(s.channels.flatMap((c) => c.schedule));
  return s.shows.find((show) => scheduled.has(show.id) && show.staffIds.some((id) => desked.has(id)))!;
}

/** Made-up producers on a show, each with a desk added to the desks of the game (or to `desks`), which are returned. */
function withProducers(s: GameState, show: Show, skills: number[], desks: Desks = employeesWithDesk(s)): Desks {
  const desked = new Map(desks);
  const desk = desked.get(show.staffIds.find((id) => desked.has(id))!)!;
  for (const skill of skills) {
    const id = `p-${s.nextId++}`;
    const base = s.employees.find((e) => e.role === 'production')!;
    s.employees.push({ ...structuredClone(base), id, name: `Producer ${id}`, skill, desk: null } as Employee);
    show.staffIds.push(id);
    desked.set(id, desk);
  }
  return desked;
}

/** `productionSkill` as it was before the producers at work became a helper of their own (0.16.0). */
function productionSkillBefore(state: GameState, show: Show, desked: Desks): number {
  const skills = show.staffIds
    .map((id) => state.employees.find((e) => e.id === id))
    .filter((e): e is Employee => e !== undefined && desked.has(e.id))
    .map((e) => effectiveSkill(state, e, desked) * meetingFactor(state, e))
    .sort((a, b) => b - a);
  if (skills.length === 0) return 0;
  const needed = Math.max(1, getGenre(show.genre).requiredStaff);
  const core = skills.slice(0, needed);
  const avgSkill = core.reduce((sum, skill) => sum + skill, 0) / core.length / 100;
  const extra = 1 + EXTRA_PRODUCER.bonus * Math.min(EXTRA_PRODUCER.max, skills.length - core.length);
  return Math.min(1, avgSkill * Math.min(1, core.length / needed) * extra) * techMultiplier(state, 'productionSkill');
}

describe('the staffing report (0.17.0)', () => {
  it('counts producers as the ratings do: production skill is the same as before', () => {
    for (const s of [station(), structuredClone(advance(growthBot(createInitialState(7)), 200))]) {
      const desked = employeesWithDesk(s);
      expect(s.shows.length).toBeGreaterThan(0);
      for (const show of s.shows) expect(productionSkill(s, show, desked)).toBe(productionSkillBefore(s, show, desked));
    }
  });

  it('calls a show short with fewer producers at a desk than its genre needs, enough with as many, and more than help past the extras', () => {
    const s = station();
    const show = producedShow(s);
    show.genre = 'talk';
    show.staffIds = show.staffIds.slice(0, 1);
    const needed = getGenre('talk').requiredStaff;
    expect(needed).toBe(2);
    expect(showCrew(s, show, employeesWithDesk(s)).verdict).toBe('short');
    expect(shortOfProducers(s, show, employeesWithDesk(s))).toEqual({ working: 1, needed: 2 });

    const enough = withProducers(s, show, [40]);
    const crew = showCrew(s, show, enough);
    expect(crew.verdict).toBe('enough');
    expect([crew.extra, crew.idle]).toEqual([0, 0]);
    expect(shortOfProducers(s, show, enough)).toBeNull();

    const more = withProducers(s, show, [30, 30, 20], enough);
    const full = showCrew(s, show, more);
    expect(full.verdict).toBe('more');
    expect([full.producers.working, full.extra, full.idle]).toEqual([5, EXTRA_PRODUCER.max, 5 - needed - EXTRA_PRODUCER.max]);
    // The weakest is the one who adds nothing.
    expect(full.producers.people.filter((p) => p.addsNothing).map((p) => p.employee.skill)).toEqual([20]);
  });

  it('counts a producer without a desk as missing, with the reason', () => {
    const s = station();
    const show = producedShow(s);
    show.genre = 'talk';
    show.staffIds = show.staffIds.slice(0, 1);
    const desked = withProducers(s, show, [60]);
    const away = show.staffIds.at(-1)!;
    const without = new Map(desked);
    without.delete(away);
    expect(showCrew(s, show, desked).verdict).toBe('enough');
    const crew = showCrew(s, show, without);
    expect(crew.verdict).toBe('short');
    expect(crew.producers.people.find((p) => p.employee.id === away)!.missing).toBe('No workstation');
    expect(crew.producers.working).toBe(show.staffIds.length - 1);
  });

  it('marks everyone on strike, without calling the show short', () => {
    const s = station();
    const show = producedShow(s);
    s.unrest = { production: { since: s.day - 30, warnedOn: s.day - 10, strikeUntil: s.day + 5 } };
    const desked = employeesWithDesk(s);
    const crew = showCrew(s, show, desked);
    expect(crew.verdict).toBe('strike');
    expect(crew.producers.people.map((p) => p.missing)).toEqual(show.staffIds.map(() => 'On strike'));
    expect(shortOnAir(s, desked)).toEqual([]);
    const before = s.messages.length;
    watchCrews(s, desked);
    expect(s.messages).toHaveLength(before);
  });

  it('puts each studio’s shows in the slots of the schedules, and leaves library programs out', () => {
    const s = station();
    const days = studioDays(s);
    expect(days.length).toBeGreaterThan(0);
    for (const day of days) {
      expect(day.slots).toHaveLength(SLOTS.length);
      day.slots.forEach((cell, slot) => {
        if (cell) expect(cell.channel.schedule[slot]).toBe(cell.show.id);
        if (cell) expect(cell.show.studioId).toBe(day.room.roomId);
      });
    }
    for (const channel of s.channels) {
      channel.schedule.forEach((id, slot) => {
        const show = s.shows.find((x) => x.id === id);
        if (show?.studioId) expect(days.find((d) => d.room.roomId === show.studioId)!.slots[slot]?.show.id).toBe(id);
      });
    }
    expect(crewReport(s, employeesWithDesk(s)).every((c) => getGenre(c.show.genre).kind === 'produced')).toBe(true);
  });

  it('lists hosts without a show and producers with room for one more', () => {
    const s = station();
    const free = freeHands(s);
    for (const { employee, room } of free) {
      expect(room).toBeGreaterThan(0);
      if (employee.role === 'host') expect(s.shows.some((x) => x.hostId === employee.id)).toBe(false);
    }
    const idle = s.employees.find((e) => e.role === 'production')!;
    for (const show of s.shows) show.staffIds = show.staffIds.filter((id) => id !== idle.id);
    expect(freeHands(s).find((f) => f.employee.id === idle.id)?.room).toBe(2);
  });
});

describe('the news of a show short of producers (0.17.0)', () => {
  /** A station whose first show on the air needs two producers and has one. */
  const shortStation = () => {
    const s = station();
    const show = producedShow(s);
    show.genre = 'talk';
    show.staffIds = show.staffIds.filter((id) => employeesWithDesk(s).has(id)).slice(0, 1);
    return { s, show };
  };

  it('tells the player once when a show on the air falls short, and again when it falls short once more', () => {
    const { s, show } = shortStation();
    const told = (state: GameState) => state.messages.filter((m) => m.text.startsWith(`“${show.name}” is short of producers`));
    const next = tick(s);
    expect(told(next)).toHaveLength(1);
    expect(told(next)[0]!.text).toBe(`“${show.name}” is short of producers: it has 1 of the 2 producers it needs. Its production counts for 50% until it has them all.`);
    expect(told(next)[0]!.about).toBe('broadcast:staffing');
    expect(next.shortOfProducers).toContain(show.id);
    expect(told(tick(next))).toHaveLength(1);

    // With enough producers it is forgotten; short again, it is told about again.
    const fixed = structuredClone(next);
    fixed.shows.find((x) => x.id === show.id)!.genre = 'top40';
    const watched = structuredClone(fixed);
    watchCrews(watched, employeesWithDesk(watched));
    expect(watched.shortOfProducers).not.toContain(show.id);
    watched.shows.find((x) => x.id === show.id)!.genre = 'talk';
    watchCrews(watched, employeesWithDesk(watched));
    expect(told(watched)).toHaveLength(2);
  });

  it('says when producers lack a workstation', () => {
    const { s, show } = shortStation();
    const desked = withProducers(s, show, [50]);
    const away = show.staffIds.at(-1)!;
    const without = new Map(desked);
    without.delete(away);
    watchCrews(s, without);
    expect(s.messages.at(-1)!.text).toBe(`“${show.name}” is short of producers: one of its producers has no workstation, so 1 of the 2 it needs are at work. Its production counts for 50% until it has them all.`);
  });

  it('a show in no slot is not on the air, and is not told about', () => {
    const { s, show } = shortStation();
    for (const c of s.channels) c.schedule = c.schedule.map((id) => (id === show.id ? null : id));
    expect(shortOnAir(s, employeesWithDesk(s)).map((x) => x.id)).not.toContain(show.id);
  });

  it('an older save loads with no shows remembered as short', () => {
    const { s } = shortStation();
    const old = JSON.parse(JSON.stringify(toSaveFile(s, 0)));
    delete old.state.shortOfProducers;
    const { state, version } = fromSaveFile({ ...old, version: 35 });
    expect(version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(36);
    expect(state.shortOfProducers).toEqual([]);
    expect(tick(state).shortOfProducers.length).toBeGreaterThan(0);
  });
});
