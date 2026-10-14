// Which build this is. The number comes from package.json when the game is built (vite.config.ts),
// so the browser, the desktop app and the installers all carry the same one.

declare const __APP_VERSION__: string;

/** The version of the game, as in package.json and CHANGELOG.md. */
export const VERSION: string = __APP_VERSION__;

/** How far along the game is. It changes by hand, with the release it belongs to. */
export const STAGE = 'Alpha';

/** What a playtester quotes with a note: “Alpha 0.8.0”. */
export const BUILD = `${STAGE} ${VERSION}`;
