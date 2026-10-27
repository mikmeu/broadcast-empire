import { describe, expect, it } from 'vitest';
import { MAX_MESSAGES } from '../config/balance';
import { readAllMessages, readMessage, type ActionResult } from './actions';
import { sensibleBot } from './bots';
import { PENNY, TABBY, addressOf, deskOf, firstParagraph, letterOf, priorityOf, senderFor, slug, subjectOf, unreadCount, yourAddress, type Desk } from './inbox';
import { checkMilestones } from './milestones';
import { createInitialState } from './newGame';
import { fromSaveFile, toSaveFile } from './save';
import { addMessage, type Employee, type GameState, type Role } from './state';
import { advance } from './tick';

function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** Someone on the staff, made up for the test. */
function employee(id: string, role: Role, extra: Partial<Employee> = {}): Employee {
  return {
    id, name: `Test ${id}`, role, skill: 50, salary: 500, specialties: [], fame: 0, department: null,
    hiredOn: 0, xp: 0, level: 1, morale: 70, location: null, desk: null, trainingUntil: null, courseIn: null, leaving: null, talentUntil: null,
    ...extra,
  };
}

/** A new company with nobody hired and one channel. */
function empty(): GameState {
  const s = structuredClone(createInitialState(1));
  s.employees = [];
  s.channels = [{ id: 'ch1', name: 'Radio One', logo: { shape: 'circle', color: '#000', initials: 'R1' }, medium: 'radio', managerId: null, schedule: [], reputation: {}, lastEventDay: null, social: null }];
  return s;
}

/** The same with someone at every desk: two channel managers, every head of department and every kind of support staff. */
function staffed(): GameState {
  const s = empty();
  s.channels.push({ ...s.channels[0]!, id: 'ch2', name: 'Radio Two', managerId: 'cm2' });
  s.channels[0]!.managerId = 'cm1';
  s.employees = [
    employee('cm1', 'channelManager', { name: 'Ada Lovelace', level: 2 }),
    employee('cm2', 'channelManager', { name: 'Grace Hopper', level: 4 }),
    employee('hp', 'manager', { name: 'Head Production', department: 'production' }),
    employee('hs', 'manager', { name: 'Head Sales', department: 'sales' }),
    employee('hm', 'manager', { name: 'Head Marketing', department: 'marketing' }),
    employee('hr', 'manager', { name: 'Head Research', department: 'research' }),
    employee('rec', 'recruiter', { name: 'Rita Recruiter' }),
    employee('cl', 'cleaner', { name: 'Carl Cleaner' }),
    employee('te', 'technician', { name: 'Tess Technician' }),
    employee('ma', 'maintenance', { name: 'Max Maintenance' }),
  ];
  return s;
}

describe('the inbox (0.17.0, #60)', () => {
  describe('who sends what', () => {
    it('takes the desk from the topic and the window when the message names none', () => {
      expect(deskOf({ topic: 'milestone' })).toBe('tabby');
      expect(deskOf({ topic: 'event' })).toBe('penny');
      expect(deskOf({ about: 'sales' })).toBe('sales');
      expect(deskOf({ about: 'marketing' })).toBe('marketing');
      expect(deskOf({ about: 'research' })).toBe('research');
      expect(deskOf({ about: 'broadcast:channels' })).toBe('channel');
      expect(deskOf({ about: 'licenses' })).toBe('channel');
      expect(deskOf({ about: 'broadcast:content' })).toBe('production');
      expect(deskOf({ about: 'staff' })).toBe('staff');
      expect(deskOf({})).toBe('penny');
    });

    it('has someone at every desk of a fully staffed company, and Tabby and Penny at their own', () => {
      const s = staffed();
      const sender = (desk: Desk) => senderFor(s, {}, desk);
      expect(sender('channel').name).toBe('Grace Hopper');
      expect(senderFor(s, {}, { desk: 'channel', channelId: 'ch1' })).toEqual({ name: 'Ada Lovelace', title: 'Channel manager, Radio One', kind: 'staff' });
      expect(sender('production')).toEqual({ name: 'Head Production', title: 'Head of Production', kind: 'staff' });
      expect(sender('sales').title).toBe('Head of Sales');
      expect(sender('marketing').title).toBe('Head of Marketing');
      expect(sender('research').title).toBe('Head of R&D');
      expect(sender('staff')).toEqual({ name: 'Rita Recruiter', title: 'Recruiter', kind: 'staff' });
      expect(sender('cleaner').name).toBe('Carl Cleaner');
      expect(sender('technician')).toEqual({ name: 'Tess Technician', title: 'Technician', kind: 'staff' });
      expect(sender('maintenance').name).toBe('Max Maintenance');
      expect(sender('tabby')).toEqual(TABBY);
      expect(sender('penny')).toEqual(PENNY);
      expect(senderFor({ ...s, techs: [...s.techs, 'personalComputer'] }, {}, 'technician').title).toBe('IT technician');
    });

    it('falls back to the department’s own people, the channel managers for production, and then to Penny', () => {
      const s = staffed();
      s.employees = s.employees.filter((e) => e.role !== 'manager');
      s.employees.push(employee('s1', 'sales', { name: 'Sam Sales', level: 1 }), employee('s2', 'sales', { name: 'Sue Sales', level: 3 }));
      expect(senderFor(s, {}, 'sales').name).toBe('Sue Sales');
      expect(senderFor(s, {}, 'production').title).toMatch(/^Channel manager/);
      expect(senderFor(s, {}, 'research')).toEqual(PENNY);
      const none = empty();
      for (const desk of ['channel', 'production', 'sales', 'marketing', 'research', 'staff', 'cleaner', 'technician', 'maintenance'] as const) {
        expect(senderFor(none, {}, desk)).toEqual(PENNY);
      }
    });

    it('keeps a copy of the sender, so an e-mail reads the same after they leave', () => {
      const s = staffed();
      addMessage(s, 'info', 'Weekly ratings are in: 1,000 listeners on average.', undefined, undefined, 'channel');
      s.employees = [];
      expect(s.messages.at(-1)!.from).toEqual({ name: 'Grace Hopper', title: 'Channel manager, Radio Two', kind: 'staff' });
      expect(s.messages.at(-1)!.read).toBe(false);
    });

    it('has the channel manager send the weekly ratings, and Tabby a milestone, in a game that runs', () => {
      let s = sensibleBot(createInitialState(1));
      for (let i = 0; i < 4 && !s.bankrupt; i++) s = sensibleBot(advance(s, 7));
      const ratings = s.messages.filter((m) => m.text.startsWith('Weekly ratings are in'));
      expect(ratings.length).toBeGreaterThan(0);
      for (const m of ratings) expect(m.from.title).toMatch(/^Channel manager/);
      for (const m of s.messages.filter((m) => m.topic === 'milestone')) expect(m.from).toEqual(TABBY);
    });
  });

  describe('priority', () => {
    it('is high for trouble and milestones, medium for warnings, windows, events and good news, low for the rest', () => {
      expect(priorityOf({ kind: 'danger' })).toBe('high');
      expect(priorityOf({ kind: 'good', topic: 'milestone' })).toBe('high');
      expect(priorityOf({ kind: 'warning' })).toBe('medium');
      expect(priorityOf({ kind: 'info', about: 'sales' })).toBe('medium');
      expect(priorityOf({ kind: 'info', topic: 'event' })).toBe('medium');
      expect(priorityOf({ kind: 'good' })).toBe('medium');
      expect(priorityOf({ kind: 'good', topic: 'routine' })).toBe('low');
      expect(priorityOf({ kind: 'info' })).toBe('low');
    });
  });

  describe('addresses', () => {
    it('makes the company name fit for an address', () => {
      expect(slug('MvdM Media')).toBe('mvdm-media');
      expect(slug('  Café Ñandú & Co. ')).toBe('cafe-nandu-co');
      expect(slug('!!!')).toBe('');
    });

    it('writes staff at the company, every part of the name joined by dots, and Tabby and Penny at Loid Enterprises', () => {
      const staff = { name: 'Jan van Dijk', title: 'Recruiter', kind: 'staff' } as const;
      expect(addressOf(staff, 'MvdM Media')).toBe('jan.van.dijk@mvdm-media.eth');
      expect(addressOf({ ...staff, name: 'Zoë O’Neill' }, 'Ætherwave')).toBe('zoe.o-neill@therwave.eth');
      expect(addressOf(staff, '???')).toBe('jan.van.dijk@company.eth');
      expect(addressOf(TABBY, 'MvdM Media')).toBe('tabby@loid-enterprises.eth');
      expect(addressOf(PENNY, 'MvdM Media')).toBe('penny@loid-enterprises.eth');
      expect(yourAddress({ ...empty(), playerName: 'Mike de Mol', companyName: 'MvdM Media' })).toBe('mike.de.mol@mvdm-media.eth');
    });
  });

  describe('subjects', () => {
    it('are the text up to the first colon or full stop, cut short when long', () => {
      expect(subjectOf('Weekly ratings are in: 1,000 listeners on average.')).toBe('Weekly ratings are in');
      expect(subjectOf('Your loan is paid off.')).toBe('Your loan is paid off');
      expect(subjectOf('Ad rates are 12.5% lower')).toBe('Ad rates are 12.5% lower');
      const long = subjectOf('A very long sentence that goes on and on about nothing much at all and then some more.');
      expect(long.length).toBeLessThanOrEqual(60);
      expect(long.endsWith('…')).toBe(true);
    });
  });

  describe('the letter (0.19.0, #125)', () => {
    it('greets you, and is signed by the sender: Kind regards from staff and Penny, Yours sincerely from Tabby', () => {
      const s = staffed();
      s.playerName = 'Jo Player';
      const staff = { name: 'Ada Lovelace', title: 'Channel manager', kind: 'staff' as const };
      expect(letterOf(s, { text: 'Hello.', from: staff })).toEqual(['Dear Jo Player,', 'Hello.', 'Kind regards,\nAda Lovelace']);
      expect(letterOf(s, { text: 'Hello.', from: PENNY }).at(-1)).toBe('Kind regards,\nPenny Cash');
      expect(letterOf(s, { text: 'Hello.', from: TABBY }).at(-1)).toBe('Yours sincerely,\nTabby Loid');
    });

    it('has a paragraph for each blank line, and the first is the subject, the toast and the alert', () => {
      const text = 'Milestone reached: On the air.\n\nThank you. I’ve wired you €5,000.';
      expect(letterOf(staffed(), { text, from: TABBY })).toHaveLength(4);
      expect(firstParagraph(text)).toBe('Milestone reached: On the air.');
      expect(subjectOf(firstParagraph(text))).toBe('Milestone reached');
      expect(firstParagraph('One sentence.')).toBe('One sentence.');
    });

    it('has a researcher write about research, in turn by the techs researched, or the head of R&D, or Penny', () => {
      const s = staffed();
      expect(senderFor(s, {}, 'researcher').name).toBe('Head Research');
      s.employees.push(employee('r1', 'researcher', { name: 'Rosa One', hiredOn: 1 }), employee('r2', 'researcher', { name: 'Rosa Two', hiredOn: 2 }));
      s.techs = [];
      expect(senderFor(s, {}, 'researcher')).toEqual({ name: 'Rosa One', title: 'Researcher', kind: 'staff' });
      s.techs = ['fmStereo'];
      expect(senderFor(s, {}, 'researcher').name).toBe('Rosa Two');
      s.techs = ['fmStereo', 'soapOperaFormat'];
      expect(senderFor(s, {}, 'researcher').name).toBe('Rosa One');
      expect(senderFor(empty(), {}, 'researcher')).toEqual(PENNY);
    });

    it('sends one weekly ratings e-mail a week, and none about a single show', () => {
      let s = sensibleBot(createInitialState(1));
      for (let i = 0; i < 6 && !s.bankrupt; i++) s = sensibleBot(advance(s, 7));
      expect(s.messages.filter((m) => /drew \d+% fewer/.test(m.text) && !m.text.startsWith('Weekly ratings'))).toHaveLength(0);
      expect(s.messages.filter((m) => m.text.startsWith('Weekly ratings are in')).length).toBeGreaterThan(0);
    });

    it('has the Tabby milestone e-mail in his own words with its XP, and a level e-mail with the amount wired', () => {
      let s = sensibleBot(createInitialState(1));
      for (let i = 0; i < 3 && !s.bankrupt; i++) s = sensibleBot(advance(s, 7));
      const first = s.messages.find((m) => m.text.startsWith('Milestone reached: On the air.'));
      expect(first?.text).toMatch(/\+5 XP\.\n\n.*Thank you/);
      const level = structuredClone(s);
      level.xp = 30;
      checkMilestones(level);
      expect(level.messages.find((m) => m.text.startsWith('Level 1:'))?.text).toMatch(/\n\n.*I’ve wired you €20,000\./);
    });
  });

  describe('reading', () => {
    it('marks one e-mail or all of them read', () => {
      const s = empty();
      addMessage(s, 'info', 'One.');
      addMessage(s, 'info', 'Two.');
      expect(unreadCount(s)).toBe(2);
      const one = ok(readMessage(s, s.messages[0]!.id));
      expect(one.messages.map((m) => m.read)).toEqual([true, false]);
      expect(unreadCount(ok(readAllMessages(one)))).toBe(0);
      expect(readMessage(s, 9999).ok).toBe(false);
    });

    it('keeps what was read through a save and a load', () => {
      const s = empty();
      addMessage(s, 'info', 'One.');
      addMessage(s, 'warning', 'Two.', undefined, 'staff');
      const read = ok(readMessage(s, s.messages[0]!.id));
      const { state } = fromSaveFile(JSON.parse(JSON.stringify(toSaveFile(read, 0))));
      expect(state.messages.map((m) => m.read)).toEqual([true, false]);
      expect(state.messages[1]!.from).toEqual(read.messages[1]!.from);
    });

    it(`keeps the last ${MAX_MESSAGES}`, () => {
      const s = empty();
      for (let i = 0; i < MAX_MESSAGES + 20; i++) addMessage(s, 'info', `Message ${i}.`);
      const next = advance(s, 1);
      expect(next.messages.length).toBeLessThanOrEqual(MAX_MESSAGES);
      expect(next.messages.at(-1)!.id).toBeGreaterThanOrEqual(MAX_MESSAGES + 19);
    });
  });

  describe('an older save', () => {
    it('loads with every message read, sent by whoever works at its desk today, or by Penny', () => {
      const s = staffed();
      s.messages = [
        { id: 1, day: s.day, kind: 'good', text: 'Milestone reached: On the air.', topic: 'milestone' },
        { id: 2, day: s.day, kind: 'info', text: 'Sales brought in 2 new sponsor offers.', about: 'sales' },
        { id: 3, day: s.day, kind: 'warning', text: 'Room A is getting dirty.' },
      ] as GameState['messages'];
      s.nextMessageId = 4;
      const { state } = fromSaveFile({ ...JSON.parse(JSON.stringify(toSaveFile(s, 0))), version: 35 });
      expect(state.messages.every((m) => m.read)).toBe(true);
      expect(state.messages.map((m) => m.from.name)).toEqual(['Tabby Loid', 'Head Sales', 'Penny Cash']);
    });
  });
});
