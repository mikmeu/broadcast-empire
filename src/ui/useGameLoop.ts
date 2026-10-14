import { useEffect } from 'react';
import { MAX_DAYS_PER_FRAME, MS_PER_DAY } from '../config/balance';
import { useGameStore } from './store';

/** Progress through the current in-game day (0–1), for the day progress bar. */
export const clock = { dayProgress: 0 };

/** Drives the simulation from requestAnimationFrame at the current game speed. */
export function useGameLoop(): void {
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let elapsed = 0;

    const loop = (now: number) => {
      const { speed, advanceDays } = useGameStore.getState();
      elapsed += (now - last) * speed;
      last = now;

      let days = Math.floor(elapsed / MS_PER_DAY);
      elapsed -= days * MS_PER_DAY;
      if (days > MAX_DAYS_PER_FRAME) {
        // The tab was in the background or the frame stalled: drop the backlog
        // instead of fast-forwarding through weeks the player didn't see.
        days = MAX_DAYS_PER_FRAME;
        elapsed = 0;
      }
      advanceDays(days);
      clock.dayProgress = elapsed / MS_PER_DAY;

      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);
}
