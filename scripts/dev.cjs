#!/usr/bin/env node
// Cross-platform launcher for `electron-vite dev` / `preview`.
//
// The dev/preview/start npm scripts used to be prefixed with
// `env -u ELECTRON_RUN_AS_NODE`. `env -u` is a Unix-only builtin, so on Windows
// `npm run dev` failed immediately with "'env' is not recognized". This launcher
// does the same job on every OS: strip ELECTRON_RUN_AS_NODE if a parent set it
// (when that var is present Electron boots as a plain Node process and the app
// window never opens), then run electron-vite with the requested subcommand.
const { spawn } = require('node:child_process')
const path = require('node:path')

const cmd = process.argv[2] || 'dev'
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const isWin = process.platform === 'win32'
const bin = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  isWin ? 'electron-vite.cmd' : 'electron-vite'
)

// shell:true on Windows so the .cmd shim resolves; not needed elsewhere.
const child = spawn(bin, [cmd], { stdio: 'inherit', env, shell: isWin })
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
