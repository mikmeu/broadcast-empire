import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The fonts come with the game, so it also works without the internet.
import '@fontsource/fjalla-one/400.css';
import '@fontsource/assistant/200.css';
import '@fontsource/assistant/400.css';
import '@fontsource/assistant/600.css';
import { App } from './ui/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
