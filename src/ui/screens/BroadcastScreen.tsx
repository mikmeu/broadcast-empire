import { employeesWithDesk } from '../../sim/office';
import { shortOnAir } from '../../sim/staffing';
import { isUnlocked, lockedReason } from '../../sim/unlocks';
import { STREAMING_LOCK } from '../../sim/streaming';
import { Icon } from '../Icon';
import { useOnAir } from '../onAir';
import { useGame, useGameStore } from '../store';
import { ChannelScreen } from './ChannelScreen';
import { ContentScreen } from './ContentScreen';
import { RatingsScreen } from './RatingsScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { StaffingScreen } from './StaffingScreen';
import { StreamingScreen } from './StreamingScreen';
import { VansScreen } from './VansScreen';
import { YearPlanner } from './YearPlanner';

/** The menu of the window. A channel's schedule is a page of Channels, opened from the channel. */
const SECTIONS = {
  channels: { label: 'Channels', Screen: ChannelScreen },
  content: { label: 'Content', Screen: ContentScreen },
  ratings: { label: 'Ratings', Screen: RatingsScreen },
  staffing: { label: 'Staffing', Screen: StaffingScreen },
  streaming: { label: 'Streaming', Screen: StreamingScreen },
  planner: { label: 'Year planner', Screen: YearPlanner },
  vans: { label: 'News vans', Screen: VansScreen },
};
const MENU = Object.keys(SECTIONS) as (keyof typeof SECTIONS)[];

/** Everything that goes out on the air, in one window: the channels with their schedules and shows, bought content, the ratings, who makes the shows and the streaming service. */
export function BroadcastScreen() {
  const game = useGame();
  const notify = useGameStore((s) => s.notify);
  const { section, show } = useOnAir();
  // The content market is for television: it opens with the first TV license. The streaming service opens with its research (0.18.0).
  const locks: Partial<Record<keyof typeof SECTIONS, string>> = {
    // A library opens it too (0.18.0): the records for music shows are bought there.
    ...(!isUnlocked(game, 'content') && !game.rooms.some((r) => r.type === 'library') && { content: lockedReason('content') }),
    ...(!game.techs.includes('streaming') && { streaming: STREAMING_LOCK }),
  };
  // A section that is not open yet falls back to the first one.
  const current = section !== 'schedule' && locks[section] ? 'channels' : section;
  const Screen = current === 'schedule' ? ScheduleScreen : SECTIONS[current].Screen;
  const short = shortOnAir(game, employeesWithDesk(game)).length > 0;
  return (
    <>
      <div className="segmented window-sections" role="tablist" aria-label="Broadcasting">
        {MENU.map((id) =>
          locks[id] ? (
            <button key={id} role="tab" aria-selected={false} aria-disabled="true" className="locked" data-sound="denied" title={locks[id]} onClick={() => notify(locks[id]!)}>
              <Icon name="locked" size={13} /> {SECTIONS[id].label}
            </button>
          ) : (
            // A schedule belongs to Channels.
            <button key={id} role="tab" data-guide={`section-${id}`} aria-selected={id === current || (id === 'channels' && current === 'schedule')} className={id === current || (id === 'channels' && current === 'schedule') ? 'active' : undefined} onClick={() => show(id)}>
              {SECTIONS[id].label}
              {id === 'staffing' && short && <span className="dot" role="img" aria-label="A show on the air is short of producers" />}
            </button>
          ),
        )}
      </div>
      <Screen />
    </>
  );
}
