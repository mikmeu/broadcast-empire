import { desktop, type DesktopBridge } from '../../persistence/desktop';
import { LookEditor } from '../LookEditor';
import type { Difficulty } from '../../config/balance';
import { THEMES, type Theme } from '../../persistence/settings';
import { slotNumber } from '../../persistence/storage';
import { useEffect, useState } from 'react';
import { loadFurnitureMods, type ModProblem } from '../../mods/load';
import { modsBridge } from '../../mods/devMods';
import type { ModFurniture } from '../../mods/furnitureFile';
import type { MapFile } from '../../mods/mapFile';
import { importMapFile, saveMapMod, type MapProblem } from '../../mods/mapMods';
import { playableMaps } from '../../mods/playMap';
import { getRegion } from '../../config/world';
import { FAREWELL, SPEAKERS } from '../../config/guide';
import { renameCompany, setLook } from '../../sim/actions';
import { canStartTvChapter, guideFinished, inTvChapter, setGuide, startTvChapter } from '../../sim/guide';
import { NAME_LENGTH } from '../../sim/newGame';
import { Panel } from '../components';
import { defaultSaveName, useGame, useGameStore } from '../store';
import { BUILD } from '../../version';
import { Credits } from '../Credits';
import { formatMoney } from '../format';

export const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

export const DIFFICULTY_HELP: Record<Difficulty, string> = {
  easy: 'One good channel is enough to live on.',
  normal: 'The standard game. A single channel gets by; growing pays off.',
  hard: 'A company that doesn’t grow goes under.',
};

const THEME_NAMES: Record<Theme, string> = { clock: 'By the time of day', light: 'Light', dark: 'Dark' };

/** The Settings window in the game: saving, the way to the main menu, and the options. */
export function SettingsScreen({ onClose }: { onClose?: () => void }) {
  const game = useGame();
  const slot = useGameStore((s) => s.slot);
  const { quickSave, openHome } = useGameStore.getState();

  return (
    <div className="two-col">
      <Panel title="This game" help="saving">
        <div className="row">
          <button className="primary" onClick={() => void quickSave()} disabled={game.bankrupt} title="Save (Ctrl+S)">Save</button>
          <button onClick={openHome}>Main menu</button>
        </div>
        <p className="muted small">
          {slot ? <>Saved in slot {slotNumber(slot.id)}, <strong>“{slot.name}”</strong>; Save replaces it.</> : <>Not saved yet; Save puts it in the first empty slot, called “{defaultSaveName(game)}”.</>}{' '}
          The main menu is where you load a game, save in another slot or start a new one. The game waits while you are there.
        </p>
        <p className="muted small">
          This game is on <strong>{DIFFICULTY_NAMES[game.difficulty].toLowerCase()}</strong>, with the headquarters in{' '}
          <strong>{getRegion(game.headquarters).name}</strong>. Both are fixed when a game starts.
        </p>
        <Names key={`${game.playerName}/${game.companyName}`} />
        <YourLook />
        <Penny onClose={onClose} />
      </Panel>

      <Panel title="Options">
        <Options />
      </Panel>
      <Panel title="Credits">
        <Credits />
      </Panel>
      <p className="muted small">Broadcast Empire, {BUILD}</p>
    </div>
  );
}

/** The player's name and the company's, which can be changed while playing. */
function Names() {
  const game = useGame();
  const run = useGameStore((s) => s.run);
  const notify = useGameStore((s) => s.notify);
  const [playerName, setPlayerName] = useState(game.playerName);
  const [companyName, setCompanyName] = useState(game.companyName);
  const changed = playerName.trim() !== game.playerName || companyName.trim() !== game.companyName;
  return (
    <form
      className="names-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (run((s) => renameCompany(s, playerName, companyName))) notify('Names changed');
      }}
    >
      <label>
        <span className="small">Your name (CEO)</span>
        <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} maxLength={NAME_LENGTH} autoComplete="off" />
      </label>
      <label>
        <span className="small">Company name</span>
        <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={NAME_LENGTH} autoComplete="off" />
      </label>
      <button type="submit" disabled={!changed || game.bankrupt}>Change names</button>
    </form>
  );
}

/** The player's character, which can be changed while playing: it folds open to the character creator. */
function YourLook() {
  const game = useGame();
  const run = useGameStore((s) => s.run);
  const [open, setOpen] = useState(false);
  return (
    <div className="penny-switch look-switch">
      <div className="row">
        <span className="small">Your character is the CEO in the office: at a spare manager’s desk if there is one, or else in the reception.</span>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Done' : 'Change your character'}</button>
      </div>
      {open && <LookEditor look={game.look} onChange={(look) => void run((s) => setLook(s, look))} />}
    </div>
  );
}

/** Penny Cash, the tutorial: sent away or called back in, and her chapter on television started when the player wants it. */
function Penny({ onClose }: { onClose?: () => void }) {
  const game = useGame();
  const { change, notify } = useGameStore.getState();
  const { stage } = game.guide;
  // Before she has asked her question there is nothing to switch.
  if (stage === 'welcome' || stage === 'offer') return null;
  const here = stage === 'on';
  const canStart = canStartTvChapter(game);
  return (
    <>
      <div className="penny-switch">
        <p className="small">
          <strong>{SPEAKERS.penny.name}</strong>{' '}
          {here
            ? guideFinished(game)
              ? 'drops by with a word of advice when something new comes up.'
              : 'is showing you the ropes.'
            : 'has been sent away. She can pick up where the company stands.'}
        </p>
        <button
          onClick={() => {
            change((s) => setGuide(s, !here));
            if (here) notify(`${SPEAKERS.penny.name}: “${FAREWELL.say}”`);
          }}
        >
          {here ? 'Send Penny away' : 'Call Penny in'}
        </button>
      </div>
      {/* Her chapter on television, whenever the player is ready for it: also after “Not now”, or once it was done. */}
      <div className="penny-switch">
        <p className="small">
          {here && inTvChapter(game)
            ? `${SPEAKERS.penny.name} is walking you through television.`
            : canStart
              ? `${SPEAKERS.penny.name} can walk you through a first TV channel, step by step.${here ? '' : ' It calls her back in.'}`
              : `Television: after ${SPEAKERS.penny.name}’s first weeks.`}
        </p>
        {!(here && inTvChapter(game)) && (
          <button
            disabled={!canStart}
            onClick={() => {
              change(startTvChapter);
              // Out of the way, so the ring around the first step can be seen.
              onClose?.();
            }}
          >
            Walk me through television
          </button>
        )}
      </div>
    </>
  );
}

/** The options that apply to every game: also shown on the home screen. */
export function Options() {
  const settings = useGameStore((s) => s.settings);
  const update = useGameStore((s) => s.updateSettings);

  return (
    <div className="options">
      <fieldset className="settings-group">
        <legend>Color scheme</legend>
        <div className="segmented" role="radiogroup" aria-label="Color scheme">
          {THEMES.map((theme) => (
            <button key={theme} role="radio" aria-checked={theme === settings.theme} className={theme === settings.theme ? 'active' : undefined} onClick={() => update({ theme })}>
              {THEME_NAMES[theme]}
            </button>
          ))}
        </div>
        {settings.theme === 'clock' && (
          <p className="muted small">Dark while the sun is down on the office clock, where a month is one working day: in winter from the late afternoon of that day, which is the second half of the month.</p>
        )}
      </fieldset>
      <label className="settings-row">
        <span className="settings-label">Sound volume</span>
        <input type="range" min={0} max={100} step={5} value={settings.soundVolume} onChange={(e) => update({ soundVolume: Number(e.target.value) })} />
        <span className="settings-value">{settings.soundVolume}</span>
      </label>
      <label className="settings-row">
        <span className="settings-label">Office volume</span>
        <input type="range" min={0} max={100} step={5} value={settings.officeVolume} onChange={(e) => update({ officeVolume: Number(e.target.value) })} />
        <span className="settings-value">{settings.officeVolume}</span>
      </label>
      <label className="settings-row">
        <span className="settings-label">Music volume</span>
        <input type="range" min={0} max={100} step={5} value={settings.musicVolume} onChange={(e) => update({ musicVolume: Number(e.target.value) })} />
        <span className="settings-value">{settings.musicVolume}</span>
      </label>
      <label className="settings-row">
        <span className="settings-label">Voice volume</span>
        <input type="range" min={0} max={100} step={5} value={settings.voiceVolume} onChange={(e) => update({ voiceVolume: Number(e.target.value) })} />
        <span className="settings-value">{settings.voiceVolume}</span>
      </label>
      <p className="muted small">Sound is the clicks of the buttons, furniture being put down and a short jingle for news and milestones. Office is the sound of the rooms and the town around them. Voice is Uncle Tabby and Penny Cash in the tutorial; what they say is always on screen as well. At 0 either is off. The game has no music yet; its volume is kept for when it does.</p>
      <label className="settings-row">
        <input type="checkbox" checked={settings.autosave} onChange={(e) => update({ autosave: e.target.checked })} />
        <span>
          Autosave at the start of every month
          <span className="muted small"> · kept apart from your own saves</span>
        </span>
      </label>
      <label className="settings-row">
        <input type="checkbox" checked={settings.reduceMotion} onChange={(e) => update({ reduceMotion: e.target.checked })} />
        <span>
          Reduce motion
          <span className="muted small"> · stops the newspaper sliding in and people walking</span>
        </span>
      </label>
      <label className="settings-row">
        <input type="checkbox" checked={settings.awardShow} onChange={(e) => update({ awardShow: e.target.checked })} />
        <span>
          Watch the awards night
          <span className="muted small"> · the Media Times Awards on a stage; off, you get the list of winners</span>
        </span>
      </label>
      {desktop && (
        <label className="settings-row">
          <input type="checkbox" checked={settings.checkUpdates} onChange={(e) => update({ checkUpdates: e.target.checked })} />
          <span>
            Check for a new version when the game starts
            <span className="muted small"> · asks broadcastempire.online’s releases on GitHub, and sends nothing about you or your games</span>
          </span>
        </label>
      )}
      {modsBridge && (
        <label className="settings-row">
          <input type="checkbox" checked={settings.mapEditor} onChange={(e) => update({ mapEditor: e.target.checked })} />
          <span>
            Map editor (for developers)
            <span className="muted small"> · puts the map editor on the home screen. A map made in it can be played from the new game form</span>
          </span>
        </label>
      )}
      {modsBridge && <ModsRow mods={modsBridge} />}
    </div>
  );
}

/** The mods folder (desktop only): where it is, and what is in it, with the reason for each piece that cannot be used. */
function ModsRow({ mods }: { mods: NonNullable<DesktopBridge['mods']> }) {
  const [found, setFound] = useState<{ pieces: ModFurniture[]; problems: ModProblem[] }>();
  useEffect(() => {
    void loadFurnitureMods(mods).then(setFound);
  }, [mods]);
  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Remove “${name}” from your mods folder? Games that use it keep their own copy.`)) return;
    await mods.remove('furniture', id);
    setFound(await loadFurnitureMods(mods));
    void useGameStore.getState().refreshMods();
  };
  // The maps in the folder (0.21.0, #290): those a game can be started on, and each one that cannot, with why.
  const [maps, setMaps] = useState<{ playable: MapFile[]; refused: MapProblem[] }>();
  const [importNote, setImportNote] = useState<string>();
  useEffect(() => {
    void playableMaps(mods).then(setMaps);
  }, [mods]);
  const removeMap = async (id: string, name: string) => {
    if (!window.confirm(`Remove the map “${name}” from your mods folder? Games on it keep their own copy.`)) return;
    await mods.remove('maps', id);
    setMaps(await playableMaps(mods));
  };
  const importMap = async () => {
    const picked = await importMapFile(mods);
    if (!picked) return;
    if (!picked.ok) {
      setImportNote(`${picked.fileName} can’t be used: ${picked.reason}`);
      return;
    }
    await saveMapMod(picked.file, mods);
    setImportNote(`“${picked.file.name}” is in your mods folder.`);
    setMaps(await playableMaps(mods));
  };
  return (
    <div className="settings-group">
      <div className="row">
        <span className="small">Mods: pieces of furniture and maps made by players are kept in a folder of their own.</span>
        <button onClick={() => void mods.showFolder()}>Show mods folder</button>
        <button onClick={() => void importMap()}>Import a map</button>
      </div>
      {importNote && <p className="muted small" role="status">{importNote}</p>}
      {maps && maps.playable.length + maps.refused.length > 0 && (
        <>
          <p className="muted small">{maps.playable.length} {maps.playable.length === 1 ? 'map' : 'maps'} to play on{maps.refused.length > 0 ? `, ${maps.refused.length} that cannot be played` : ''}. Pick one when you start a new game.</p>
          <ul className="small">
            {maps.playable.map((m) => (
              <li key={m.id}>
                {m.name} <span className="muted">({m.id})</span> <button onClick={() => void removeMap(m.id, m.name)}>Remove</button>
              </li>
            ))}
            {maps.refused.map((problem) => (
              <li key={problem.id}>
                <strong>{problem.id}</strong>: {problem.reason} <button onClick={() => void removeMap(problem.id, problem.id)}>Remove</button>
              </li>
            ))}
          </ul>
        </>
      )}
      {found && (
        <>
          <p className="muted small">{found.pieces.length === 0 && found.problems.length === 0 ? 'No mods yet.' : `${found.pieces.length} ${found.pieces.length === 1 ? 'piece' : 'pieces'} of furniture${found.problems.length > 0 ? `, ${found.problems.length} that cannot be used` : ''}.`}</p>
          {found.pieces.length > 0 && (
            <ul className="small">
              {found.pieces.map((piece) => (
                <li key={piece.id}>
                  {piece.spec.name} <span className="muted">({piece.id}) · {formatMoney(piece.spec.cost)}</span>{' '}
                  <button onClick={() => void remove(piece.id, piece.spec.name)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          {found.problems.length > 0 && (
            <ul className="small">
              {found.problems.map((problem) => (
                <li key={problem.id}>
                  <strong>{problem.id}</strong>: {problem.reason} <button onClick={() => void remove(problem.id, problem.id)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
