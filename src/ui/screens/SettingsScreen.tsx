import { desktop } from '../../persistence/desktop';
import { LookEditor } from '../LookEditor';
import type { Difficulty } from '../../config/balance';
import { THEMES, type Theme } from '../../persistence/settings';
import { useState } from 'react';
import { getRegion } from '../../config/world';
import { FAREWELL, SPEAKERS } from '../../config/guide';
import { renameCompany, setLook } from '../../sim/actions';
import { guideFinished, setGuide } from '../../sim/guide';
import { NAME_LENGTH } from '../../sim/newGame';
import { Panel } from '../components';
import { defaultSaveName, useGame, useGameStore } from '../store';
import { BUILD } from '../../version';
import { Credits } from '../Credits';

export const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

export const DIFFICULTY_HELP: Record<Difficulty, string> = {
  easy: 'One good channel is enough to live on.',
  normal: 'The standard game. A single channel gets by; growing pays off.',
  hard: 'A company that doesn’t grow goes under.',
};

const THEME_NAMES: Record<Theme, string> = { system: 'Same as the system', light: 'Light', dark: 'Dark' };

/** The Settings window in the game: saving, the way to the main menu, and the options. */
export function SettingsScreen() {
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
          {slot ? <>Saved as <strong>{slot.name}</strong>; Save replaces it.</> : <>Not saved under a name yet; Save makes a new save called “{defaultSaveName(game)}”.</>}{' '}
          The main menu is where you load a game, save under another name or start a new one. The game waits while you are there.
        </p>
        <p className="muted small">
          This game is on <strong>{DIFFICULTY_NAMES[game.difficulty].toLowerCase()}</strong>, with the headquarters in{' '}
          <strong>{getRegion(game.headquarters).name}</strong>. Both are fixed when a game starts.
        </p>
        <Names key={`${game.playerName}/${game.companyName}`} />
        <YourLook />
        <Penny />
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

/** Penny Cash, the tutorial: sent away or called back in. */
function Penny() {
  const game = useGame();
  const { change, notify } = useGameStore.getState();
  const { stage } = game.guide;
  // Before she has asked her question there is nothing to switch.
  if (stage === 'welcome' || stage === 'offer') return null;
  const here = stage === 'on';
  return (
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
      </fieldset>
      <label className="settings-row">
        <span className="settings-label">Sound volume</span>
        <input type="range" min={0} max={100} step={5} value={settings.soundVolume} onChange={(e) => update({ soundVolume: Number(e.target.value) })} />
        <span className="settings-value">{settings.soundVolume}</span>
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
      <p className="muted small">Sound is the clicks of the buttons, furniture being put down and a short jingle for news and milestones. Voice is Uncle Tabby and Penny Cash in the tutorial; what they say is always on screen as well. At 0 either is off. The game has no music yet; its volume is kept for when it does.</p>
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
          <span className="muted small"> · stops the news ticker scrolling and people walking</span>
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
    </div>
  );
}
