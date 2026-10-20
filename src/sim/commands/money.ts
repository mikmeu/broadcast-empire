// The streaming service and the loans.

import { LOAN } from '../../config/balance';
import { loanPayment, maxLoan, spend } from '../economy';
import { announceService, priceError, roundPrice, streamingBlocker } from '../streaming';
import { addMessage, type GameState } from '../state';
import { type ActionResult, act, fail } from './core';

/** Opens the streaming service at a monthly price: every show and title on demand. Subscribers come over the weeks after. */
export function openStreaming(state: GameState, price: number): ActionResult {
  return act(state, (draft) => {
    const blocked = streamingBlocker(draft) ?? priceError(price);
    if (blocked) return fail(blocked);
    draft.streaming = { since: draft.day, price: roundPrice(price), subscribers: 0, weekAgo: 0, capped: false };
    announceService(draft);
  });
}

/** Changes what subscribers pay a month, from the next day on. */
export function setStreamingPrice(state: GameState, price: number): ActionResult {
  return act(state, (draft) => {
    if (!draft.streaming) return fail('You have no streaming service.');
    const blocked = priceError(price);
    if (blocked) return fail(blocked);
    draft.streaming.price = roundPrice(price);
  });
}

/** Closes the streaming service: its subscribers are gone, and a service opened again starts without any. */
export function closeStreaming(state: GameState): ActionResult {
  return act(state, (draft) => {
    if (!draft.streaming) return fail('You have no streaming service.');
    draft.streaming = null;
    addMessage(draft, 'info', 'Your streaming service is closed. Its subscribers have gone; one you open again starts without any.');
  });
}

export function takeLoan(state: GameState, amount: number, months: number): ActionResult {
  return act(state, (draft) => {
    if (draft.loan) return fail('Pay off your current loan first.');
    if (!LOAN.terms.includes(months)) return fail('Choose one of the loan terms.');
    if (amount < LOAN.minAmount) return fail(`The bank lends at least €${LOAN.minAmount.toLocaleString('en-IE')}.`);
    const limit = maxLoan(draft);
    if (amount > limit) return fail(`The bank lends you at most €${limit.toLocaleString('en-IE')} (half your company’s value).`);
    draft.money += amount;
    draft.ledger.loanProceeds += amount;
    draft.loan = { amount, balance: amount, monthlyPayment: loanPayment(amount, months), monthsLeft: months };
  });
}

/** Pays off the rest of the loan now (no early-repayment fee). */
export function repayLoan(state: GameState): ActionResult {
  return act(state, (draft) => {
    if (!draft.loan) return fail('You don’t have a loan.');
    const owed = Math.round(draft.loan.balance);
    if (draft.money < owed) return fail(`Not enough money (€${owed.toLocaleString('en-IE')} needed).`);
    spend(draft, owed, 'loanPayments');
    draft.loan = null;
  });
}
