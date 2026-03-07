import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ensureUserMediaSupport } from './lib/ensureUserMedia';
import './App.css';

ensureUserMediaSupport();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
