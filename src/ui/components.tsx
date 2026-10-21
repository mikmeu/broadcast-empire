import { Icon } from './Icon';
import type { Feature } from '../config/unlocks';
import { lockedReason } from '../sim/unlocks';
import type { ReactNode } from 'react';
import type { Logo } from '../sim/state';
import type { ArticleId } from '../wiki/types';
import { HelpLink } from './HelpLink';

export function Panel({ title, actions, children, className, help }: {
  title?: ReactNode;
  actions?: ReactNode;
  /** The wiki article about this panel: a question mark beside the title opens it. */
  help?: ArticleId;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `panel ${className}` : 'panel'}>
      {(title || actions) && (
        <header className="panel-header">
          {title && (
            <h2>
              {title}
              {help && <HelpLink article={help} />}
            </h2>
          )}
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  /** What a dot beside the tab says; no dot without it. */
  dot?: string;
}

export interface TabGroupItem extends TabItem {
  tabs: TabItem[];
}

/**
 * Two rows of tabs (0.18.0): the groups, and under them the tabs of the open group, smaller. A group with one
 * tab has no second row. Used by the Rooms window and by the Staff window, so that they look and work the same.
 * `groupGuide` and `tabGuide` start the `data-guide` ids the tutorial points at (`<prefix>-<id>`).
 */
export function GroupedTabs({ groups, group, tab, onGroup, onTab, groupLabel, tabLabel, groupGuide, tabGuide, extra }: {
  groups: TabGroupItem[];
  /** The open group; null when something outside the groups is open (the `extra` tab). */
  group: string | null;
  tab: string;
  onGroup: (id: string) => void;
  onTab: (id: string) => void;
  groupLabel: string;
  tabLabel: string;
  groupGuide: string;
  tabGuide: string;
  /** More tabs at the end of the first row. */
  extra?: ReactNode;
}) {
  const label = ({ label, count, dot }: TabItem) => (
    <>
      {label}
      {count !== undefined && ` (${count})`}
      {dot && <span className="dot" role="img" aria-label={dot} />}
    </>
  );
  const open = groups.find((g) => g.id === group);
  return (
    <>
      <div className="segmented grouped-tabs" role="tablist" aria-label={groupLabel}>
        {groups.map((g) => (
          <button key={g.id} role="tab" data-guide={`${groupGuide}-${g.id}`} aria-selected={g.id === group} className={g.id === group ? 'active' : undefined} onClick={() => onGroup(g.id)}>
            {label(g)}
          </button>
        ))}
        {extra}
      </div>
      {open && open.tabs.length > 1 && (
        <div className="segmented grouped-tabs grouped-kinds" role="tablist" aria-label={tabLabel}>
          {open.tabs.map((t) => (
            <button key={t.id} role="tab" data-guide={`${tabGuide}-${t.id}`} aria-selected={t.id === tab} className={t.id === tab ? 'active' : undefined} onClick={() => onTab(t.id)}>
              {label(t)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** A 0–1 value as a small horizontal bar. */
export function Meter({ value, label, tone = 'accent' }: { value: number; label?: string; tone?: 'accent' | 'green' | 'yellow' }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <span className="meter" title={label} aria-label={label} role="img">
      <span className={`meter-fill ${tone}`} style={{ width: `${clamped * 100}%` }} />
    </span>
  );
}

export function LogoBadge({ logo, size = 32 }: { logo: Logo; size?: number }) {
  const shape = {
    circle: <circle cx="16" cy="16" r="15" />,
    square: <rect x="1" y="1" width="30" height="30" rx="5" />,
    diamond: <path d="M16 0 32 16 16 32 0 16Z" />,
    shield: <path d="M3 2h26v13c0 8-6 13-13 16C9 28 3 23 3 15Z" />,
  }[logo.shape];
  const fontSize = logo.initials.length > 2 ? 9 : 12;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="logo-badge" aria-hidden="true">
      <g fill={logo.color}>{shape}</g>
      <text x="16" y="16.5" textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} className="logo-initials">
        {logo.initials}
      </text>
    </svg>
  );
}

/** How every chart's tooltip looks: a small window. */
export const TOOLTIP_STYLE = { background: 'var(--surface)', border: '2px solid var(--border)', color: 'var(--text)' };

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Tag({ children, tone }: { children: ReactNode; tone?: 'good' | 'warning' | 'danger' }) {
  return <span className={tone ? `tag ${tone}` : 'tag'}>{children}</span>;
}

/** What stands where something is not open yet: a lock, and the milestone that opens it. */
export function LockNote({ feature }: { feature: Feature }) {
  return (
    <p className="lock-note">
      <Icon name="locked" size={20} />
      <span>{lockedReason(feature)}</span>
    </p>
  );
}
