import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Where a window's top left corner is, in pixels from the corner of the stage. */
export interface WindowPlace {
  x: number;
  y: number;
}

/** How much of a window must stay on the stage, so its title bar can always be grabbed. */
const KEEP = { x: 96, y: 40 };

/**
 * A window above the office: drag it by its title bar, close it with the
 * button or Escape. Without a `place` it stands where its class puts it until
 * it is moved.
 */
export function Window({ title, className, place, order = 0, minimized, onMove, onFocus, onClose, onMinimize, closeLabel = 'Close', children }: {
  title: ReactNode;
  className?: string;
  place?: WindowPlace;
  /** Higher is closer to the front. */
  order?: number;
  minimized?: boolean;
  onMove: (place: WindowPlace) => void;
  onFocus?: () => void;
  onClose: () => void;
  /** Gives the window a button that folds it up to its title bar and back. */
  onMinimize?: () => void;
  closeLabel?: string;
  children: ReactNode;
}) {
  const frame = useRef<HTMLElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // A window that opens takes the focus, so the keyboard continues inside it; a field inside that already has it keeps it.
  useEffect(() => {
    if (!frame.current?.contains(document.activeElement)) frame.current?.focus({ preventScroll: true });
  }, []);

  const startDrag = (e: PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button') || !frame.current) return;
    const box = frame.current.getBoundingClientRect();
    drag.current = { dx: e.clientX - box.left, dy: e.clientY - box.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: PointerEvent<HTMLElement>) => {
    const stage = frame.current?.offsetParent?.getBoundingClientRect();
    if (!drag.current || !stage || !frame.current) return;
    const width = frame.current.offsetWidth;
    const x = Math.min(stage.width - KEEP.x, Math.max(KEEP.x - width, e.clientX - drag.current.dx - stage.left));
    const y = Math.min(stage.height - KEEP.y, Math.max(0, e.clientY - drag.current.dy - stage.top));
    onMove({ x, y });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const style = { zIndex: 10 + order, ...(place && { '--x': `${place.x}px`, '--y': `${place.y}px` }) } as CSSProperties;
  const classes = ['window', className, place && 'placed', minimized && 'minimized'].filter(Boolean).join(' ');

  return (
    <section
      ref={frame}
      className={classes}
      style={style}
      role="dialog"
      aria-label={typeof title === 'string' ? title : undefined}
      tabIndex={-1}
      onPointerDown={onFocus}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="window-bar" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <h2>{title}</h2>
        {onMinimize && (
          <button className="window-button" onClick={onMinimize} aria-expanded={!minimized} aria-label={minimized ? 'Maximize' : 'Minimize'} title={minimized ? 'Maximize' : 'Minimize'}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              {minimized ? <rect x="2" y="2" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" /> : <rect x="2" y="9.5" width="10" height="2.5" fill="currentColor" />}
            </svg>
          </button>
        )}
        <button className="window-button" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <Icon name="close-button" size={18} />
        </button>
      </header>
      {!minimized && <div className="window-body">{children}</div>}
    </section>
  );
}
