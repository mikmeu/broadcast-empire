import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { installUiSounds } from '../audio/player';
import { BANKRUPTCY_MONTHS, SPEEDS } from '../config/balance';
import { CheatConsole } from './CheatConsole';
import { desktop } from '../persistence/desktop';
import { Guide } from './Guide';
import { HomeScreen } from './HomeScreen';
import { Icon, type IconName } from './Icon';
import { BroadcastScreen } from './screens/BroadcastScreen';
import { useOnAir, type BroadcastSection } from './onAir';
import { CatalogScreen } from './screens/CatalogScreen';
import { FinanceScreen } from './screens/FinanceScreen';
import { LicensesScreen } from './screens/LicensesScreen';
import { OfficeOverview, OfficeStage } from './screens/OfficeScreen';
import { MarketingScreen } from './screens/MarketingScreen';
import { MilestonesScreen } from './screens/MilestonesScreen';
import { ResearchScreen } from './screens/ResearchScreen';
import { SalesScreen } from './screens/SalesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StaffScreen } from './screens/StaffScreen';
import { WikiScreen } from './screens/WikiScreen';
import { useWiki } from './wiki';
import { useOfficeView } from './officeView';
import { getMilestone } from '../config/milestones';
import { UNLOCKS, type Feature } from '../config/unlocks';
import type { GameState } from '../sim/state';
import { findRoom, roomLayout } from '../sim/office';
import { milestoneReward } from '../sim/milestones';
import { isUnlocked, lockedReason } from '../sim/unlocks';
import { formatMoney } from './format';
import { useGameStore } from './store';
import { StatusBar } from './StatusBar';
import { useGameLoop } from './useGameLoop';
import { Window, type WindowPlace } from './Window';

const NOTICE_MS = 4000;
/** How long a pop-up about a window stays up when nobody touches it. */
const ALERT_MS = 12000;

/** The windows that open above the office. Those with a `Screen` show it; the broadcasting window has its own sections. */
const WINDOWS = {
  office: { label: 'Office', icon: 'construction-helmet', Screen: OfficeOverview, narrow: true },
  catalog: { label: 'Rooms', icon: 'catalog', Screen: CatalogScreen, narrow: true, folds: true },
  staff: { label: 'Staff', icon: 'people', Screen: StaffScreen },
  broadcast: { label: 'On air', icon: 'channel' },
  licenses: { label: 'Licenses', icon: 'policy', Screen: LicensesScreen },
  sales: { label: 'Sales', icon: 'contract', Screen: SalesScreen },
  marketing: { label: 'Marketing', icon: 'marketing', Screen: MarketingScreen },
  research: { label: 'Research', icon: 'research', Screen: ResearchScreen },
  finance: { label: 'Finance', icon: 'finance', Screen: FinanceScreen },
  milestones: { label: 'Milestones', icon: 'milestones', Screen: MilestonesScreen, narrow: true },
  wiki: { label: 'Wiki', icon: 'wiki', Screen: WikiScreen },
  settings: { label: 'Settings', icon: 'settings', Screen: SettingsScreen, narrow: true },
} satisfies Record<string, { label: string; icon: IconName; Screen?: () => ReactNode; narrow?: boolean; folds?: boolean }>;
export type WindowId = keyof typeof WINDOWS;

/** Where a line of the tutorial sends the player: a window, and for the broadcasting window one of its sections. */
export type Destination = WindowId | `broadcast:${BroadcastSection}` | 'floor';

/** The windows a new company cannot open yet, and what has to be open first. */
const LOCKS: Partial<Record<WindowId, Feature>> = { sales: 'sales', marketing: 'marketing', research: 'research' };

/** Settings opens from the cog in the top right corner; the rest from the menu beside the office. */
const MENU = (Object.keys(WINDOWS) as WindowId[]).filter((id) => id !== 'settings');

/** Which windows are open (back to front) and where each one was last left. */
function useWindows() {
  const [open, setOpen] = useState<WindowId[]>([]);
  const [places, setPlaces] = useState<Partial<Record<WindowId, WindowPlace>>>({});
  /** Windows folded up to their title bar. */
  const [folded, setFolded] = useState<WindowId[]>([]);

  const show = (id: WindowId) => {
    setOpen((list) => [...list.filter((w) => w !== id), id]);
    // A window that opens for the first time steps down and to the right of the last one.
    setPlaces((all) => (all[id] ? all : { ...all, [id]: { x: 104 + (Object.keys(all).length % 5) * 28, y: 12 + (Object.keys(all).length % 5) * 28 } }));
  };
  const close = (id: WindowId) => setOpen((list) => list.filter((w) => w !== id));
  /** Clears the view: every window goes, so that the office and the buttons above it are in reach. */
  const closeAll = () => setOpen([]);
  /** The menu button of a window: open it, bring it to the front, or close it when it is in front already. */
  const toggle = (id: WindowId) => (open[open.length - 1] === id ? close(id) : show(id));
  const move = (id: WindowId, place: WindowPlace) => setPlaces((all) => ({ ...all, [id]: place }));
  const fold = (id: WindowId, yes: boolean) => setFolded((list) => (yes ? [...list.filter((w) => w !== id), id] : list.filter((w) => w !== id)));

  return { open, places, folded, show, close, closeAll, toggle, move, fold };
}

export function App() {
  const game = useGameStore((s) => s.game);
  const ready = useGameStore((s) => s.ready);
  const atHome = useGameStore((s) => s.atHome);
  const notice = useGameStore((s) => s.notice);
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion);
  const windows = useWindows();
  const placing = useOfficeView((s) => s.placing !== null);

  // A help icon or the tutorial asked for an article: the wiki comes to the front.
  const asked = useWiki((s) => s.asked);
  useEffect(() => {
    if (asked > 0) windows.show('wiki');
  }, [asked]);

  // The catalog folds up while a piece from it is being placed, so the office is in view, and comes back after.
  useEffect(() => windows.fold('catalog', placing), [placing]);

  useEffect(() => {
    void useGameStore.getState().boot();
    // In the desktop app, closing the window saves the game in play first.
    desktop?.onClosing(() => {
      const { settings, autosave } = useGameStore.getState();
      void (settings.autosave ? autosave() : Promise.resolve()).finally(() => desktop?.close());
    });
  }, []);

  useGameLoop();
  useKeyboardShortcuts();
  // Every button, tab and list on the page gets its sound from here.
  useEffect(() => installUiSounds(), []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useGameStore.setState({ notice: undefined }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // A window that is open has been seen: the dot on its menu icon goes.
  const attention = useGameStore((s) => s.attention);
  useEffect(() => windows.open.forEach((id) => useGameStore.getState().attend(id)), [windows.open, attention]);

  if (!ready) return <div className="loading">Tuning in…</div>;

  const toast = notice && (
    <div key={notice.text} className={`notice ${notice.kind}`} role="status" aria-live="polite">
      {notice.text}
    </div>
  );
  const home = (atHome || !game) && <HomeScreen />;
  if (!game) {
    return (
      <div className="app">
        {home}
        {toast}
      </div>
    );
  }

  const go = (to: Destination) => {
    // The office itself: what is in front of it is put away.
    if (to === 'floor') return windows.closeAll();
    const [id, part] = to.split(':') as [WindowId, BroadcastSection | undefined];
    const lock = LOCKS[id];
    if (lock && !isUnlocked(game, lock)) return useGameStore.getState().notify(lockedReason(lock));
    if (part) useOnAir.getState().show(part);
    windows.show(id);
    windows.fold(id, false);
  };

  return (
    <div className={reduceMotion ? 'app reduce-motion' : 'app'}>
      {/* The game stays in place under the home screen, paused and out of reach, so coming back is instant. */}
      <div className="game" inert={atHome}>
        <main className="stage">
          <OfficeStage onCatalog={() => (windows.show('catalog'), windows.fold('catalog', false))} />
          <nav className="dock" aria-label="Windows">
            {MENU.map((id) => (
              <DockButton key={id} id={id} game={game} open={windows.open.includes(id)} news={attention.some((about) => windowOf(about) === id)} onToggle={() => (id === 'catalog' && catalogAtRoom(game), windows.toggle(id))} />
            ))}
          </nav>
          <button
            className={windows.open.includes('settings') ? 'tab settings-button active' : 'tab settings-button'}
            onClick={() => windows.toggle('settings')}
            aria-pressed={windows.open.includes('settings')}
            aria-label="Settings"
            title="Settings: save, load, new game and options"
          >
            <Icon name="settings" size={44} />
          </button>
          {game.negativeMonths > 0 && !game.bankrupt && <RedInkBanner left={BANKRUPTCY_MONTHS - game.negativeMonths} />}
          {windows.open.map((id, order) => {
            const { label, Screen, narrow, folds } = WINDOWS[id] as { label: string; Screen?: () => ReactNode; narrow?: boolean; folds?: boolean };
            const folded = windows.folded.includes(id);
            return (
              <Window
                key={id}
                title={label}
                className={narrow ? 'narrow' : undefined}
                place={windows.places[id]}
                order={order}
                minimized={folded}
                onMinimize={folds ? () => windows.fold(id, !folded) : undefined}
                onMove={(place) => windows.move(id, place)}
                onFocus={() => windows.open[windows.open.length - 1] !== id && windows.show(id)}
                onClose={() => windows.close(id)}
              >
                {Screen ? <Screen /> : <BroadcastScreen />}
              </Window>
            );
          })}
          <Alerts onGo={go} />
          <Guide game={game} onGo={go} />
          <MilestonePopup onGo={go} />
          <CheatConsole />
        </main>
        <StatusBar game={game} />
        {game.bankrupt && !atHome && <BankruptOverlay />}
      </div>
      {home}
      {toast}
    </div>
  );
}

/** The catalog opens at the kind of room that is selected in the office, if one is. */
function catalogAtRoom(game: GameState) {
  const { roomId, openCatalog } = useOfficeView.getState();
  // A room of the building itself (the reception) is only written into the game once something stands in it.
  const type = roomId ? (findRoom(game, roomId)?.type ?? roomLayout(game, roomId)?.fixed) : null;
  if (type) openCatalog(type);
}

/** The window a piece of news is about: news about a section of the broadcasting window is about that window. */
const windowOf = (about: string) => about.split(':')[0] as WindowId;

/** A window's button in the menu. One that is not open to the company yet is dimmed, with a lock, and says what opens it. */
function DockButton({ id, game, open, news, onToggle }: { id: WindowId; game: GameState; open: boolean; news: boolean; onToggle: () => void }) {
  const { label, icon } = WINDOWS[id];
  const lock = LOCKS[id];
  if (lock && !isUnlocked(game, lock)) {
    const why = lockedReason(lock);
    return (
      <button data-guide={`dock-${id}`} className="tab locked" aria-disabled="true" title={why} data-sound="denied" onClick={() => useGameStore.getState().notify(why)}>
        <Icon name={icon} size={28} />
        <span>{label}</span>
        <span className="lock" role="img" aria-label={`Locked: ${why}`}>
          <Icon name="locked" size={14} />
        </span>
      </button>
    );
  }
  return (
    <button data-guide={`dock-${id}`} className={open ? 'tab active' : 'tab'} aria-pressed={open} onClick={onToggle}>
      <Icon name={icon} size={28} />
      <span>{label}</span>
      {news && <span className="dot" role="img" aria-label="Something new" />}
    </button>
  );
}

/**
 * News about a window, one pop-up each: what happened, a button that opens
 * the window, and one that puts the pop-up away. Left alone it goes by itself.
 */
function Alerts({ onGo }: { onGo: (to: Destination) => void }) {
  const alerts = useGameStore((s) => s.alerts);
  const dismiss = useGameStore((s) => s.dismissAlert);
  const oldest = alerts[0]?.id;
  useEffect(() => {
    if (oldest === undefined) return;
    const timer = setTimeout(() => dismiss(oldest), ALERT_MS);
    return () => clearTimeout(timer);
  }, [oldest, dismiss]);

  if (alerts.length === 0) return null;
  return (
    <div className="alerts" role="status" aria-live="polite">
      {alerts.map((alert) => {
        const { label, icon } = WINDOWS[windowOf(alert.about!)];
        return (
          <div key={alert.id} className="alert">
            <Icon name={icon} size={28} />
            <span className="alert-text">{alert.text}</span>
            <button
              className="primary"
              onClick={() => {
                onGo(alert.about!);
                dismiss(alert.id);
              }}
            >
              Open {label}
            </button>
            <button className="window-button" onClick={() => dismiss(alert.id)} aria-label="Dismiss" title="Dismiss">
              <Icon name="close-button" size={18} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Colours and places of the confetti, spread evenly with the golden ratio so that every pop-up looks the same. */
const CONFETTI = Array.from({ length: 48 }, (_, i) => {
  const spread = (i * 0.618034) % 1;
  return {
    '--x': `${(spread * 100).toFixed(1)}%`,
    '--delay': `${((i * 0.37) % 1.4).toFixed(2)}s`,
    '--fall': `${(2.4 + ((i * 0.53) % 1.6)).toFixed(2)}s`,
    '--spin': `${360 + Math.round(spread * 720)}deg`,
    '--colour': `var(--confetti-${(i % 5) + 1})`,
  } as CSSProperties;
});

/**
 * A milestone, in a pop-up of its own over a paused game, with confetti, and
 * what it has opened with a button to go there. With "reduce motion" on it
 * comes without the confetti.
 */
function MilestonePopup({ onGo }: { onGo: (to: Destination) => void }) {
  const celebration = useGameStore((s) => s.celebration);
  const reduceMotion = useGameStore((s) => s.settings.reduceMotion);
  const close = useGameStore((s) => s.closeCelebration);
  const game = useGameStore((s) => s.game);
  const shown = celebration !== undefined;
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (shown) first.current?.focus();
  }, [shown]);
  if (!celebration) return null;

  const { milestones, opened, resume } = celebration;
  return (
    <div className="overlay celebration" role="dialog" aria-modal="true" aria-labelledby="milestone-title" onKeyDown={(e) => e.key === 'Escape' && close()}>
      {!reduceMotion && (
        <div className="confetti" aria-hidden="true">
          {CONFETTI.map((style, i) => <i key={i} style={style} />)}
        </div>
      )}
      <div className="overlay-card milestone-card">
        <Icon name="milestones" size={56} />
        <h2 id="milestone-title">{milestones.length === 1 ? 'Milestone reached' : 'Milestones reached'}</h2>
        <ul className="milestone-list">
          {milestones.map((id) => (
            <li key={id}>
              <strong>{getMilestone(id).name}</strong>
              <span className="muted">{getMilestone(id).description}</span>
              {game && milestoneReward(game, id) > 0 && <span className="milestone-reward">Uncle Tabby sends {formatMoney(milestoneReward(game, id))}</span>}
            </li>
          ))}
        </ul>
        {opened.length > 0 && (
          <>
            <h3>Now open</h3>
            <ul className="milestone-list">
              {opened.map((feature) => {
                const unlock = UNLOCKS[feature];
                return (
                  <li key={feature}>
                    <strong>{unlock.name}</strong>
                    <span className="muted">{unlock.opens[0]!.toUpperCase() + unlock.opens.slice(1)}.</span>
                    <button
                      onClick={() => {
                        close();
                        onGo(unlock.window);
                      }}
                    >
                      Open {WINDOWS[windowOf(unlock.window)].label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div className="row">
          <button ref={first} className="primary" onClick={close}>{resume ? 'Continue' : 'Close'}</button>
          {resume && <span className="muted small">The game waits until then.</span>}
        </div>
      </div>
    </div>
  );
}

function RedInkBanner({ left }: { left: number }) {
  return (
    <div className="banner danger" role="alert">
      You’re in the red. Get back above €0 by the end of the month: {left} month-end{left === 1 ? '' : 's'} left before
      bankruptcy.
    </div>
  );
}

function BankruptOverlay() {
  const game = useGameStore((s) => s.game);
  const { newGame, loadLatest, openHome } = useGameStore.getState();
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="bankrupt-title">
      <div className="overlay-card">
        <h2 id="bankrupt-title">Bankrupt</h2>
        <p>Three month-ends in the red, and the bank has pulled the plug. The transmitters go quiet.</p>
        <div className="row">
          {/* The same names in the same region; the main menu has the form for anything else. */}
          {game && <button className="primary" onClick={() => newGame(game)}>Start again</button>}
          <button onClick={() => void loadLatest()}>Load last save</button>
          <button onClick={openHome}>Main menu</button>
        </div>
      </div>
    </div>
  );
}

/** In the game: Space toggles pause, 1–3 pick a speed, and Ctrl+S (Cmd+S on a Mac) saves. */
function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { game, atHome, celebration, togglePause, setSpeed, quickSave } = useGameStore.getState();
      // The welcome is a conversation, and a milestone a pop-up: the game waits until it is over.
      if (!game || atHome || celebration || game.guide.stage === 'welcome' || game.guide.stage === 'offer') return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void quickSave();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
        return;
      }
      const speed = SPEEDS[Number(e.key)];
      if (speed !== undefined && speed !== 0) setSpeed(speed);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
