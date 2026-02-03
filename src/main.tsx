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
