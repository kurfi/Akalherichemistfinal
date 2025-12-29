import * as React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Suppress specific verbose logs from external sources
const originalLog = console.log;
const originalDebug = console.debug;
const originalWarn = console.warn;
const originalError = console.error;

const filter = (...args: any[]) => {
  const msg = args.map(arg => String(arg)).join(' ');
  return (
    msg.includes('VIDEO_XHR_CANDIDATE') ||
    msg.includes('dispatchMessage') ||
    msg.includes('_$initialUrl') ||
    msg.includes('chrome-extension://') ||
    msg.includes('message.js') ||
    msg.includes('extension://')
  );
};

console.log = (...args) => { if (!filter(...args)) originalLog(...args); };
console.debug = (...args) => { if (!filter(...args)) originalDebug(...args); };
console.warn = (...args) => { if (!filter(...args)) originalWarn(...args); };
console.error = (...args) => { if (!filter(...args)) originalError(...args); };

// Service Worker Registration for PWA capabilities
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then(
      (registration) => {
      },
      (err) => {
      }
    );
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);