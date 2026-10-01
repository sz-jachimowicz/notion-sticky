import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')
const ctx = await esbuild.context({
  entryPoints: { note: 'src/note.js', manager: 'src/manager.js' },
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'chrome130',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
})

if (watch) await ctx.watch()
else {
  await ctx.rebuild()
  await ctx.dispose()
}
