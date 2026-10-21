import { create } from 'zustand';
import { jingleFor } from '../audio/jingles';
import { play, playJingle, setOfficeVolume, setSoundVolume } from '../audio/player';
import { setVoiceVolume } from '../audio/voice';
import type { Speed } from '../config/balance';
import type { MilestoneId } from '../config/milestones';
import { UNLOCKS, type Feature } from '../config/unlocks';
import { desktop } from '../persistence/desktop';
import { readSettings, writeSettings, type Settings } from '../persistence/settings';
import { AUTOSAVE, deleteSave, listSaves, newSaveId, readLatestSave, readSave, writeSave, type SaveInfo } from '../persistence/storage';
import type { ActionResult } from '../sim/actions';
import { formatDate, toCalendarDate } from '../sim/calendar';
import { createInitialState, type Setup } from '../sim/newGame';
import { firstParagraph, priorityOf } from '../sim/inbox';
import { SaveError } from '../sim/save';
import { newAlerts, topMessage, waitingFor, type GameState, type Message, type MessageAbout, type MessageKind } from '../sim/state';
import { advance } from '../sim/tick';
import { applyTheme } from './theme';

export interface Notice {
  text: string;
  kind: MessageKind;
  /** The e-mail it was, for news from the simulation: clicking the toast opens it in the inbox (0.17.0). */
  messageId?: number;
}

/** Milestones on screen in a pop-up of their own, with what they opened; the game waits until it is closed. */
export interface Celebration {
  milestones: MilestoneId[];
  opened: Feature[];
  /** Whether the game was running when the pop-up came up, so that closing it carries on. */
  resume: boolean;
}

/** The slot a game was loaded from or last saved to: where a quick save goes. */
export interface Slot {
  id: string;
  name: string;
}

interface GameStore {
  /** Undefined until the player continues, loads or starts a game from the home screen. */
  game: GameState | undefined;
  /** False until the startup check for saves has finished. */
  ready: boolean;
  /** Whether the home screen is showing; the game underneath, if any, is paused. */
  atHome: boolean;
  /** Every save, newest first; refreshed whenever one is written or deleted. */
  saves: SaveInfo[];
  /** Where this game is saved under its own name, if it has been. */
  slot: Slot | undefined;
  speed: Speed;
  /** Speed to return to when unpausing. */
  resumeSpeed: Exclude<Speed, 0>;
  notice: Notice | undefined;
  /** News about a window that is on screen as a pop-up, oldest first. */
  alerts: Message[];
  /** The windows with news the player has not opened them for: their menu icons carry a dot. */
  attention: MessageAbout[];
  celebration: Celebration | undefined;
  /** Settings of this player; see persistence/settings.ts. */
  settings: Settings;

  boot(): Promise<void>;
  refreshSaves(): Promise<void>;
  /** Shows the home screen and pauses the game. */
  openHome(): void;
  /** Back from the home screen to the game that is running. */
  resume(): void;
  /** Starts a company with the player's name, its own name and its headquarters, at the difficulty from the settings. */
  newGame(setup: Setup): void;
  advanceDays(days: number): void;
  setSpeed(speed: Speed): void;
  togglePause(): void;
  /** Saves under a name: to the given slot, or to a new one. */
  saveAs(name: string, id?: string): Promise<boolean>;
  /** Saves to the game's own slot; a game that has none gets one, named after its date. */
  quickSave(): Promise<boolean>;
  autosave(): Promise<void>;
  load(id: string): Promise<boolean>;
  /** Loads the newest save. */
  loadLatest(): Promise<boolean>;
  deleteSave(id: string): Promise<void>;
  /** Changes the game in a way that can't fail: an answer in the tutorial, say. */
  change(fn: (state: GameState) => GameState): void;
  /** Runs a player action; shows its error if it fails. Returns the new id on success, or true. */
  run(action: (state: GameState) => ActionResult): string | boolean;
  notify(text: string, kind?: MessageKind, messageId?: number): void;
  /** Takes a pop-up off the screen. */
  dismissAlert(id: number): void;
  /** The player has a window open: its dot goes. */
  attend(window: string): void;
  /** Closes the milestone pop-up, and the game carries on if it was running. */
  closeCelebration(): void;
  updateSettings(patch: Partial<Settings>): void;
}

/** How many pop-ups are on screen at most; older ones make way. */
const MAX_ALERTS = 3;

const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

/** What a save is called when the player gives it no name: the company and the game's date. */
export const defaultSaveName = (game: GameState) => `${game.companyName} · ${formatDate(game.day)}`;

export const useGameStore = create<GameStore>()((setState, getState) => {
  /**
   * The news between two states of the game that needs more than a line in the ticker. A milestone gets a pop-up
   * that pauses the game and names what it opened; other news about a window gets a small pop-up that names the
   * window. Each of those windows gets a dot on its menu icon until it is opened. True if a small pop-up came up.
   */
  const announce = (before: GameState, after: GameState): boolean => {
    const reached = after.milestones.slice(before.milestones.length).map((m) => m.id);
    const opened = after.unlocked.filter((feature) => !before.unlocked.includes(feature));
    const fresh = newAlerts(before, after);
    const { alerts, attention, celebration, speed } = getState();
    if (reached.length > 0) {
      setState({
        celebration: {
          milestones: [...(celebration?.milestones ?? []), ...reached],
          opened: [...(celebration?.opened ?? []), ...opened],
          resume: celebration ? celebration.resume : speed !== 0,
        },
        speed: 0,
      });
    }
    if (fresh.length > 0) setState({ attention: [...new Set([...attention, ...fresh.map((m) => m.about!)])] });
    // What a milestone opened is in its own pop-up already.
    const shown = reached.length > 0 ? opened.map((feature) => UNLOCKS[feature].window) : [];
    const small = fresh.filter((m) => !shown.includes(m.about!));
    if (small.length > 0) setState({ alerts: [...alerts, ...small].slice(-MAX_ALERTS) });
    return small.length > 0;
  };

  return {
    game: undefined,
    ready: false,
    atHome: true,
    saves: [],
    slot: undefined,
    speed: 0,
    resumeSpeed: 1,
    notice: undefined,
    alerts: [],
    attention: [],
    celebration: undefined,
    settings: readSettings(),

    async boot() {
      await getState().refreshSaves();
      setState({ ready: true });
    },

    async refreshSaves() {
      setState({ saves: await listSaves().catch(() => []) });
    },

    openHome() {
      setState({ atHome: true, speed: 0 });
      void getState().refreshSaves();
    },

    resume() {
      if (getState().game) setState({ atHome: false });
    },

    newGame(setup) {
      const game = createInitialState(newSeed(), getState().settings.difficulty, setup);
      setState({ game, slot: undefined, speed: 0, atHome: false, alerts: [], attention: [], celebration: undefined });
      getState().notify(`${game.companyName} is in business`);
      playJingle('start');
    },

    advanceDays(days) {
      const { game } = getState();
      if (!game || game.bankrupt || days <= 0) return;
      const next = advance(game, days);
      setState({ game: next });

      if (announce(game, next)) play('select');
      // Toast the most important of the other new messages from the simulation; a milestone has a pop-up of its own.
      // News of low priority only lands in the inbox (0.17.0).
      const top = topMessage(game, next);
      if (top && !top.about && top.topic !== 'milestone' && priorityOf(top) !== 'low') getState().notify(firstParagraph(top.text), top.kind, top.id);
      if (next.bankrupt) setState({ speed: 0 });
      const jingle = jingleFor(game, next);
      if (jingle) playJingle(jingle);

      const before = toCalendarDate(game.day);
      const after = toCalendarDate(next.day);
      if (getState().settings.autosave && (before.month !== after.month || before.year !== after.year)) {
        void getState().autosave();
      }
    },

    setSpeed(speed) {
      setState(speed === 0 ? { speed } : { speed, resumeSpeed: speed });
    },

    togglePause() {
      const { speed, resumeSpeed } = getState();
      setState({ speed: speed === 0 ? resumeSpeed : 0 });
    },

    async saveAs(name, id = newSaveId()) {
      const { game, notify } = getState();
      if (!game) return false;
      const slot = { id, name: name.trim() || defaultSaveName(game) };
      try {
        await writeSave(slot.id, slot.name, game);
        setState({ slot });
        notify(`Saved as “${slot.name}”`);
        return true;
      } catch {
        notify(desktop ? 'Saving failed: the save folder can’t be written to' : 'Saving failed: your browser may be blocking storage', 'warning');
        return false;
      } finally {
        await getState().refreshSaves();
      }
    },

    quickSave() {
      const { game, slot, saveAs } = getState();
      if (!game) return Promise.resolve(false);
      return slot ? saveAs(slot.name, slot.id) : saveAs(defaultSaveName(game));
    },

    async autosave() {
      const { game } = getState();
      if (!game || game.bankrupt) return;
      // Quietly: an autosave that fails is not worth interrupting the game for.
      await writeSave(AUTOSAVE, 'Autosave', game).catch(() => undefined);
      await getState().refreshSaves();
    },

    async load(id) {
      const { notify, saves } = getState();
      try {
        const save = await readSave(id);
        if (!save) {
          notify('That save is gone', 'warning');
          return false;
        }
        const name = saves.find((s) => s.id === id)?.name ?? 'Saved game';
        // A game loaded from the autosave gets a slot of its own the first time it is saved.
        // Whatever was waiting for an answer when the game was saved is still waiting.
        setState({ game: save.state, slot: id === AUTOSAVE ? undefined : { id, name }, speed: 0, atHome: false, alerts: [], attention: waitingFor(save.state), celebration: undefined });
        notify(`Loaded “${name}”`);
        return true;
      } catch (error) {
        notify(error instanceof SaveError ? `This save can’t be loaded. ${error.message}` : 'Loading failed', 'warning');
        return false;
      }
    },

    async loadLatest() {
      const latest = await readLatestSave().catch(() => undefined);
      if (!latest) {
        getState().notify('No save found', 'warning');
        return false;
      }
      return getState().load(latest.info.id);
    },

    async deleteSave(id) {
      await deleteSave(id).catch(() => getState().notify('That save could not be deleted', 'warning'));
      if (getState().slot?.id === id) setState({ slot: undefined });
      await getState().refreshSaves();
    },

    change(fn) {
      const { game } = getState();
      if (game) setState({ game: fn(game) });
    },

    run(action) {
      const { game, notify } = getState();
      if (!game) return false;
      const result = action(game);
      if (!result.ok) {
        notify(result.error, 'warning');
        play('denied');
        return false;
      }
      setState({ game: result.state });
      // What the player did can reach a milestone and open something: that is news, like the news of a day.
      announce(game, result.state);
      // Something the player did can be news too: research that is done, an event that went well.
      const jingle = jingleFor(game, result.state);
      if (jingle) playJingle(jingle);
      return result.id ?? true;
    },

    notify(text, kind = 'info', messageId) {
      setState({ notice: { text, kind, ...(messageId !== undefined && { messageId }) } });
    },

    closeCelebration() {
      const { celebration, resumeSpeed } = getState();
      setState(celebration?.resume ? { celebration: undefined, speed: resumeSpeed } : { celebration: undefined });
    },

    dismissAlert(id) {
      setState({ alerts: getState().alerts.filter((alert) => alert.id !== id) });
    },

    attend(window) {
      const { attention } = getState();
      // News about a section of a window is seen when the window is open.
      const seen = (about: string) => about.split(':')[0] === window;
      if (attention.some(seen)) setState({ attention: attention.filter((about) => !seen(about)) });
    },

    updateSettings(patch) {
      const settings = { ...getState().settings, ...patch };
      setState({ settings });
      writeSettings(settings);
      applyTheme(settings.theme, getState().game?.day ?? null);
      setSoundVolume(settings.soundVolume);
      setOfficeVolume(settings.officeVolume);
      setVoiceVolume(settings.voiceVolume);
    },
  };
});

applyTheme(useGameStore.getState().settings.theme, useGameStore.getState().game?.day ?? null);
setSoundVolume(useGameStore.getState().settings.soundVolume);
setOfficeVolume(useGameStore.getState().settings.officeVolume);
setVoiceVolume(useGameStore.getState().settings.voiceVolume);
// By the time of day, the scheme turns with the office clock of the game that is open.
useGameStore.subscribe((state, before) => {
  if (state.game?.day !== before.game?.day) applyTheme(state.settings.theme, state.game?.day ?? null);
});

/** The current game; only use inside screens rendered after boot. */
export function useGame(): GameState {
  const game = useGameStore((s) => s.game);
  if (!game) throw new Error('useGame called before the game was loaded');
  return game;
}
