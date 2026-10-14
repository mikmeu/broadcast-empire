// The small markup the wiki's articles are written in.
//
// A paragraph is a string in which [[article-id]] links to an article by its
// title, [[article-id|other words]] links with other words, and **words** are
// set in bold. Nothing else: no nesting, no escaping.

export type Inline = { kind: 'text'; text: string } | { kind: 'bold'; text: string } | { kind: 'link'; to: string; text: string | undefined };

const TOKEN = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]|\*\*([^*]+)\*\*/g;

/** Splits a paragraph into plain text, bold text and links. A link without words of its own has `text` undefined. */
export function parseInline(source: string): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    if (match.index > last) parts.push({ kind: 'text', text: source.slice(last, match.index) });
    if (match[1]) parts.push({ kind: 'link', to: match[1], text: match[2] });
    else parts.push({ kind: 'bold', text: match[3]! });
    last = match.index + match[0].length;
  }
  if (last < source.length) parts.push({ kind: 'text', text: source.slice(last) });
  return parts;
}

/** Every article a paragraph links to. */
export const linksIn = (source: string) => parseInline(source).flatMap((part) => (part.kind === 'link' ? [part.to] : []));

/** A paragraph as plain words, for searching. */
export const plainText = (source: string, titleOf: (id: string) => string) =>
  parseInline(source)
    .map((part) => (part.kind === 'link' ? (part.text ?? titleOf(part.to)) : part.text))
    .join('');
