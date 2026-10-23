import { SPEEDS, type Speed } from '../config/balance';

/** What the key handlers need to know about the element that has focus. */
type Focused = { tagName: string; type?: string; isContentEditable?: boolean } | null | undefined;

const TEXT_TYPES = ['', 'text', 'search', 'number', 'email', 'password', 'url', 'tel'];

/** A field you type into. Checkboxes, radio buttons, sliders and drop-down lists are not: they keep focus after a click. */
export function isTextField(target: Focused): boolean {
  if (!target) return false;
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true;
  return target.tagName === 'INPUT' && TEXT_TYPES.includes((target.type ?? '').toLowerCase());
}

/** The speed for the keys 1–3, by position on the keyboard (so AZERTY and the numpad work); undefined for other keys. */
export function speedForKey(code: string): Speed | undefined {
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  const speed: Speed | undefined = match ? SPEEDS[Number(match[1])] : undefined;
  return speed ? speed : undefined;
}
