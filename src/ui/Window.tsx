import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Where a window's top left corner is, in pixels from the corner of the stage. */
export interface WindowPlace {
  x: number;
  y: number;
}

/** How big a window has been made by dragging its edges, in pixels. */
export interface WindowSize {
  w: number;
  h: number;
}

/** How much of a window must stay on the stage, so its title bar can always be grabbed. */
const KEEP = { x: 96, y: 40 };

/** The smallest a window can be made: its title bar and a few lines. */
export const MIN_SIZE: WindowSize = { w: 360, h: 240 };

/** The gap a window keeps from the right and bottom edges of the stage when it is made bigger. */
const MARGIN = 12;

/**
 * Keeps a size a window is dragged to between its smallest and the edge of
 * the stage, seen from where the window stands. On a stage too small for the
 * smallest size, the smallest wins.
 */
export function fitSize(size: WindowSize, place: WindowPlace, stage: WindowSize): WindowSize {
  const fit = (value: number, min: number, room: number) => Math.round(Math.max(min, Math.min(value, room - MARGIN)));
  return { w: fit(size.w, MIN_SIZE.w, stage.w - place.x), h: fit(size.h, MIN_SIZE.h, stage.h - place.y) };
}

/** The edges a window is made bigger or smaller by: the right one, the bottom one, or both at the corner. */
type Grip = 'right' | 'bottom' | 'corner';
const GRIPS: Grip[] = ['right', 'bottom', 'corner'];

/**
 * A window above the office: drag it by its title bar, close it with the
 * button or Escape. Without a `place` it stands where its class puts it until
 * it is moved. With `onResize` its right and bottom edges can be dragged to
 * make it bigger or smaller; without a `size` it is as big as its class makes it.
 */
export function Window({ title, className, place, size, order = 0, minimized, onMove, onResize, onFocus, onClose, onMinimize, closeLabel = 'Close', children }: {
  title: ReactNode;
  className?: string;
  place?: WindowPlace;
  size?: WindowSize;
  /** Higher is closer to the front. */
  order?: number;
  minimized?: boolean;
  onMove: (place: WindowPlace) => void;
  /** Gives the window edges to drag; `undefined` puts it back to the size of its class. */
  onResize?: (size: WindowSize | undefined) => void;
  onFocus?: () => void;
  onClose: () => void;
  /** Gives the window a button that folds it up to its title bar and back. */
  onMinimize?: () => void;
  closeLabel?: string;
  children: ReactNode;
}) {
  const frame = useRef<HTMLElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const resize = useRef<{ grip: Grip; x: number; y: number; w: number; h: number } | null>(null);

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

  // Resizing works like moving: the grip keeps the pointer, and the size is counted from where the drag began.
  const startResize = (grip: Grip) => (e: PointerEvent<HTMLElement>) => {
    if (!frame.current) return;
    resize.current = { grip, x: e.clientX, y: e.clientY, w: frame.current.offsetWidth, h: frame.current.offsetHeight };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveResize = (e: PointerEvent<HTMLElement>) => {
    const stage = frame.current?.offsetParent?.getBoundingClientRect();
    const from = resize.current;
    if (!from || !stage || !frame.current || !onResize) return;
    const box = frame.current.getBoundingClientRect();
    const wanted = {
      w: from.grip === 'bottom' ? from.w : from.w + e.clientX - from.x,
      h: from.grip === 'right' ? from.h : from.h + e.clientY - from.y,
    };
    onResize(fitSize(wanted, { x: box.left - stage.left, y: box.top - stage.top }, { w: stage.width, h: stage.height }));
  };
  const endResize = () => {
    resize.current = null;
  };

  const sized = size && onResize ? size : undefined;
  const style = {
    zIndex: 10 + order,
    ...(place && { '--x': `${place.x}px`, '--y': `${place.y}px` }),
    ...(sized && { '--w': `${sized.w}px`, '--h': `${sized.h}px` }),
  } as CSSProperties;
  const classes = ['window', className, place && 'placed', sized && 'sized', minimized && 'minimized'].filter(Boolean).join(' ');

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
      {/* A folded window keeps its width and cannot be resized. */}
      {onResize &&
        !minimized &&
        GRIPS.map((grip) => (
          <div
            key={grip}
            className={`window-grip ${grip}`}
            aria-hidden="true"
            title={grip === 'corner' ? 'Drag to resize, double-click for the normal size' : undefined}
            onPointerDown={startResize(grip)}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            onDoubleClick={grip === 'corner' ? () => onResize(undefined) : undefined}
          />
        ))}
    </section>
  );
}
