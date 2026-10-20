// The company, the inbox and research.

import { cleanLook, isLook, type Look } from '../../config/looks';
import { toCalendarDate } from '../calendar';
import { cleanName } from '../newGame';
import { researchBlocker, researchCost } from '../tech';
import { isUnlocked, lockedReason } from '../unlocks';
import { getTech, type TechId } from '../../config/tech';
import { addMessage, type GameState } from '../state';
import { type ActionResult, act, fail } from './core';

/** Changes the name of the player and of the company. The headquarters stay where they are. */
export function renameCompany(state: GameState, playerName: string, companyName: string): ActionResult {
  return act(state, (draft) => {
    if (!cleanName(playerName)) return fail('Fill in your name.');
    if (!cleanName(companyName)) return fail('Give your company a name.');
    draft.playerName = cleanName(playerName);
    draft.companyName = cleanName(companyName);
  });
}

/** Changes what the player looks like: the CEO in the office. */
export function setLook(state: GameState, look: Look): ActionResult {
  return act(state, (draft) => {
    if (!isLook(look)) return fail('Choose a character.');
    draft.look = cleanLook(look);
  });
}

/** Opens an e-mail in the inbox: it is read. */
export function readMessage(state: GameState, messageId: number): ActionResult {
  return act(state, (draft) => {
    const message = draft.messages.find((m) => m.id === messageId);
    if (!message) return fail('That e-mail is no longer in the inbox.');
    message.read = true;
  });
}

/** Marks every e-mail in the inbox as read. */
export function readAllMessages(state: GameState): ActionResult {
  return act(state, (draft) => {
    for (const message of draft.messages) message.read = true;
  });
}

export function research(state: GameState, techId: TechId): ActionResult {
  return act(state, (draft) => {
    if (!isUnlocked(draft, 'research')) return fail(lockedReason('research'));
    const tech = getTech(techId);
    const blocker = researchBlocker(draft, tech);
    if (blocker) return fail(blocker === 'Not enough research points' ? `${tech.name} needs ${researchCost(tech, toCalendarDate(draft.day).year)} research points.` : `${tech.name}: ${blocker.toLowerCase()}.`);
    draft.researchPoints -= researchCost(tech, toCalendarDate(draft.day).year);
    draft.techs.push(techId);
    addMessage(draft, 'good', `Research complete: ${tech.name}. ${tech.description}`, undefined, undefined, 'research');
  });
}
