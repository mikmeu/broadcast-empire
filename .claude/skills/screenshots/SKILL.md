---
name: screenshots
description: Use when a Broadcast Empire plan asks for pictures, or a change shows on screen (new room, decor, UI, wiki or website art) and needs a screenshot taken with npm run screenshot.
---

# Screenshots

`npm run screenshot -- <file of shots> [names]` opens the game in a real headless browser (Chromium via playwright-core, or Microsoft Edge on a Mac if `SCREENSHOT_BROWSER` isn't set) and saves pictures. See `scripts/screenshot.ts`'s header comment for the full usage.

## Steps

1. Write (or extend) a file under `scripts/shots/` that exports a default array of `Shot` (the type is in `scripts/shots/shot.ts`): each needs at least a `name` and a `file` (where the picture is written, `.png`/`.jpg`/`.webp`); most also need `prepare(page, game)` to get the game into the right state before the capture.
2. `prepare` gets `game`, a function that runs code in the page against the game's stores (`be.game`, `be.office`, `be.wiki`) — e.g. `game((be) => be.game.getState().newGame({ ... }))`. The function is sent to the page as text, so it can only use its own arguments and page globals, nothing from the surrounding file.
3. Use `selector: '.office3d canvas'` with `css: HIDE_OVERLAYS` (from `shot.ts`) for a clean shot of just the 3D view; leave both out for the whole window including menus.
4. Run it: `npm run screenshot -- scripts/shots/<file>.ts [shot names]`. Check the pictures land where expected.
5. Commit the shots file alongside the pictures it produced, so the same shots can be retaken later when the game changes.
