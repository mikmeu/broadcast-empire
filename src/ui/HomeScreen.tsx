import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { ACTIVE_REGIONS, DIFFICULTIES, RIVAL_DIFFICULTY } from '../config/balance';
import { AUDIENCES, getRegion, type RegionId } from '../config/world';
import { desktop } from '../persistence/desktop';
import type { SaveInfo } from '../persistence/storage';
import { formatDate } from '../sim/calendar';
import { licensePrice } from '../sim/licenses';
import { NAME_LENGTH, cleanName, setupError } from '../sim/newGame';
import { defaultLook, type Look } from '../config/looks';
import { SITES } from '../office/sites';
import { EtheriaMap } from './EtheriaMap';
import { Later, LookEditor } from './LookEditor';
import { formatCompact, formatMoney } from './format';
import { DIFFICULTY_HELP, DIFFICULTY_NAMES, Options } from './screens/SettingsScreen';
import { defaultSaveName, useGameStore } from './store';
import { TitleArt } from './TitleArt';
import { BUILD } from '../version';

type View = 'menu' | 'new' | 'load' | 'save' | 'settings';

const TITLES: Record<Exclude<View, 'menu'>, string> = { new: 'New game', load: 'Load game', save: 'Save game', settings: 'Settings' };

/** When a save was made, in the player's own date format. */
const savedWhen = (info: SaveInfo) => (info.savedAt ? new Date(info.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown date');

/**
 * The home screen: where the game starts, and where the player comes back to
 * from the settings to save, load or start again. A running game waits,
 * paused, until they return to it.
 */
export function HomeScreen() {
  const game = useGameStore((s) => s.game);
  const saves = useGameStore((s) => s.saves);
  const { resume, loadLatest, autosave } = useGameStore.getState();
  const [view, setView] = useState<View>('menu');
  const latest = saves.find((s) => !s.problem);
  const playing = game !== undefined && !game.bankrupt;

  // Escape goes one step back: to the menu, then to the game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (view !== 'menu') setView('menu');
      else resume();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, resume]);

  const item = (id: View, label: string, disabled = false) => (
    <button className={view === id ? 'home-item active' : 'home-item'} aria-pressed={view === id} disabled={disabled} onClick={() => setView(view === id ? 'menu' : id)}>
      {label}
    </button>
  );

  return (
    <div className="home">
      <TitleArt />
      <div className="home-content">
        <h1 className="home-logo">
          <span>Broadcast</span>
          <span>Empire</span>
        </h1>
        <div className="home-columns">
          <nav className="home-menu" aria-label="Main menu">
            {game ? (
              <button className="home-item primary" onClick={resume}>
                Back to the game
                <small>{game.companyName} · {formatDate(game.day)}</small>
              </button>
            ) : (
              <button className="home-item primary" disabled={!latest} onClick={() => void loadLatest()}>
                Continue
                <small>{latest ? `${latest.name} · ${formatDate(latest.day)}` : 'No saved game yet'}</small>
              </button>
            )}
            {item('new', 'New game')}
            {item('load', 'Load game', saves.length === 0)}
            {playing && item('save', 'Save game')}
            {item('settings', 'Settings')}
            {desktop && (
              <button
                className="home-item"
                onClick={() => {
                  // Leaving saves the game in play first, like closing the window does.
                  void (useGameStore.getState().settings.autosave ? autosave() : Promise.resolve()).then(() => desktop?.close());
                }}
              >
                Quit
              </button>
            )}
          </nav>

          {view !== 'menu' && (
            <section className={view === 'new' ? 'home-panel wide' : 'home-panel'} aria-label={TITLES[view]}>
              <h2>{TITLES[view]}</h2>
              {view === 'new' && <NewGame />}
              {view === 'load' && <LoadGame />}
              {view === 'save' && <SaveGame onDone={() => setView('menu')} />}
              {view === 'settings' && <HomeSettings />}
            </section>
          )}
        </div>
        <p className="home-foot">{desktop ? BUILD : `${BUILD} · Playing in the browser: saves are kept in this browser.`}</p>
      </div>
    </div>
  );
}

// The 3D view brings a large library with it, so it is only loaded when shown.
const TownPreview = lazy(() => import('../office/Office3D').then((m) => ({ default: m.TownPreview })));

/**
 * Starting a company, in two steps: who you are (your character and your
 * name), then the headquarters (where they are, what the company is called
 * and how hard the game is). Only the names and your character can be changed later.
 */
function NewGame() {
  const game = useGameStore((s) => s.game);
  const difficulty = useGameStore((s) => s.settings.difficulty);
  const { updateSettings, newGame } = useGameStore.getState();
  const [step, setStep] = useState<'you' | 'place'>('you');
  // The preview of the town is put away before the game begins, so the two 3D views are never built and torn down at once.
  const [starting, setStarting] = useState(false);
  // A new game starts from the names and the character of the one being played, which is what most people choose again.
  const [playerName, setPlayerName] = useState(game?.playerName ?? '');
  const [look, setLook] = useState<Look>(() => game?.look ?? defaultLook(`${Math.random()}`));
  const [companyName, setCompanyName] = useState(game?.companyName ?? '');
  // The headquarters start in Coaxia; the arrows go through the regions in the order of the list.
  const [headquarters, setHeadquarters] = useState<RegionId>('capital');
  const stepRegion = (by: number) => setHeadquarters((now) => ACTIVE_REGIONS[(ACTIVE_REGIONS.indexOf(now) + by + ACTIVE_REGIONS.length) % ACTIVE_REGIONS.length]!);
  const still = useGameStore((s) => s.settings.reduceMotion) || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const setup = { playerName, companyName, headquarters, look };
  const problem = setupError(setup);
  const named = cleanName(playerName) !== '';
  const rivals = Math.round((RIVAL_DIFFICULTY[difficulty] / RIVAL_DIFFICULTY.normal - 1) * 100);
  const region = getRegion(headquarters);
  useEffect(() => {
    if (!starting) return;
    const timer = setTimeout(() => newGame({ playerName, companyName, headquarters, look }), 0);
    return () => clearTimeout(timer);
    // Only when the start button is pressed: what was filled in by then is what the game starts with.
  }, [starting]);

  return (
    <form
      className={`new-game step-${step}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (step === 'you') named && setStep('place');
        else if (!problem) setStarting(true);
      }}
    >
      <ol className="new-game-steps" aria-label="Steps">
        <li aria-current={step === 'you' ? 'step' : undefined}>1 · You</li>
        <li aria-current={step === 'place' ? 'step' : undefined}>2 · Your headquarters</li>
      </ol>

      {step === 'you' ? (
        <>
          <fieldset className="settings-group new-game-you">
            <legend>Your character</legend>
            <LookEditor look={look} onChange={setLook} />
            <p className="muted small">This is you in the office: the CEO. You can change it later, in Settings.</p>
          </fieldset>
          <div className="new-game-who">
            <label>
              <span className="small">Your name</span>
              <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} maxLength={NAME_LENGTH} autoComplete="off" autoFocus />
              <span className="muted small">You run the company as its CEO.</span>
            </label>
          </div>
          <div className="new-game-start">
            <div className="row">
              <button key="next" className="primary" type="submit" disabled={!named}>Next: your headquarters</button>
              <span className="muted small">{named ? 'Then where your company starts, and what it is called.' : 'Fill in your name.'}</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="new-game-who">
            <label>
              <span className="small">Company name</span>
              {/* On a narrow screen the place stands above this field, and taking the focus would scroll past it. */}
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={NAME_LENGTH} autoComplete="off" autoFocus={window.innerWidth > 900} />
              <span className="muted small">The name of your headquarters: it stands on the building and in the ratings.</span>
            </label>
            <fieldset className="settings-group">
              <legend>Where in Etheria</legend>
              <EtheriaMap selected={headquarters} onSelect={setHeadquarters} caption={(id) => `${formatCompact(getRegion(id).population1970)} people`} />
            </fieldset>
            <fieldset className="settings-group">
              <legend>Difficulty</legend>
              <div className="segmented" role="radiogroup" aria-label="Difficulty">
                {DIFFICULTIES.map((d) => (
                  <button type="button" key={d} role="radio" aria-checked={d === difficulty} className={d === difficulty ? 'active' : undefined} onClick={() => updateSettings({ difficulty: d })}>
                    {DIFFICULTY_NAMES[d]}
                  </button>
                ))}
              </div>
              <p className="muted small">
                {DIFFICULTY_HELP[difficulty]}
                {rivals !== 0 && ` Rival show quality is ${Math.abs(rivals)}% ${rivals > 0 ? 'higher' : 'lower'} than on normal.`}
              </p>
            </fieldset>
          </div>

          <fieldset className="settings-group new-game-where">
            <legend>Headquarters</legend>
            <div className="hq-picker">
              <button type="button" onClick={() => stepRegion(-1)} aria-label="Previous region" title="Previous region">‹</button>
              <div className="hq-preview">
                {!starting && (
                  <Later>
                    <Suspense fallback={<span className="muted small">Looking out of the window…</span>}>
                      <TownPreview region={headquarters} still={still} />
                    </Suspense>
                  </Later>
                )}
                <div className="hq-label" aria-live="polite">
                  <strong>{region.name}</strong>
                  <span className="small">
                    {ACTIVE_REGIONS.indexOf(headquarters) + 1} of {ACTIVE_REGIONS.length}
                  </span>
                </div>
              </div>
              <button type="button" onClick={() => stepRegion(1)} aria-label="Next region" title="Next region">›</button>
            </div>
            <p className="small">{SITES[headquarters].about}</p>
            <dl className="facts hq-facts">
              <dt>People</dt>
              <dd>{formatCompact(region.population1970)}, {region.growth >= 0.01 ? 'and growing fast' : region.growth >= 0.006 ? 'and growing' : 'and hardly growing'}</dd>
              <dt>Many of them</dt>
              <dd>{region.mainAudiences.map((id) => AUDIENCES.find((a) => a.id === id)!.name.toLowerCase()).join(', ')}</dd>
              <dt>A radio license here</dt>
              <dd>{formatMoney(licensePrice('radio', headquarters, 0))}</dd>
            </dl>
            <p className="muted small">
              People at home know your name: a channel that starts in {region.name} begins with some reputation there. You can broadcast in every
              region from any of them.
            </p>
          </fieldset>

          <div className="new-game-start">
            {game && !game.bankrupt && <p className="small">The game you are playing is not saved by this. Save it first if you want to keep it.</p>}
            <div className="row">
              {/* Each button has a key of its own: one that turned into the other under a click would send the form. */}
              <button key="back" type="button" onClick={() => setStep('you')}>Back</button>
              <button key="start" className="primary" type="submit" disabled={problem !== null}>Start in 1970</button>
              <span className="muted small">{problem ?? 'The headquarters and the difficulty can’t be changed once the game has started.'}</span>
            </div>
          </div>
        </>
      )}
    </form>
  );
}

/** One save in a list: what it is, and what can be done with it. */
function SaveRow({ info, children }: { info: SaveInfo; children: ReactNode }) {
  return (
    <li className={info.problem ? 'save-row broken' : 'save-row'}>
      <div>
        <strong>{info.name}</strong>
        {info.auto && <span className="tag">Autosave</span>}
        <div className="muted small">
          {info.problem ?? `${formatDate(info.day)} · ${formatMoney(info.money)}`} · saved {savedWhen(info)}
        </div>
      </div>
      <div className="row">{children}</div>
    </li>
  );
}

/** A button that asks once more before it does something that can't be undone. */
function ConfirmButton({ label, question, onConfirm }: { label: string; question: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="confirm" role="group" aria-label={question}>
      <span className="small">{question}</span>
      <button className="danger" onClick={() => { setAsking(false); onConfirm(); }}>Yes</button>
      <button onClick={() => setAsking(false)}>No</button>
    </span>
  );
}

function LoadGame() {
  const saves = useGameStore((s) => s.saves);
  const { load, deleteSave } = useGameStore.getState();
  if (saves.length === 0) return <p className="empty">No saved games.</p>;
  return (
    <ul className="save-list">
      {saves.map((info) => (
        <SaveRow key={info.id} info={info}>
          {!info.problem && <button className="primary" onClick={() => void load(info.id)}>Load</button>}
          <ConfirmButton label="Delete" question="Delete it?" onConfirm={() => void deleteSave(info.id)} />
        </SaveRow>
      ))}
    </ul>
  );
}

function SaveGame({ onDone }: { onDone: () => void }) {
  const game = useGameStore((s) => s.game);
  const slot = useGameStore((s) => s.slot);
  const saves = useGameStore((s) => s.saves).filter((s) => !s.auto);
  const { saveAs } = useGameStore.getState();
  const [name, setName] = useState(slot?.name ?? (game ? defaultSaveName(game) : ''));
  const save = (id?: string, as = name) => void saveAs(as, id).then((ok) => ok && onDone());

  return (
    <>
      <form
        className="save-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          <span className="small">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
        </label>
        <button className="primary" type="submit">Save as new</button>
      </form>
      {saves.length > 0 && (
        <>
          <h3>Or replace a save</h3>
          <ul className="save-list">
            {saves.map((info) => (
              <SaveRow key={info.id} info={info}>
                <ConfirmButton label="Replace" question="Replace it?" onConfirm={() => save(info.id, info.name)} />
              </SaveRow>
            ))}
          </ul>
        </>
      )}
      <p className="muted small">The autosave is kept apart: it is replaced at the start of every month{desktop ? ' and when you quit' : ''}.</p>
    </>
  );
}

function HomeSettings() {
  const [folder, setFolder] = useState<string>();
  useEffect(() => {
    void desktop?.saves.folder().then(setFolder);
  }, []);
  return (
    <>
      <Options />
      {desktop && (
        <div className="saves-folder small">
          <span>
            Save files are in <code>{folder ?? '…'}</code>
          </span>
          <button onClick={() => void desktop?.saves.showFolder()}>Open folder</button>
        </div>
      )}
    </>
  );
}
