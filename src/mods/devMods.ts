// A stand-in for the desktop app's mods folder, for trying the furniture editor in a browser while developing
// (`npm run dev`, `npm run review`). It is only there when Vite runs in development: a built game has no such thing.
// Pieces are kept in this browser's local storage, without their own model; export is a download and import a file chooser.

import { desktop, type DesktopBridge, type ModKind } from '../persistence/desktop';

type Mods = NonNullable<DesktopBridge['mods']>;

const KEY = 'broadcast-empire:dev-mods';

/** The pieces by kind, then id. (Before maps came, the store was the furniture alone: a flat list of id to text.) */
type Stored = Partial<Record<ModKind, Record<string, string>>>;

const read = (kind: ModKind): Record<string, string> => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    if (Object.values(stored).some((value) => typeof value === 'string')) return kind === 'furniture' ? (stored as Record<string, string>) : {};
    return (stored as Stored)[kind] ?? {};
  } catch {
    return {};
  }
};
const write = (kind: ModKind, pieces: Record<string, string>) => {
  const other = (['furniture', 'maps'] as const).filter((k) => k !== kind);
  const stored: Stored = Object.fromEntries(other.map((k) => [k, read(k)]));
  localStorage.setItem(KEY, JSON.stringify({ ...stored, [kind]: pieces }));
};

const browserMods = (): Mods => ({
  folder: async () => 'This browser (development only)',
  showFolder: async () => {},
  list: async (kind) => Object.keys(read(kind)),
  read: async (kind, id) => {
    const text = read(kind)[id];
    return text === undefined ? null : { text, model: false };
  },
  write: async (kind, id, text) => write(kind, { ...read(kind), [id]: text }),
  remove: async (kind, id) => {
    const { [id]: _gone, ...rest } = read(kind);
    write(kind, rest);
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
