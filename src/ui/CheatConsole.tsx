import { useEffect, useRef, useState } from 'react';
import { CHEATS, runCheat } from '../sim/cheats';
import { useGameStore } from './store';
import { Window, type WindowPlace } from './Window';

interface Line {
  input: string;
  text: string;
  ok: boolean;
}

/** How many answers stay on screen. */
const KEEP = 6;

/**
 * The cheat console, for testing: Ctrl+Alt+C opens and closes it. Type a code
 * and press Enter; the up and down arrows bring back earlier lines.
 */
export function CheatConsole() {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<WindowPlace>();
  const [input, setInput] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  /** Lines typed before, newest last, and how far back the arrows have gone. */
  const [history, setHistory] = useState<string[]>([]);
  const [back, setBack] = useState(0);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // By key position, because Alt changes the letter on some keyboards.
      if (e.ctrlKey && e.altKey && e.code === 'KeyC' && !useGameStore.getState().atHome) {
        e.preventDefault();
        setOpen((was) => !was);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const typed = input.trim();
    const { game } = useGameStore.getState();
    if (!typed || !game) return;
    const result = runCheat(game, typed);
    if (result.ok) useGameStore.setState({ game: result.state });
    setLines((all) => [...all, { input: typed, text: result.ok ? result.message : result.error, ok: result.ok }].slice(-KEEP));
    setHistory((all) => [...all.filter((line) => line !== typed), typed]);
    setBack(0);
    setInput('');
  };

  const recall = (step: number) => {
    const next = Math.min(history.length, Math.max(0, back + step));
    setBack(next);
    setInput(next === 0 ? '' : history[history.length - next]!);
  };

  return (
    <Window title="Cheat codes" className="narrow cheats" place={place} order={40} onMove={setPlace} onClose={() => setOpen(false)}>
      <form
        className="cheat-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={field}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              recall(e.key === 'ArrowUp' ? 1 : -1);
            }
          }}
          placeholder="money 50000"
          aria-label="Cheat code"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button className="primary" type="submit">Run</button>
      </form>
      {lines.length > 0 && (
        <ol className="cheat-log" aria-live="polite">
          {lines.map((line, i) => (
            <li key={i} className={line.ok ? undefined : 'failed'}>
              <code>{line.input}</code>
              <span>{line.text}</span>
            </li>
          ))}
        </ol>
      )}
      <dl className="cheat-list small">
        {CHEATS.map((cheat) => (
          <div key={cheat.code}>
            <dt>
              <button className="link" type="button" onClick={() => { setInput(cheat.use); field.current?.focus(); }}>{cheat.use}</button>
            </dt>
            <dd className="muted">{cheat.does}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">Ctrl+Alt+C opens and closes this. Codes change the game you are playing; they are not undone by closing it.</p>
    </Window>
  );
}
