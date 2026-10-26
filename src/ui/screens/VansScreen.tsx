import { NEWS_VAN } from '../../config/balance';
import { getGenre } from '../../config/genres';
import { SLOTS } from '../../config/world';
import { assignVan, buyNewsVan, sellNewsVan } from '../../sim/actions';
import { formatDate } from '../../sim/calendar';
import { eventContext } from '../../sim/events';
import { SHIFT_NAMES, VAN_SHIFTS, crewRates, shiftOf, shiftSlots, vanAppeal, vanCovers, vanCrews, vanValue } from '../../sim/newsVans';
import { employeesWithDesk } from '../../sim/office';
import type { GameState, VanShift } from '../../sim/state';
import { Empty, Panel, Tag } from '../components';
import { formatMoney } from '../format';
import { useGame, useGameStore } from '../store';

const SLOT_NAMES: Record<(typeof SLOTS)[number], string> = { morning: 'morning', lunch: 'lunch', afternoon: 'afternoon', evening: 'evening', lateNight: 'late night' };

/** The news shows (and on a big day the sports shows) on the air in a shift: what a van on that shift lifts. */
function coveredShows(game: GameState, shift: VanShift): string[] {
  const events = eventContext(game);
  const names: string[] = [];
  for (const channel of game.channels) {
    channel.schedule.forEach((id, slot) => {
      const show = game.shows.find((s) => s.id === id);
      if (show && shiftOf(slot) === shift && vanCovers(getGenre(show.genre), events)) names.push(show.name);
    });
  }
  return names;
}

/** The news vans (0.20.0, #20): buy one, send it out on a shift, and see what it lifts. One column on a small screen. */
export function VansScreen() {
  const game = useGame();
  const run = useGameStore((s) => s.run);
  const desked = employeesWithDesk(game);
  const crews = vanCrews(game, desked);
  const rates = crewRates(game, desked);
  const events = eventContext(game);
  const journalists = game.employees.filter((e) => e.role === 'journalist').length;
  return (
    <div className="two-col">
      <div className="stack">
        <Panel title="Your news vans" help="news-van">
          <p className="muted small">
            A van goes out with a journalist on a shift, the day (morning, lunch and afternoon) or the evening (evening and late night), and every radio and TV
            news show on the air then draws about {Math.round((NEWS_VAN.lift - 1) * 100)}% more ({Math.round((NEWS_VAN.uplinkLift - 1) * 100)}% with a satellite uplink). Sports shows gain on days with a sports
            event on, and in an election campaign. A trip costs {formatMoney(NEWS_VAN.trip)} on each day the van goes out. Each van needs a journalist at a workstation.
          </p>
          <button className="primary" onClick={() => run((s) => buyNewsVan(s))}>
            Buy a news van ({formatMoney(NEWS_VAN.price)})
          </button>
          {journalists < game.vans.length && <p className="muted small">You have more vans than journalists: hire one in Staff.</p>}
        </Panel>
        {game.vans.length === 0 ? (
          <Empty>No news van yet.</Empty>
        ) : (
          game.vans.map((van, i) => {
            const crew = crews.get(van.id);
            return (
              <Panel key={van.id} title={`News van ${i + 1}`} actions={<span className="muted small">Bought {formatDate(van.boughtOn)} · worth {formatMoney(vanValue(van, game.day))}</span>}>
                <div className="segmented" role="group" aria-label={`Shift of news van ${i + 1}`}>
                  <button aria-pressed={van.shift === null} className={van.shift === null ? 'active' : undefined} onClick={() => run((s) => assignVan(s, van.id, null))}>
                    Parked
                  </button>
                  {VAN_SHIFTS.map((shift) => (
                    <button key={shift} aria-pressed={van.shift === shift} className={van.shift === shift ? 'active' : undefined} onClick={() => run((s) => assignVan(s, van.id, shift))}>
                      {SHIFT_NAMES[shift]}
                    </button>
                  ))}
                </div>
                <p className="small">
                  {van.shift === null ? 'Parked in the lot.' : crew ? <>Crewed by <strong>{crew.name}</strong>.</> : <Tag tone="warning">No journalist at a desk</Tag>}
                </p>
                <button onClick={() => run((s) => sellNewsVan(s, van.id))}>Sell for {formatMoney(vanValue(van, game.day))}</button>
              </Panel>
            );
          })
        )}
      </div>
      <Panel title="The shifts">
        {VAN_SHIFTS.map((shift) => {
          const shows = coveredShows(game, shift);
          const lift = rates[shift] > 0 ? vanAppeal(game, rates, getGenre('tvNews'), NEWS_VAN.shifts[shift][0]!, events) : 1;
          return (
            <div key={shift} className="stack">
              <h4>
                {SHIFT_NAMES[shift]} <span className="muted small">({shiftSlots(shift).map((s) => SLOT_NAMES[s]).join(', ')})</span>
              </h4>
              <p className="small">
                {rates[shift] === 0 ? 'No van goes out.' : `A crewed van goes out: news shows draw ${Math.round((lift - 1) * 100)}% more.`}{' '}
                {shows.length === 0 ? 'No news show on the air in these slots.' : `On the air: ${shows.join(', ')}.`}
              </p>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
