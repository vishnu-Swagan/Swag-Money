import { build } from 'esbuild'

await build({
  entryPoints: ['src/content.ts', 'src/background.ts', 'src/options.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  outdir: 'dist',
})
