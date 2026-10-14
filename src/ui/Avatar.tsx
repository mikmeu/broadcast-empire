// A person's portrait: a picture of their 3D character (src/assets/avatars,
// drawn by scripts/avatars.html), so they look the same in lists as in the office.

import { characterFor } from '../office/assets';

const FILES = import.meta.glob<string>('../assets/avatars/*.png', { query: '?url', import: 'default', eager: true });
const PORTRAITS = new Map(Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]));

/** The portrait that goes with a character's model file. */
const portraitOf = (file: string) => PORTRAITS.get(file.slice(file.lastIndexOf('/') + 1, -4));

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const src = portraitOf(characterFor(name));
  return src ? <img className="avatar" src={src} width={size} height={size} alt="" /> : null;
}
