// The mods folder (0.21.0): pieces made by players, in userData/mods/<kind>/<id>/.
// Kept apart from main.cjs so a test can reach it. Everything that turns a name from the
// page, or a path from a web address, into a file goes through here.
//
// A piece is `piece.json` (its numbers, parts and spots) and, if it has a model of its own,
// `model.glb` beside it. What is inside them is for the checker in src/mods/ to judge; this
// file keeps them where they belong and no bigger than the limits (MODS in src/config/balance.ts).

const fs = require('node:fs/promises');
const path = require('node:path');

/** The kinds of mod there are. A map is `piece.json` too (0.21.0, #284); the game does not load maps from here before #290. */
const MOD_KINDS = ['furniture', 'maps'];
/** Ids become folder names, so they are limited to what is safe as one (the same as a save's). */
const MOD_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** The only files in a piece's folder. */
const MOD_FILES = ['piece.json', 'model.glb'];
/** The same numbers as `MODS` in src/config/balance.ts (a test holds them equal). */
const LIMITS = { fileBytes: 8_000_000, modelBytes: 5_000_000 };

/** The file for a piece. Throws for a kind, id or file name that is not allowed. */
function modPath(root, kind, id, file) {
  if (!MOD_KINDS.includes(kind)) throw new Error('Not a kind of mod.');
  if (typeof id !== 'string' || !MOD_ID.test(id)) throw new Error('Not a mod id.');
  if (!MOD_FILES.includes(file)) throw new Error('Not a mod file.');
  return path.join(root, kind, id, file);
}

/**
 * The file a web address under /mods/ stands for, or null: for anything that is not exactly
 * /mods/<kind>/<id>/<file> of an allowed kind, id and file, for a link that leads out of the
 * folder, and for a file that is not there.
 */
async function resolveServed(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\\') || decoded.includes('\0')) return null;
  const parts = decoded.split('/');
  if (parts.length !== 5 || parts[0] !== '' || parts[1] !== 'mods') return null;
  let file;
  try {
    file = modPath(root, parts[2], parts[3], parts[4]);
    // A link inside the folder may not lead out of it.
    const [real, base] = await Promise.all([fs.realpath(file), fs.realpath(root)]);
    return real.startsWith(base + path.sep) ? real : null;
  } catch {
    return null;
  }
}

/** The calls on the mods folder at `root`. */
function createMods(root) {
  const folder = (kind, id) => path.dirname(modPath(root, kind, id, 'piece.json'));
  const missing = (error) => (error.code === 'ENOENT' ? null : Promise.reject(error));
  return {
    root: () => root,
    list: async (kind) => {
      modPath(root, kind, 'a', 'piece.json');
      const entries = await fs.readdir(path.join(root, kind), { withFileTypes: true }).catch(() => []);
      const ids = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || !MOD_ID.test(entry.name)) continue;
        if (await fs.stat(path.join(root, kind, entry.name, 'piece.json')).then((s) => s.isFile(), () => false)) ids.push(entry.name);
      }
      return ids.sort();
    },
    read: async (kind, id) => {
      const text = await fs.readFile(modPath(root, kind, id, 'piece.json'), 'utf8').catch(missing);
      if (text === null) return null;
      const model = await fs.stat(modPath(root, kind, id, 'model.glb')).then((s) => s.isFile(), () => false);
      return { text, model };
    },
    /** `glb` is the bytes of the model, or left out for a piece without one of its own. */
    write: async (kind, id, text, glb) => {
      const dir = folder(kind, id);
      if (typeof text !== 'string' || Buffer.byteLength(text) > LIMITS.fileBytes) throw new Error('A piece is text, and not bigger than the limit.');
      if (glb !== undefined && (!(glb instanceof Uint8Array) || glb.byteLength > LIMITS.modelBytes)) throw new Error('A model is bytes, and not bigger than the limit.');
      await fs.mkdir(dir, { recursive: true });
      // Written beside the file and then moved over it, as saves are.
      if (glb !== undefined) {
        const model = modPath(root, kind, id, 'model.glb');
        await fs.writeFile(`${model}.tmp`, glb);
        await fs.rename(`${model}.tmp`, model);
      } else {
        await fs.rm(modPath(root, kind, id, 'model.glb'), { force: true });
      }
      const piece = modPath(root, kind, id, 'piece.json');
      await fs.writeFile(`${piece}.tmp`, text, 'utf8');
      await fs.rename(`${piece}.tmp`, piece);
    },
    remove: async (kind, id) => {
      await fs.rm(folder(kind, id), { recursive: true, force: true });
    },
  };
}

module.exports = { MOD_KINDS, MOD_ID, MOD_FILES, LIMITS, modPath, resolveServed, createMods };
