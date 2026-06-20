import { resolve } from 'path'
import { readFileSync } from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Single source of truth for the app version — read from package.json
// at build time and inlined into both main and renderer bundles as
// __APP_VERSION__. Bump `version` in package.json on every release and
// every surface that displays it (Footer, brochure /download, app
// identity) will follow automatically.
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
) as { version: string }
const APP_VERSION_DEFINE = {
  __APP_VERSION__: JSON.stringify(pkg.version)
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    define: APP_VERSION_DEFINE
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    define: APP_VERSION_DEFINE
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        // Lean-split package boundaries (see src/renderer/src/office|runtime).
        // When these become real packages, only these targets move.
        '@office': resolve('src/renderer/src/office'),
        '@runtime': resolve('src/renderer/src/runtime')
      }
    },
    plugins: [react()],
    define: APP_VERSION_DEFINE,
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html')
        }
      }
    }
  }
})
