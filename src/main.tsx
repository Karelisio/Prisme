// Styles globaux en premier : les feuilles des fonctionnalités, chargées ensuite, peuvent les surcharger.
import './app/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installErrorLog } from './features/diagnostics/errorLog';

// Le plus tôt possible : les erreurs du démarrage sont aussi journalisées.
installErrorLog();

const root = document.getElementById('root');
if (!root) throw new Error('#root introuvable');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
