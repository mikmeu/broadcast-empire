import { isUnlocked, lockedReason } from '../../sim/unlocks';
import { STREAMING_LOCK } from '../../sim/streaming';
import { Icon } from '../Icon';
import { useOnAir } from '../onAir';
import { useGame, useGameStore } from '../store';
import { ChannelScreen } from './ChannelScreen';
import { ContentScreen } from './ContentScreen';
import { RatingsScreen } from './RatingsScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { StreamingScreen } from './StreamingScreen';

/** The menu of the window. A channel's schedule is a page of Channels, opened from the channel. */
const SECTIONS = {
  channels: { label: 'Channels', Screen: ChannelScreen },
  content: { label: 'Content', Screen: ContentScreen },
  ratings: { label: 'Ratings', Screen: RatingsScreen },
  streaming: { label: 'Streaming', Screen: StreamingScreen },
};
const MENU = Object.keys(SECTIONS) as (keyof typeof SECTIONS)[];

/** Everything that goes out on the air, in one window: the channels with their schedules and shows, bought content, the ratings and the streaming service. */
export function BroadcastScreen() {
  const game = useGame();
  const notify = useGameStore((s) => s.notify);
  const { section, show } = useOnAir();
  // The content market is for television: it opens with the first TV license. The streaming service opens with its research (0.18.0).
  const locks: Partial<Record<keyof typeof SECTIONS, string>> = {
    ...(!isUnlocked(game, 'content') && { content: lockedReason('content') }),
    ...(!game.techs.includes('streaming') && { streaming: STREAMING_LOCK }),
  };
  // A section that is not open yet falls back to the first one.
  const current = section !== 'schedule' && locks[section] ? 'channels' : section;
  const Screen = current === 'schedule' ? ScheduleScreen : SECTIONS[current].Screen;
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
            </button>
          ),
        )}
      </div>
      <Screen />
    </>
  );
}
