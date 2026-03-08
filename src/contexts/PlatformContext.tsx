/* eslint-disable react-refresh/only-export-components */
/**
 * Platform Context
 *
 * Provides the PlatformAdapter to all components via React context.
 * This enables editor components to be platform-agnostic while still
 * having access to platform-specific operations.
 *
 * ## Usage
 *
 * Wrap your app with PlatformProvider at the root:
 *
 * ```tsx
 * import { electronAdapter } from '@/platform';
 *
 * function App() {
 *   return (
 *     <PlatformProvider adapter={electronAdapter}>
 *       <Editor />
 *     </PlatformProvider>
 *   );
 * }
 * ```
 *
 * Access the adapter in any child component:
 *
 * ```tsx
 * function Editor() {
 *   const platform = usePlatform();
 *
 *   const handleSave = async () => {
 *     await platform.fileSystem.write(path, content);
 *   };
 * }
 * ```
 *
 * @see PlatformAdapter - Interface definition in @lex/shared
 * @see electronAdapter - Electron implementation
 */

import { createContext, useContext, type ReactNode } from 'react'
import type { PlatformAdapter } from '@lex/shared'

const PlatformContext = createContext<PlatformAdapter | null>(null)

/**
 * Props for PlatformProvider component.
 */
interface PlatformProviderProps {
  /** The platform adapter implementation to provide */
  adapter: PlatformAdapter
  /** Child components that will have access to the platform */
  children: ReactNode
}

/**
 * Provides the PlatformAdapter to all child components.
 *
 * Must be placed at or near the root of the component tree, before any
 * components that need platform access.
 */
export function PlatformProvider({ adapter, children }: PlatformProviderProps) {
  return <PlatformContext.Provider value={adapter}>{children}</PlatformContext.Provider>
}

/**
 * Hook to access the PlatformAdapter.
 *
 * Must be used within a PlatformProvider. Throws an error if used outside.
 *
 * @returns The PlatformAdapter instance
 * @throws Error if used outside of PlatformProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const platform = usePlatform();
 *
 *   const openFile = async () => {
 *     const result = await platform.fileSystem.openDialog();
 *     if (result) {
 *       // Handle opened file
 *     }
 *   };
 * }
 * ```
 */
export function usePlatform(): PlatformAdapter {
  const adapter = useContext(PlatformContext)
  if (!adapter) {
    throw new Error('usePlatform must be used within a PlatformProvider')
  }
  return adapter
}

/**
 * Hook to optionally access the PlatformAdapter.
 *
 * Returns null if used outside of PlatformProvider, instead of throwing.
 * Useful for components that can work with or without platform access.
 *
 * @returns The PlatformAdapter instance, or null if not available
 */
export function usePlatformOptional(): PlatformAdapter | null {
  return useContext(PlatformContext)
}
