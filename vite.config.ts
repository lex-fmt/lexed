/// <reference types="vitest" />
import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
        // Force CJS output for the main process. The repo's
        // package.json sets `"type": "module"`, which would otherwise
        // make vite-plugin-electron's resolveViteConfig() default
        // build.lib.formats to ['es'] (see node_modules/vite-plugin-
        // electron/dist/index.mjs). The bundled CJS deps
        // (electron-log, electron-updater, electron-store) call
        // `require("electron")` at top level; rolldown wraps that in
        // a CJS-interop shim that throws under ESM, the throw turns
        // into a GUI alert that hangs CI for ~38 min per run before
        // failing every test at electronApp.firstWindow().
        // CJS sidesteps the trap entirely. See lex-fmt/lexed#69.
        //
        // Both `lib.formats` and `lib.fileName` need to be overridden
        // — vite-plugin-electron's default fileName is `[name].js`
        // (which would clash with the `"type": "module"` parent and
        // be loaded as ESM regardless of bundle format).
        vite: {
          build: {
            lib: {
              entry: 'electron/main.ts',
              formats: ['cjs'],
              fileName: () => '[name].cjs'
            }
          }
        }
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        input: 'electron/preload.ts'
        // Preload runs in the renderer's preload context; ESM is fine
        // there and there are no problematic CJS deps to bundle. Leave
        // it as the default (.mjs).
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer:
        process.env.NODE_ENV === 'test'
          ? // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
            undefined
          : {}
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@lex/shared': path.resolve(__dirname, './shared/src/index.ts'),
      '@lex/monaco-inline-injections': path.resolve(
        __dirname,
        './packages/monaco-inline-injections/src/index.ts'
      ),
      '@lex-fmt/lex-buffer': path.resolve(__dirname, './packages/lex-buffer/src/index.ts')
    }
  },
  server: {
    watch: {
      // Ignore user documents and dictionaries - not source code
      ignored: ['**/*.lex', '**/welcome/**', '**/dictionaries/**']
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**']
  }
})
