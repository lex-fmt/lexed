import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App.tsx'
import './index.css'
import { initializeMonaco } from './monaco/index.ts'
import log from 'electron-log/renderer';

log.transports.console.level = import.meta.env.MODE === 'development' ? 'debug' : 'error';


initializeMonaco();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster position="bottom-right" />
  </React.StrictMode>,
)

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
