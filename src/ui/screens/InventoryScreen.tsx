import { play } from '../../audio/player';
import { FURNITURE, ROOM_TYPE_NAMES, inText } from '../../config/office';
import { sellStored } from '../../sim/actions';
import { wearsOut } from '../../sim/office';
import { resaleValue } from '../../sim/tech';
import { formatMoney } from '../format';
import { Icon } from '../Icon';
import { useOfficeView } from '../officeView';
import { useGame, useGameStore } from '../store';

/**
 * The furniture put away (0.19.0; it was the Stored tab of Rooms): each piece
 * as it was, with a way to put it in a room or to sell it.
 */
export function InventoryScreen() {
  const game = useGame();
  const run = useGameStore((s) => s.run);
  const moving = useOfficeView((s) => s.moving);
  const { move } = useOfficeView.getState();
  if (game.storage.length === 0) {
    return <p className="muted small">Nothing is stored. Click a piece in the office and choose Store it to put it away; it costs nothing, and you can place it in any room that takes it, on any floor.</p>;
  }
  return (
    <>
      <p className="muted small">Stored pieces don’t wear and cost nothing to keep, but they still lose worth with age.</p>
      <ul className="stored-list" aria-label="Stored furniture">
        {game.storage.map((item) => {
          const spec = FURNITURE[item.type];
          const lifted = moving?.roomId === null && moving.furnitureId === item.id;
          return (
            <li key={item.id}>
              <div>
                <strong>{spec.name}</strong>
                <div className="muted small">
                  {spec.line ? `Tier ${item.tier} · ` : ''}
                  {wearsOut(item.type) ? `Condition ${Math.round(item.condition)}% · ` : ''}
                  Worth {formatMoney(resaleValue(item, game.day))} · goes in a {spec.rooms.map((t) => inText(ROOM_TYPE_NAMES[t])).join(' or ')}
                </div>
              </div>
              <div className="row">
                <button className={lifted ? 'primary active' : 'primary'} aria-pressed={lifted} onClick={() => move(lifted ? null : { roomId: null, furnitureId: item.id, turn: 0 })}>
                  {lifted ? 'Stop placing' : 'Place it'}
                </button>
                <button
                  data-sound="none"
                  aria-label={`Sell it for ${formatMoney(resaleValue(item, game.day))}`}
                  onClick={() => {
                    if (!run((s) => sellStored(s, item.id))) return;
                    play('sell');
                    if (lifted) move(null);
                  }}
                >
                  <Icon name="sell" size={14} /> {formatMoney(resaleValue(item, game.day))}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
