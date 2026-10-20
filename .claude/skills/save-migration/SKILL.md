---
name: save-migration
description: Use when a Broadcast Empire change adds, removes or reshapes a field on GameState (the save), so older saves keep loading. Covers bumping SAVE_VERSION, writing the migration and its test.
---

# Save migrations

A save is `{ version, savedAt, state }` (`src/sim/save.ts`). `SAVE_VERSION` is bumped once per shape change; `MIGRATIONS[n]` upgrades a version-`n` state to `n + 1`. `fromSaveFile` runs every migration from a save's version up to `SAVE_VERSION` in order, so each one only has to know the version right before it.

## Steps

1. Bump `export const SAVE_VERSION` by one in `src/sim/save.ts`.
2. Add an entry to `MIGRATIONS` keyed by the **old** version number (the one before your bump), e.g. a bump from 32 to 33 adds `32: (old) => { ... }`. Look at the entries just above yours first — most are `structuredClone(old)` as `GameState`, then `??=` the new field(s) to a sensible default for an existing game, with a one-line comment above the entry saying what changed and why the default is safe (see 14–31 for the style: short, in the player's terms, not the code's).
3. If the change should tell returning players something (a new mechanic, something now required that wasn't), push a message with `addMessage(s, 'info' | 'warning' | 'danger', text)` the way migrations 16, 18 and 31 do, instead of silently reshaping their game.
4. Add a test in `src/sim/save.test.ts` (see the "save migrations" describe block): build an old-shape record by hand at the old version, call `fromSaveFile`, and assert the new field(s) arrived with the right default. Don't round-trip through a full current-shape state — that only proves the migration you just wrote agrees with itself.
5. `npx vitest related src/sim/save.ts src/sim/save.test.ts --run`.

Never edit an old `MIGRATIONS` entry for a past version except to fix a bug in it: a save made between two versions must still migrate the way it did then.
