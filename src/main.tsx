// Styles globaux en premier : les feuilles des fonctionnalités, chargées ensuite, peuvent les surcharger.
import './app/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installErrorLog } from './features/diagnostics/errorLog';
import { useSettings } from './features/settings/store';
import { resolveLanguage, setLanguage } from './shared/i18n';

// Le plus tôt possible : les erreurs du démarrage sont aussi journalisées.
installErrorLog();

// Langue de l'interface avant le premier rendu (réglages déjà relus, stockage synchrone).
setLanguage(resolveLanguage(useSettings.getState().language));
useSettings.subscribe((s, prev) => {
  if (s.language !== prev.language) setLanguage(resolveLanguage(s.language));
});

const root = document.getElementById('root');
if (!root) throw new Error('#root introuvable');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
