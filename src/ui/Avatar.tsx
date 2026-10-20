// A person's portrait: a picture of their 3D character (src/assets/avatars,
// drawn by scripts/avatars.html), so they look the same in lists as in the office.
// Uncle Tabby and Penny Cash have theirs from their story figures.

import { characterFor } from '../office/assets';
import type { Sender } from '../sim/state';

const FILES = import.meta.glob<string>('../assets/avatars/*.png', { query: '?url', import: 'default', eager: true });
const PORTRAITS = new Map(Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]));

/** The portrait that goes with a character's model file. */
const portraitOf = (file: string) => PORTRAITS.get(file.slice(file.lastIndexOf('/') + 1, -4));

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const src = portraitOf(characterFor(name));
  return src ? <img className="avatar" src={src} width={size} height={size} alt="" /> : null;
}

/** Whoever sent an e-mail (0.17.0): a member of staff by their name, or Tabby or Penny; their initial if there is no picture. */
export function SenderAvatar({ sender, size = 44 }: { sender: Sender; size?: number }) {
  const src = sender.kind === 'staff' ? portraitOf(characterFor(sender.name)) : PORTRAITS.get(sender.kind);
  if (src) return <img className="avatar" src={src} width={size} height={size} alt="" />;
  return (
    <span className="avatar avatar-initial" style={{ width: size, height: size, fontSize: size / 2 }} aria-hidden="true">
      {sender.name.charAt(0)}
    </span>
  );
}
