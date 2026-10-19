import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { voiceFile } from '../audio/voice';
import { BAILOUT, BANKRUPTCY_MONTHS, RENEWAL, RESEARCH } from '../config/balance';
import { HINTS, LINES } from '../config/guide';
import { TECHS } from '../config/tech';
import { VOICE_FOLDER } from '../config/voiceOver';
import { ARTICLES } from '../wiki/articles';
import { sensibleBot } from './bots';
import { toCalendarDate, toDay } from './calendar';
import { acknowledge, guideView, setGuide } from './guide';
import { createInitialState } from './newGame';
import { fromSaveFile, SAVE_VERSION, toSaveFile } from './save';
import { newAlerts, waitingFor, type GameState, type Message } from './state';
import { tick } from './tick';
import { unlockAll } from './unlocks';

/** A company with nothing but debts, on 1 January 1970. */
const broke = (): GameState => ({ ...createInitialState(1), money: -200_000 });
/** Plays up to the next first of the month. */
const toNextMonth = (state: GameState) => {
  let s = tick(state);
  while (toCalendarDate(s.day).dayOfMonth !== 1) s = tick(s);
  return s;
};
const months = (state: GameState, count: number) => Array.from({ length: count }).reduce<GameState>((s) => toNextMonth(s), state);

/** Plays day by day and collects every message that is about a window. */
function alertsOver(state: GameState, days: number): { state: GameState; alerts: Message[] } {
  const alerts: Message[] = [];
  let s = state;
  for (let i = 0; i < days; i++) {
    const next = tick(s);
    alerts.push(...newAlerts(s, next));
    s = next;
  }
  return { state: s, alerts };
}

describe('version 0.9.0', () => {
  describe('the bail-out (R6)', () => {
    it('Uncle Tabby pays in once, when the bank would close the company down', () => {
      const before = months(broke(), BANKRUPTCY_MONTHS - 1);
      expect(before).toMatchObject({ negativeMonths: BANKRUPTCY_MONTHS - 1, bailedOut: false, bankrupt: false });

      const saved = toNextMonth(before);
      expect(saved).toMatchObject({ bailedOut: true, bankrupt: false, negativeMonths: 0 });
      expect(saved.money - before.money).toBe(BAILOUT.amount);
      expect(BAILOUT.amount).toBe(50_000);
      expect(saved.messages.at(-1)).toMatchObject({ kind: 'danger', text: expect.stringMatching(/I have paid in €50,000.*once.*still in the red/), from: { kind: 'tabby' } });
      // A gift, not income: no report counts it.
      expect(saved.monthlyReports.at(-1)!.net).toBe(0);
      expect(saved.ledger.revenue).toBe(0);
    });

    it('does not happen twice: the bank counts again and then the game is over', () => {
      const saved = months(broke(), BANKRUPTCY_MONTHS);
      const later = months(saved, BANKRUPTCY_MONTHS - 1);
      expect(later).toMatchObject({ negativeMonths: BANKRUPTCY_MONTHS - 1, bankrupt: false });
      const over = toNextMonth(later);
      expect(over).toMatchObject({ bankrupt: true, bailedOut: true });
      expect(over.money).toBe(later.money);
    });

    it('a company that the sum puts back above zero is simply back in business', () => {
      const s = months({ ...createInitialState(1), money: -20_000 }, BANKRUPTCY_MONTHS);
      expect(s).toMatchObject({ money: 30_000, negativeMonths: 0, bailedOut: true });
      expect(s.messages.at(-1)!.text).not.toMatch(/still in the red/);
    });

    it('Penny says so, also in the middle of the first weeks, before her word about being in the red', () => {
      const line = HINTS.find((hint) => hint.id === 'bailout')!;
      // What is spoken names no figure, so a recording stays right.
      expect(line.say).not.toMatch(/\d|fifty/i);
      const s = setGuide(months(broke(), BANKRUPTCY_MONTHS), true);
      expect(guideView(s)).toMatchObject({ kind: 'hint', line: { id: 'bailout' } });
      expect(guideView(acknowledge(s, 'bailout'))).toMatchObject({ kind: 'hint', line: { id: 'red' } });
      expect(guideView(setGuide(months(broke(), 1), true))).toMatchObject({ kind: 'hint', line: { id: 'red' } });
    });

    it('a game from before has the rescue still to come, and the wiki explains it', () => {
      const old = toSaveFile(sensibleBot(createInitialState(1)), 1) as unknown as { version: number; state: Record<string, unknown> };
      old.version = 24;
      delete old.state.bailedOut;
      expect(fromSaveFile(old)).toMatchObject({ version: SAVE_VERSION, state: { bailedOut: false } });
      expect(SAVE_VERSION).toBeGreaterThanOrEqual(25);
      expect(JSON.stringify(ARTICLES)).toMatch(/your uncle steps in.*€50,000/i);
    });
  });

  describe('news with a pop-up and a dot (R15)', () => {
    /** The sensible bot's station with everything open and money to spare. */
    const station = () => ({ ...structuredClone(unlockAll(sensibleBot(createInitialState(1)))), money: 1_000_000 });

    it('a rival’s offer to one of your hosts is news about the Staff window', () => {
      let s = station();
      const star = s.employees.find((e) => e.role === 'host')!.id;
      let offer: Message | undefined;
      for (let i = 0; i < 3_000 && !offer; i++) {
        s = structuredClone(s);
        for (const e of s.employees) if (e.role === 'host') e.fame = e.id === star ? 90 : 0;
        const next = tick(s);
        offer = newAlerts(s, next).find((m) => m.about === 'staff');
        s = next;
      }
      expect(offer).toMatchObject({ kind: 'danger', text: expect.stringMatching(/has offered .* a month/) });
      // Loaded again while the offer is waiting, Staff has its dot back.
      expect(s.poachOffers).toHaveLength(1);
      expect(waitingFor(s)).toContain('staff');
      expect(waitingFor(station())).toEqual([]);
    });

    it('a license that runs out, and its renewal round, are news about Licenses', () => {
      const s = station();
      s.day = s.licenses[0]!.expiresOn - RENEWAL.warnDays - 1;
      const warned = tick(s);
      expect(newAlerts(s, warned)).toContainEqual(expect.objectContaining({ about: 'licenses', kind: 'warning', text: expect.stringMatching(/runs out on/) }));
      expect(waitingFor(warned)).not.toContain('licenses');

      const t = structuredClone(warned);
      t.day = t.licenses[0]!.expiresOn - RENEWAL.auctionDays - 1;
      const round = tick(t);
      expect(newAlerts(t, round)).toContainEqual(expect.objectContaining({ about: 'licenses', text: expect.stringMatching(/up for renewal/) }));
      expect(waitingFor(round)).toContain('licenses');
    });

    it('a technology that comes within reach is news about Research, once', () => {
      // With points to spare, the next thing to come within reach is the first technology more than five years off.
      const next = TECHS.filter((tech) => tech.year - RESEARCH.maxYearsEarly > 1970).sort((a, b) => a.year - b.year)[0]!;
      const day = toDay(next.year - RESEARCH.maxYearsEarly, 1, 1);
      const rich = { ...unlockAll(createInitialState(1)), researchPoints: 1_000_000 };
      const about = (alerts: Message[]) => alerts.filter((m) => m.about === 'research');
      expect(about(alertsOver(rich, day + 30).alerts)).toEqual([expect.objectContaining({ kind: 'info', day, text: expect.stringContaining(`the points for ${next.name}`) })]);
      // A company that has no research yet hears nothing.
      expect(about(alertsOver({ ...createInitialState(1), researchPoints: 1_000_000 }, day + 30).alerts)).toEqual([]);
    });
  });

  describe('the voices (R1)', () => {
    it('every recording is named after a line of the tutorial', () => {
      const lines = new Set(LINES.map((line) => voiceFile(line.id)));
      expect(lines.size).toBe(LINES.length);
      const files = existsSync(VOICE_FOLDER) ? readdirSync(VOICE_FOLDER).filter((file) => !file.startsWith('.')) : [];
      for (const file of files) expect(lines.has(file), `${VOICE_FOLDER}/${file} is not a line of the tutorial`).toBe(true);
    });
  });
});
