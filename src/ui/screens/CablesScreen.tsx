import { channelOffAirReason } from '../../sim/broadcast';
import { cableChain, cables as cablesOf } from '../../sim/control';
import { floorsOf } from '../../config/office';
import { buildingOf, inOrder, roomName } from '../../sim/office';
import type { Channel } from '../../sim/state';
import { CableDiagram } from '../CableDiagram';
import { layoutChain } from '../cableLayout';
import { Panel } from '../components';
import { floorLabel } from '../officeView';
import { useGame } from '../store';

/** Where each cable goes, drawn floor by floor and in words (0.16.0). While this window is open the cables are drawn in the office (0.21.0). */
export function CablesScreen() {
  const game = useGame();
  const onAir = (channel: Channel) => channelOffAirReason(game, channel) === null;
  const list = cablesOf(game, onAir);
  const layout = layoutChain(
    cableChain(game, onAir),
    inOrder(game.rooms).map((r) => r.roomId),
    (floor) => (floor === null ? 'Roof' : floorLabel(floor, floorsOf(buildingOf(game)).length, game.floorsUnlocked)),
    (id) => roomName(game, id),
  );
  const end = { mcr: 'master control', antenna: 'antenna', dish: 'dish' } as const;
  const state = { live: 'on the air', idle: 'nothing on it', cut: 'cut off' } as const;
  return (
    <Panel title="Cables" help="headquarters">
      {list.length > 0 && <CableDiagram layout={layout} />}
      <div className="cable-legend">
        {list.length === 0 ? (
          <span className="small muted">None yet: every studio gets one, to the master control room, and from there one goes up to the antenna.</span>
        ) : (
          <ul className="small">
            {list.map((cable) => (
              <li key={`${cable.from}-${cable.to}`} className={`cable-${cable.status}`}>
                {roomName(game, cable.from)} → {end[cable.to]} · {state[cable.status]}
              </li>
            ))}
          </ul>
        )}
        <span className="small muted">Green: on the air. Red: can’t go out. Grey: nothing on it.</span>
      </div>
    </Panel>
  );
}
