// A stand-in for the desktop app's mods folder, for trying the furniture editor in a browser while developing
// (`npm run dev`, `npm run review`). It is only there when Vite runs in development: a built game has no such thing.
// Pieces are kept in this browser's local storage, without their own model; export is a download and import a file chooser.

import { desktop, type DesktopBridge } from '../persistence/desktop';

type Mods = NonNullable<DesktopBridge['mods']>;

const KEY = 'broadcast-empire:dev-mods';

const read = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
};
const write = (pieces: Record<string, string>) => localStorage.setItem(KEY, JSON.stringify(pieces));

const browserMods = (): Mods => ({
  folder: async () => 'This browser (development only)',
  showFolder: async () => {},
  list: async () => Object.keys(read()),
  read: async (_kind, id) => {
    const text = read()[id];
    return text === undefined ? null : { text, model: false };
  },
  write: async (_kind, id, text) => write({ ...read(), [id]: text }),
  remove: async (_kind, id) => {
    const { [id]: _gone, ...rest } = read();
    write(rest);
  },
  importFile: () =>
    new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        resolve(file ? { fileName: file.name, text: await file.text() } : null);
      };
      input.oncancel = () => resolve(null);
      input.click();
    }),
  exportFile: async (_kind, suggestedName, text) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    link.download = suggestedName;
    link.click();
    URL.revokeObjectURL(link.href);
    return true;
  },
});

/** The desktop app's mods folder; in development in a browser, a stand-in for it; otherwise nothing. */
export const modsBridge: Mods | undefined = desktop?.mods ?? (import.meta.env.DEV && typeof localStorage !== 'undefined' ? browserMods() : undefined);
