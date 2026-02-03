/**
 * Platform Adapters
 *
 * This module provides platform-specific implementations of the PlatformAdapter
 * interface. The editor components use these adapters to perform platform
 * operations without coupling to specific APIs.
 *
 * ## Available Adapters
 *
 * - **electronAdapter**: Full Electron implementation using IPC
 *
 * ## Usage
 *
 * The adapter is injected via React context at the app root:
 *
 * ```tsx
 * import { electronAdapter } from '@/platform';
 *
 * <PlatformProvider adapter={electronAdapter}>
 *   <App />
 * </PlatformProvider>
 * ```
 *
 * Components access the adapter via the `usePlatform` hook:
 *
 * ```tsx
 * import { usePlatform } from '@/contexts/PlatformContext';
 *
 * function MyComponent() {
 *   const platform = usePlatform();
 *   const content = await platform.fileSystem.read(path);
 * }
 * ```
 *
 * @see @lex/shared - PlatformAdapter interface definition
 */

export { electronAdapter } from './electron'
