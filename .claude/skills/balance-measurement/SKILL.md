---
name: balance-measurement
description: Use when a Broadcast Empire change moves money, morale, viewers, costs or difficulty, to measure what it did to the test players before saying so in a result or plan.
---

# Measuring a balance change

The test players are the bots in `src/sim/bots.ts` (`sensible`, `capital`, `neglectful`, `growth`, `network`, `nosupport`, `research`, `tv`), played headlessly by `npm run simulate`.

## Steps

1. Before your change (or on `main`/the version branch before the issue's commits), run the bots the change could plausibly touch, at a couple of years and the difficulties that matter:
   `npm run simulate -- --bot sensible --years 3 --seed 42` (repeat with other bots/`--difficulty hard` if the change is difficulty-specific).
2. Note from its monthly table: `balance` (bank balance), `morale`, `clean`/`broken` (upkeep), `you`/`topRival` (audience), and whether `state.bankrupt` is ever hit (the run stops early if so — that alone is the headline finding).
3. Make your change, run the same command with the same `--seed`, and compare the same columns at the same months/years.
4. In your result or plan, name the bot(s) and figures that moved and by how much ("the neglectful bot's year-2 balance drops from ~€40k to ~€12k"), not just "balance changes". If nothing measurable moved, say that too — it's as useful as a number.
5. A bot going bankrupt that didn't before, or the reverse, is always worth a line even if nothing else did.

This is a manual before/after comparison, not a pass/fail test — there is no single `balance.test.ts` with fixed thresholds. Existing `src/sim/*.test.ts` files do assert specific numbers in places (revenue, listeners); run `npx vitest related <files you touched> --run` as usual and treat a moved assertion there the same way: measure it, say so, and only loosen the assertion with the reason written next to it.
