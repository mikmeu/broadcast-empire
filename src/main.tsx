import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The fonts come with the game, so it also works without the internet.
import '@fontsource/fjalla-one/400.css';
import '@fontsource/assistant/200.css';
import '@fontsource/assistant/400.css';
import '@fontsource/assistant/600.css';
import { App } from './ui/App';
import { useOfficeView } from './ui/officeView';
import { useGameStore } from './ui/store';
import { useWiki } from './ui/wiki';
import './ui/styles.css';

// The stores, for the screenshot script (scripts/screenshot.ts): in the dev server only, never in a build.
if (import.meta.env.DEV) Object.assign(window, { broadcastEmpire: { game: useGameStore, office: useOfficeView, wiki: useWiki } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
