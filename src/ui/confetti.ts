import type { CSSProperties } from 'react';

/** Colours and places of the confetti, spread evenly with the golden ratio so that every pop-up looks the same. */
export const CONFETTI = Array.from({ length: 48 }, (_, i) => {
  const spread = (i * 0.618034) % 1;
  return {
    '--x': `${(spread * 100).toFixed(1)}%`,
    '--delay': `${((i * 0.37) % 1.4).toFixed(2)}s`,
    '--fall': `${(2.4 + ((i * 0.53) % 1.6)).toFixed(2)}s`,
    '--spin': `${360 + Math.round(spread * 720)}deg`,
    '--colour': `var(--confetti-${(i % 5) + 1})`,
  } as CSSProperties;
});
