import * as esbuild from 'esbuild'
import fs from 'node:fs'

const watch = process.argv.includes('--watch')
const minify = !watch

// okna aplikacji na komputer
const desktop = {
  entryPoints: { note: 'src/note.js', manager: 'src/manager.js' },
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'chrome130',
  minify,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
}

// synchronizacja dla procesu głównego Electron (Node)
const syncMain = {
  entryPoints: ['src/sync/engine.js'],
  bundle: true,
  outfile: 'dist/sync.cjs',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  minify,
  logLevel: 'info',
}

// aplikacja na Androida (Capacitor) -> www/
const mobile = {
  entryPoints: { app: 'src/mobile/app.js' },
  bundle: true,
  outdir: 'www',
  format: 'iife',
  target: 'chrome110',
  minify,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
}

function copyMobileStatic() {
  fs.mkdirSync('www', { recursive: true })
  for (const [from, to] of [
    ['src/mobile/index.html', 'www/index.html'],
    ['src/mobile/mobile.css', 'www/mobile.css'],
    ['src/theme.css', 'www/theme.css'],
    ['src/note.css', 'www/note.css'],
  ]) fs.copyFileSync(from, to)
}

const ctxs = await Promise.all([desktop, syncMain, mobile].map((o) => esbuild.context(o)))
copyMobileStatic()

if (watch) {
  await Promise.all(ctxs.map((c) => c.watch()))
} else {
  await Promise.all(ctxs.map((c) => c.rebuild()))
  await Promise.all(ctxs.map((c) => c.dispose()))
}
