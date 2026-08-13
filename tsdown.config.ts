import { defineConfig } from 'tsdown'

export default defineConfig([
  { entry: ['src/index.ts'], outDir: 'lib', format: 'esm', dts: true },
  { entry: ['src/client/index.tsx'], outDir: 'lib', format: 'esm', dts: true, platform: 'browser' },
])
