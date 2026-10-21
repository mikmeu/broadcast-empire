// The game's icons (design/style.md). The SVG files in src/assets/icons are the
// designer's own drawings, or drawn to match them; they are inlined so that
// their ink and ground shadow follow the theme.

const FILES = import.meta.glob<string>('../assets/icons/*.svg', { query: '?raw', import: 'default', eager: true });

export type IconName =
  | 'calendar' | 'catalog' | 'channel' | 'check' | 'close-button' | 'construction-helmet' | 'content' | 'contract'
  | 'dollar-sign' | 'downward-trend' | 'edit' | 'euro' | 'finance' | 'happy-face' | 'listeners' | 'locked'
  | 'mail' | 'marketing' | 'milestones' | 'move' | 'open-window' | 'people' | 'policy' | 'quality' | 'rank'
  | 'ratings' | 'research' | 'sad-face' | 'schedule' | 'sell' | 'settings' | 'shows' | 'store' | 'turn' | 'upward-trend' | 'viewers' | 'wiki';

/** Colors in the files that stand for a role, so they change with the theme. */
const THEMED: [RegExp, string][] = [
  [/#452a65|#0b0b21/gi, 'currentColor'],
  [/#00b17a/gi, 'var(--good)'],
  [/#ff7979/gi, 'var(--negative)'],
];

interface Drawing {
  viewBox: string;
  ratio: number;
  body: string;
}

function parse(svg: string): Drawing {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 16 16';
  const [, , width = 16, height = 16] = viewBox.split(/\s+/).map(Number);
  let body = svg
    .replace(/<\?xml[^>]*\?>/, '')
    .replace(/<svg[^>]*>|<\/svg>/g, '')
    .replace(/\s(id|data-name)="[^"]*"/g, '')
    // The ellipse under the large icons is their shadow on the ground.
    .replace(/(<ellipse[^>]*fill:\s*)#e5dcff/gi, '$1var(--icon-ground)');
  for (const [color, role] of THEMED) body = body.replace(color, role);
  return { viewBox, ratio: width / height, body };
}

const DRAWINGS = new Map(Object.entries(FILES).map(([path, svg]) => [path.slice(path.lastIndexOf('/') + 1, -4), parse(svg)]));

/** `size` is the height in pixels; the width follows the drawing. */
export function Icon({ name, size = 16, label }: { name: IconName; size?: number; label?: string }) {
  const drawing = DRAWINGS.get(name);
  if (!drawing) return null;
  return (
    <svg
      className={`icon icon-${name}`}
      viewBox={drawing.viewBox}
      width={Math.round(size * drawing.ratio * 10) / 10}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: drawing.body }}
    />
  );
}
