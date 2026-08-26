import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './app/App';

// Deploy identity — answers "which build is live?" from DevTools alone.
console.info(`[MetaView] build ${__MV_BUILD__}`);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
