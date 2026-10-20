import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { play } from '../audio/player';
import { hush, speak, speaking } from '../audio/voice';
import { FAREWELL, SPEAKERS, type Line, type Speaker } from '../config/guide';
import { ACTIVE_REGIONS } from '../config/balance';
import { acknowledge, guideView, postpone, setGuide, skipWelcome, type GuideView } from '../sim/guide';
import { freeLicenses, licensePrice } from '../sim/licenses';
import type { GameState } from '../sim/state';
import type { Destination } from './App';
import type { FurnitureType, RoomType } from '../config/office';
import type { Medium } from '../config/world';
import { employeesWithDesk, findRoom, missingFurniture } from '../sim/office';
import { useOfficeView, type Drawing } from './officeView';
import { useOnAir } from './onAir';
import { useGameStore } from './store';
import { useWiki } from './wiki';
import { getArticle, isArticle } from '../wiki/articles';
import { Window, type WindowPlace } from './Window';

// The two figures are drawn with the office's 3D library, which is loaded anyway.
const StoryFigure = lazy(() => import('../office/StoryFigure').then((m) => ({ default: m.StoryFigure })));

const systemReducesMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MINIMIZED_KEY = 'broadcast-empire:guide-minimized';

function Figure({ who, bust }: { who: Speaker; bust?: boolean }) {
  const still = useGameStore((s) => s.settings.reduceMotion) || systemReducesMotion();
  return (
    <div className={bust ? 'story-figure bust' : 'story-figure'}>
      <Suspense fallback={null}>
        <StoryFigure who={who} still={still} bust={bust} />
      </Suspense>
    </div>
  );
}

/**
 * The tutorial. Uncle Tabby welcomes a new company and Penny Cash asks whether
 * she is wanted, both in front of the game; after a yes she stays in a small
 * window with the next thing to do, and later with a hint when something new
 * comes up. What she says and when is in config/guide.ts and sim/guide.ts.
 */
export function Guide({ game, onGo }: { game: GameState; onGo: (to: Destination) => void }) {
  const view = guideView(game);
  const lineId = view?.line.id;

  // A new line gets a sound of its own, so it is noticed while the days run.
  const last = useRef(lineId);
  useEffect(() => {
    if (lineId && lineId !== last.current) play('open');
    last.current = lineId;
  }, [lineId]);

  // And it is said aloud, once: when it comes up in this game, not each time the game is come back to.
  const atHome = useGameStore((s) => s.atHome);
  const said = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (atHome) return hush();
    if (!lineId) {
      // Her goodbye is said as she goes, so it may finish.
      if (speaking() !== FAREWELL.id) hush();
      return;
    }
    const line = `${game.seed}/${lineId}`;
    if (line !== said.current) speak(lineId);
    said.current = line;
  }, [lineId, atHome, game.seed]);

  if (!view) return null;
  if (view.kind === 'welcome' || view.kind === 'offer') return <Story view={view} />;
  return <Advice game={game} view={view} onGo={onGo} />;
}

const update = (fn: (state: GameState) => GameState) => useGameStore.getState().change(fn);

/** Penny leaves, with a last word. */
function sendAway() {
  update((s) => setGuide(s, false));
  speak(FAREWELL.id);
  useGameStore.getState().notify(`${SPEAKERS[FAREWELL.speaker].name}: “${FAREWELL.say}”`);
}

/** The welcome and Penny's question: one speaker at a time, in front of the game, which waits. */
function Story({ view }: { view: Extract<GuideView, { kind: 'welcome' | 'offer' }> }) {
  const { line } = view;
  const speaker = SPEAKERS[line.speaker];
  const first = useRef<HTMLButtonElement>(null);
  // The keyboard goes on where the story is: Enter is the next page.
  useEffect(() => first.current?.focus({ preventScroll: true }), [line.id]);

  return (
    <div className="overlay story" role="dialog" aria-modal="true" aria-labelledby="story-speaker" aria-describedby="story-say">
      <div className="story-card">
        <Figure who={line.speaker} />
        <div className="story-text" key={line.id}>
          <p className="story-speaker" id="story-speaker">
            <strong>{speaker.name}</strong>
            <span className="small">{speaker.role}</span>
          </p>
          <p className="story-say" id="story-say">{line.say}</p>
          {view.kind === 'welcome' ? (
            <div className="row">
              <button ref={first} className="primary" onClick={() => update((s) => acknowledge(s, line.id))}>
                {view.page === view.pages - 1 ? 'Meet Penny' : 'Go on'}
              </button>
              <button className="link" onClick={() => update(skipWelcome)}>Skip the welcome</button>
              <span className="muted small story-page">{view.page + 1} / {view.pages}</span>
            </div>
          ) : (
            <div className="row">
              <button ref={first} className="primary" onClick={() => update((s) => setGuide(s, true))}>Yes, show me the ropes</button>
              <button onClick={sendAway}>No thanks, I know the business</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * How far the TV channel's own manager has come: still to be hired, hired and
 * in need of a desk, or ready to be put in charge. With who it is, if anyone.
 */
function tvManager(game: GameState): { stage: 'hire' | 'desk' | 'assign'; tvId?: string } {
  const tv = game.channels.find((c) => c.medium === 'tv');
  const spare = game.employees.find((e) => e.role === 'channelManager' && !game.channels.some((c) => c.managerId === e.id));
  const manager = game.employees.find((e) => e.id === tv?.managerId) ?? spare;
  if (!manager) return { stage: 'hire', tvId: tv?.id };
  return { stage: employeesWithDesk(game).has(manager.id) ? 'assign' : 'desk', tvId: tv?.id };
}

/** The first channel of a medium, by id. */
const firstChannel = (game: GameState, medium: Medium) => game.channels.find((c) => c.medium === medium)?.id;

/**
 * The channel whose schedule a line is about: the TV channel in the chapter on
 * television, the one with the stalest show when that is the news, and
 * otherwise the first radio channel.
 */
function scheduleOf(line: Line, game: GameState): string | undefined {
  if (line.id.startsWith('tv-')) return firstChannel(game, 'tv');
  if (line.id === 'stale') {
    const stalest = [...game.shows].sort((a, b) => a.freshness - b.freshness).find((s) => game.channels.some((c) => c.schedule.includes(s.id)));
    if (stalest) return game.channels.find((c) => c.schedule.includes(stalest.id))?.id;
  }
  return firstChannel(game, 'radio') ?? game.channels[0]?.id;
}

/** What the Show me button does: opens the window a line is about, and for the desks the catalog at the right page. */
function show(line: Line, game: GameState, onGo: (to: Destination) => void) {
  if (!line.to) return;
  if (line.to === 'broadcast:schedule') {
    const channelId = scheduleOf(line, game);
    if (channelId) useOnAir.getState().show('schedule', channelId);
  }
  // The TV channel's manager: once hired they need a desk in the management office, and then the channel.
  if (line.id === 'tv-manager' && tvManager(game).stage !== 'hire') {
    if (tvManager(game).stage === 'assign') return onGo('broadcast:channels');
    const office = game.rooms.find((r) => r.type === 'managementOffice');
    if (office) {
      useOfficeView.getState().setFloor(office.floor);
      useOfficeView.getState().selectRoom(office.roomId);
    }
    useOfficeView.getState().openCatalog('managementOffice', 'managerDesk');
    return onGo('catalog');
  }
  // Someone who is hired and still has to get a desk: the catalog, like the step for the desks.
  const hired = (line.id === 'sales' || line.id === 'marketing') && game.employees.some((e) => e.role === line.id);
  const to = hired ? 'catalog' : line.to;
  if (to === 'catalog') {
    const office = game.rooms.find((r) => r.type === 'office');
    if (office) {
      useOfficeView.getState().setFloor(office.floor);
      useOfficeView.getState().selectRoom(office.roomId);
    }
    useOfficeView.getState().openCatalog('office', 'workstation');
  }
  onGo(to);
}

/** The window id and section a destination names. */
const dockOf = (to: Destination) => `dock-${to.split(':')[0]}`;

/**
 * Where to look for the step at hand: the names (`data-guide`) of the controls
 * that get it done, most specific first. The first one that is on screen and
 * not covered gets the ring, so it moves along as windows open.
 */
function spotsFor(line: Line, game: GameState, roomId: string | null, drawing: Drawing | null, placing: FurnitureType | null): string[] {
  const room = (type: string) => game.rooms.find((r) => r.type === type)?.roomId;
  const hiring = (role: string) => [`hire-${role}`, `role-${role}`, 'dock-staff'];
  // Shows are made and put in a slot on a channel's schedule, which opens from the channel.
  const onSchedule = (medium: Medium) => [`open-schedule-${firstChannel(game, medium)}`, 'section-channels', 'dock-broadcast'];
  const shows = ['create-show', 'add-radio', ...onSchedule('radio')];
  // Building a room of a kind: the button that starts it, then the kind, a place for it, and the button that builds it.
  const setUp = (kind: RoomType) => (!drawing || drawing.roomId ? ['build-room'] : drawing.kind !== kind ? [`kind-${kind}`] : drawing.rect && drawing.door ? ['build-confirm'] : ['propose-room']);
  // Furnishing a room from its checklist: the room is selected first, then “Place” beside the first piece it
  // still lacks. Once that piece is on the pointer the next click is in the office itself, so nothing is ringed.
  const furnish = (id: string | undefined) => {
    const lacking = id ? findRoom(game, id) : undefined;
    const next = lacking ? missingFurniture(game, lacking)[0]?.[0] : undefined;
    return roomId !== id ? [`room-${id}`] : next && placing !== next ? [`place-${next}`] : [];
  };
  // A workstation in the office: the office is selected first, then the catalog, and “Place it” there.
  const desk = () => {
    const office = room('office');
    if (roomId !== office) return [`room-${office}`];
    // Once a workstation is on the pointer the next click is in the office itself.
    return placing === 'workstation' ? [] : ['catalog-place-workstation', 'catalog-workstation', 'catalog-tab-office', 'dock-catalog'];
  };
  switch (line.id) {
    case 'studio':
      return setUp('radioStudio');
    case 'equipment':
      return furnish(room('radioStudio'));
    case 'office':
      return setUp('office');
    case 'management': {
      const office = room('managementOffice');
      return office ? furnish(office) : setUp('managementOffice');
    }
    case 'manager':
      return hiring('channelManager');
    case 'hosts':
      return hiring('host');
    case 'production':
      return hiring('production');
    case 'cleaner':
      return hiring('cleaner');
    case 'desks':
      return desk();
    // Someone new: hire them, then find them a desk.
    case 'sales':
    case 'marketing':
      return game.employees.some((e) => e.role === line.id) ? desk() : hiring(line.id);
    case 'sponsor':
      return game.offers.length > 0 ? ['accept-offer', 'dock-sales'] : [];
    case 'campaign':
      return ['start-campaign', 'dock-marketing'];
    case 'channel':
      return ['create-channel', 'start-radio', 'section-channels', 'dock-broadcast'];
    case 'in-charge':
      return ['channel-manager', 'section-channels', 'dock-broadcast'];
    case 'license':
      return ['buy-license-capital', 'section-channels', 'dock-broadcast'];
    case 'show':
      return shows;
    case 'full-day':
      return shows;
    case 'schedule':
      // Press a show, then the slot it goes in.
      return ['place-show', 'pick-show', ...onSchedule('radio')];
    // Television, the small way.
    case 'tv-channel':
      return ['create-channel', 'start-tv', 'section-channels', 'dock-broadcast'];
    case 'tv-manager': {
      const { stage, tvId } = tvManager(game);
      if (stage === 'hire') return hiring('channelManager');
      if (stage === 'assign') return [`channel-manager-${tvId}`, 'section-channels', 'dock-broadcast'];
      // A desk for them, like the desks of the first team: the management office, then the catalog, and “Place it” there.
      const office = room('managementOffice');
      if (roomId !== office) return [`room-${office}`];
      return placing === 'managerDesk' ? [] : ['catalog-place-managerDesk', 'catalog-managerDesk', 'catalog-tab-managementOffice', 'dock-catalog'];
    }
    case 'tv-license': {
      const free = ACTIVE_REGIONS.filter((r) => freeLicenses(game, 'tv', r) > 0).sort((a, b) => licensePrice('tv', a, game) - licensePrice('tv', b, game))[0];
      return [`buy-tv-license-${free}`, 'section-channels', 'dock-broadcast'];
    }
    case 'tv-library': {
      const library = room('library');
      return library ? furnish(library) : setUp('library');
    }
    case 'tv-titles':
      return ['buy-series', 'market-series', 'section-content', 'dock-broadcast'];
    case 'tv-show':
      // The programme is made first; then it goes on the TV channel's schedule.
      return game.shows.some((s) => s.genre === 'series') ? ['place-show', 'pick-show', ...onSchedule('tv')] : ['create-show', 'add-library', ...onSchedule('tv')];
    case 'play':
      return ['speed-1'];
    case 'streaming':
      return ['streaming', 'section-streaming', 'dock-broadcast'];
    default:
      return line.to ? [dockOf(line.to)] : [];
  }
}

/** Penny in her window: the step at hand with how to do it, or a hint. */
function Advice({ game, view, onGo }: { game: GameState; view: Extract<GuideView, { kind: 'step' | 'hint' }>; onGo: (to: Destination) => void }) {
  const { line } = view;
  const roomId = useOfficeView((s) => s.roomId);
  const drawing = useOfficeView((s) => s.drawing);
  const placing = useOfficeView((s) => s.placing);
  const [place, setPlace] = useState<WindowPlace>();
  /** Which bottom corner she stands in when she hasn't been dragged somewhere. */
  const [side, setSide] = useState<'left' | 'right'>('left');
  const dodged = useRef('');
  // A step is done and the next one comes up: whatever piece is still on the pointer is put away, or the
  // next thing she points at could be out of reach behind it.
  const stepBefore = useRef(line.id);
  useEffect(() => {
    if (stepBefore.current !== line.id && view.kind === 'step') useOfficeView.getState().place(null);
    stepBefore.current = line.id;
  }, [line.id, view.kind]);
  const [leaving, setLeaving] = useState(false);
  const [minimized, setMinimized] = useState(() => {
    try {
      return localStorage.getItem(MINIMIZED_KEY) === 'yes';
    } catch {
      return false;
    }
  });
  const fold = (yes: boolean) => {
    setMinimized(yes);
    try {
      localStorage.setItem(MINIMIZED_KEY, yes ? 'yes' : 'no');
    } catch {
      // Remembering it is only a convenience.
    }
  };
  // Something new to say unfolds her, so a hint is not missed behind a title bar.
  useEffect(() => {
    if (view.kind === 'hint') setMinimized(false);
  }, [view.kind, line.id]);

  const talk = view.kind === 'hint' || line.reply !== undefined;
  /** The article with more about the line, for a player who wants to know why. */
  const wiki = line.wiki && isArticle(line.wiki) ? line.wiki : undefined;
  const title = view.kind === 'step' ? `${SPEAKERS.penny.name} · ${view.chapter ? `${view.chapter}, ` : ''}step ${view.index + 1} of ${view.total}` : `${SPEAKERS.penny.name} · a word of advice`;

  return (
    <>
      <Window
        title={title}
        className={side === 'right' ? 'guide right' : 'guide'}
        place={place}
        minimized={minimized}
        onMove={setPlace}
        onMinimize={() => fold(!minimized)}
        onClose={() => (fold(false), setLeaving(true))}
        closeLabel="Send Penny away"
      >
        {leaving ? (
          <div className="guide-leave">
            <p>
              <strong>Send Penny away?</strong> She stops guiding you and keeps her hints to herself. You can call her back in the Settings.
            </p>
            <div className="row">
              <button className="primary" onClick={() => setLeaving(false)}>No, stay</button>
              <button onClick={sendAway}>Yes, I’ll manage</button>
            </div>
          </div>
        ) : (
          <div className="guide-line" key={line.id}>
            <Figure who={line.speaker} bust />
            <div className="guide-text">
              <h3>{line.title}</h3>
              <p className="guide-say">{line.say}</p>
              {line.how && (
                <ol className="guide-how">
                  {line.how.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
              {view.kind === 'step' && view.progress && view.progress.need > 0 && (
                <p className="guide-progress" role="status">
                  <progress value={Math.min(view.progress.have, view.progress.need)} max={view.progress.need} />
                  {Math.min(view.progress.have, view.progress.need)} of {view.progress.need} {view.progress.of}
                </p>
              )}
              <div className="row">
                {talk && (
                  <button className="primary" onClick={() => update((s) => acknowledge(s, line.id))}>{line.reply ?? 'Got it'}</button>
                )}
                {talk && line.later && <button onClick={() => update((s) => postpone(s, line.id))}>{line.later}</button>}
                {line.to && (
                  <button className={talk ? undefined : 'primary'} onClick={() => show(line, game, onGo)}>Show me</button>
                )}
                {wiki && (
                  <button
                    className="link"
                    title={`Wiki: ${getArticle(wiki).title}`}
                    onClick={() => {
                      useWiki.getState().open(wiki);
                      // On a phone her window would lie on top of the article.
                      if (window.matchMedia('(max-width: 760px)').matches) fold(true);
                    }}
                  >
                    More about this
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Window>
      {!minimized && !leaving && view.kind === 'step' && (
        <Ring
          names={spotsFor(line, game, roomId, drawing, placing)}
          // She is standing on the very thing she is pointing at: she steps to the other corner, once per control.
          onCovered={(name) => {
            if (dodged.current === `${line.id}/${name}`) return;
            dodged.current = `${line.id}/${name}`;
            setPlace(undefined);
            setSide((now) => (now === 'left' ? 'right' : 'left'));
          }}
        />
      )}
    </>
  );
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** How often a control that is scrolled out of sight is brought into view for a step, and the milliseconds between two tries. */
const BRING = { times: 3, pause: 700 };

/**
 * The first of the named controls that is on screen and not behind something
 * else. A control that is only behind Penny's own window is reported by name
 * instead, so she can get out of the way.
 */
function findSpot(names: string[], brought: Map<string, { times: number; at: number }>): Box | string | null {
  for (const name of names) {
    for (const element of document.querySelectorAll<HTMLElement>(`[data-guide="${name}"]`)) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      if (top && (element.contains(top) || top.contains(element))) return { left: box.left, top: box.top, width: box.width, height: box.height };
      if (top?.closest('.window.guide')) return name;
      // It is there, but scrolled out of sight in its window: it is brought into view and found on the next look.
      // A window that is still opening may not scroll yet, so it is tried a few times, a moment apart; after
      // that the player's own scrolling is left alone.
      const tried = brought.get(name) ?? { times: 0, at: 0 };
      if (tried.times < BRING.times && performance.now() - tried.at > BRING.pause) {
        brought.set(name, { times: tried.times + 1, at: performance.now() });
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
        return null;
      }
    }
  }
  return null;
}

/** A ring around the control the step at hand is about. It follows the control, and never takes a click. */
function Ring({ names, onCovered }: { names: string[]; onCovered: (name: string) => void }) {
  const [box, setBox] = useState<Box | null>(null);
  const key = names.join(' ');
  const covered = useRef(onCovered);
  covered.current = onCovered;
  useLayoutEffect(() => {
    let frame = 0;
    /** The controls that were scrolled into view for this step, so that it is done once and the player can scroll on. */
    const brought = new Map<string, { times: number; at: number }>();
    const look = () => {
      const found = findSpot(key ? key.split(' ') : [], brought);
      if (typeof found === 'string') covered.current(found);
      const next = typeof found === 'string' ? null : found;
      setBox((now) => (now && next && now.left === next.left && now.top === next.top && now.width === next.width && now.height === next.height ? now : next));
      frame = requestAnimationFrame(look);
    };
    look();
    return () => cancelAnimationFrame(frame);
  }, [key]);
  if (!box) return null;
  return <div className="guide-ring" aria-hidden="true" style={{ left: box.left - 5, top: box.top - 5, width: box.width + 10, height: box.height + 10 }} />;
}
