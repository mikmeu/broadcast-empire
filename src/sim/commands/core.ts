// What every command shares: the result, the copy of the state it works on, and paying.

import { spend } from '../economy';
import { type GameState, type Id } from '../state';

export type ActionResult = { ok: true; state: GameState; id?: Id } | { ok: false; error: string };

/** Runs `fn` on a copy of the state. `fn` returns an error string to abort, or an id it created. */
export function act(state: GameState, fn: (draft: GameState) => { error: string } | Id | void): ActionResult {
  if (state.bankrupt) return { ok: false, error: 'The company is bankrupt.' };
  const draft = structuredClone(state);
  const out = fn(draft);
  if (typeof out === 'object') return { ok: false, error: out.error };
  return { ok: true, state: draft, id: out ?? undefined };
}

export const fail = (error: string) => ({ error });

export const formatEuro = (n: number) => `€${n.toLocaleString('en-IE')}`;

export function pay(draft: GameState, amount: number, category: 'purchases' | 'revamps'): { error: string } | void {
  if (draft.money < amount) return fail(`Not enough money (${formatEuro(amount)} needed).`);
  spend(draft, amount, category);
}
