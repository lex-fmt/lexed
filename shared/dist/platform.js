/**
 * Platform Adapter Interface
 *
 * ## Motivation
 *
 * Lexed's editor components need to run on multiple platforms:
 * - **Electron desktop app** (Lexed): Full filesystem access, native menus, IPC-based LSP
 * - **Web browser app**: localStorage/IndexedDB, keyboard shortcuts, WASM-based LSP
 *
 * Rather than duplicating the editor UI for each platform, we abstract all
 * platform-specific operations behind this interface. The editor components
 * remain pure React/Monaco code that works identically on both platforms.
 *
 * ## Design
 *
 * The interface is organized into logical subsystems:
 *
 * - **fileSystem**: File I/O operations (read, write, open dialogs)
 * - **theme**: System theme detection and changes
 * - **settings**: User preferences persistence
 * - **lsp**: Language server transport factory
 * - **persistence**: Tab/pane layout persistence
 * - **commands**: Menu command subscriptions (optional for web)
 *
 * Each subsystem returns an object with methods, allowing partial implementation
 * where some features aren't available (e.g., web has no native file dialogs).
 *
 * ## Trade-offs
 *
 * - **Abstraction overhead**: Adds one layer of indirection. Acceptable because
 *   platform operations are already async and the abstraction is thin.
 *
 * - **Feature parity**: Web platform has limited capabilities (no native dialogs,
 *   no filesystem write without user gesture). The interface allows graceful
 *   degradation via optional methods and null returns.
 *
 * - **Type safety**: Full TypeScript types ensure implementations match the
 *   interface. Runtime errors are caught at integration testing.
 *
 * ## Usage
 *
 * Components access the adapter via React context:
 *
 * ```typescript
 * const platform = usePlatform();
 * const content = await platform.fileSystem.read(path);
 * ```
 *
 * Platform implementations are injected at app root:
 *
 * ```tsx
 * <PlatformProvider adapter={electronAdapter}>
 *   <App />
 * </PlatformProvider>
 * ```
 *
 * @see ElectronAdapter - Electron implementation
 * @see WebAdapter - Browser implementation (in lex-web)
 */
export {};
