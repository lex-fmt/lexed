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
import {
  initializeMonaco,
  lspClient,
  setLspTransportFactory,
  configureHost,
} from '@lex-fmt/lex-buffer'
import { trustPromptCoordinator } from './lsp/trustPromptCoordinator'
import { PlatformProvider } from './contexts/PlatformContext'
import { electronAdapter } from './platform'
import { getFormatterSettingsSnapshot, getSettingsSnapshot } from './settings/snapshot'
import { spellcheckService } from './spellcheck/service'
import log from 'electron-log/renderer'

log.transports.console.level = import.meta.env.MODE === 'development' ? 'debug' : 'error'

// Wire host bindings into @lex-fmt/lex-buffer before any LSP / Monaco
// activity. The package falls back to safe defaults if a binding is
// missing, but lexed relies on these for formatter settings,
// workspace-aware completion, structured logging, e2e signaling, and
// spellcheck-on-model-change.
configureHost({
  getWorkspaceRoot: () => getSettingsSnapshot().lastFolder,
  getFormatterSettings: () => getFormatterSettingsSnapshot(),
  logger: log,
  e2e: {
    signal: (name, payload) => window.__e2e.signal(name, payload),
    notifyFormattingRequest: (payload) => window.__e2e.bridge.notifyFormattingRequest?.(payload),
  },
  onLexModelReady: (model) => spellcheckService.scheduleCheck(model),
  onLexModelChange: (model) => spellcheckService.scheduleCheck(model),
})

// Update the e2e ready flag when the LSP signals readiness — the
// package no longer sets this directly because window.__e2e is
// lexed-specific test plumbing.
window.addEventListener('lexed:lsp-ready', () => {
  window.__e2e.ready.lsp = true
})

// Set up LSP transport from platform adapter before Monaco initialization
setLspTransportFactory(() => electronAdapter.lsp.createTransport())

// Register the `lex/trustRequest` handler. Forwards the request to
// the trustPromptCoordinator, which surfaces it to the
// <TrustPromptModal /> component in App.tsx. The Promise the handler
// returns resolves when the user clicks Trust / Deny / dismisses
// the modal — which becomes the LSP response.
//
// `onRequest` is synchronous: the handler is recorded immediately
// and bound to the LSP connection before `InitializeRequest` is
// sent, so a `lex/trustRequest` that fires during workspace boot
// finds the handler waiting.
lspClient.onRequest('lex/trustRequest', (params) =>
  trustPromptCoordinator.request(params as Parameters<typeof trustPromptCoordinator.request>[0])
)

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
