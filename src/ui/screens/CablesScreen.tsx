import { channelOffAirReason } from '../../sim/broadcast';
import { cables as cablesOf } from '../../sim/control';
import { roomName } from '../../sim/office';
import { Panel } from '../components';
import { useGame } from '../store';

/** Where each cable goes, in words (0.16.0). While this window is open the cables are drawn in the office (0.21.0). */
export function CablesScreen() {
  const game = useGame();
  const list = cablesOf(game, (channel) => channelOffAirReason(game, channel) === null);
  const end = { mcr: 'master control', antenna: 'antenna', dish: 'dish' } as const;
  const state = { live: 'on the air', idle: 'nothing on it', cut: 'cut off' } as const;
  return (
    <Panel title="Cables" help="headquarters">
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
