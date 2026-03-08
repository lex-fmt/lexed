import { lspClient, type TransportFactory } from './client'

let initializePromise: Promise<void> | null = null
let transportFactorySet = false

/**
 * Set the transport factory for the LSP client.
 * Must be called before ensureLspInitialized if using a custom transport.
 */
export function setLspTransportFactory(factory: TransportFactory) {
  lspClient.setTransportFactory(factory)
  transportFactorySet = true
}

export function ensureLspInitialized(rootPath?: string) {
  if (!initializePromise) {
    initializePromise = lspClient.start(rootPath || '').catch((error) => {
      console.error('LSP initialization failed', error)
      throw error
    })
  }
  return initializePromise
}

/**
 * Check if a custom transport factory has been set.
 * Useful for verifying platform integration.
 */
export function hasCustomTransport(): boolean {
  return transportFactorySet
}
