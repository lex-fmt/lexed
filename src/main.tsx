// Canonical E2E hooks — see ~/.claude/skills/electron-e2e-testing/SKILL.md.
// Initialized before any code that touches window.__e2e (lsp/client.ts, bridge hook).
const MAX_E2E_EVENTS = 1000

window.__e2e = {
  ready: { app: false, lsp: false, spellcheck: false },
  events: [],
  bridge: {},
  signal(type, payload) {
    this.events.push({ type, ts: Date.now(), payload })
    // Cap at MAX_E2E_EVENTS to prevent unbounded growth in long sessions.
    if (this.events.length > MAX_E2E_EVENTS) {
      this.events.splice(0, this.events.length - MAX_E2E_EVENTS)
    }
  },
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App.tsx'
import './index.css'
import { initializeMonaco } from './monaco/index.ts'
import { PlatformProvider } from './contexts/PlatformContext'
import { electronAdapter } from './platform'
import { setLspTransportFactory } from './lsp/init'
import log from 'electron-log/renderer'

log.transports.console.level = import.meta.env.MODE === 'development' ? 'debug' : 'error'

// Set up LSP transport from platform adapter before Monaco initialization
setLspTransportFactory(() => electronAdapter.lsp.createTransport())

initializeMonaco()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PlatformProvider adapter={electronAdapter}>
      <App />
      <Toaster position="bottom-right" />
    </PlatformProvider>
  </React.StrictMode>
)

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
