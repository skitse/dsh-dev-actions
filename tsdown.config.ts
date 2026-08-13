import { defineConfig } from 'tsdown'

export default defineConfig([
  { entry: { index: 'src/index.ts' }, outDir: 'lib', format: 'esm', dts: true },
  { entry: { client: 'src/client/index.tsx' }, outDir: 'lib', format: 'esm', dts: true, platform: 'browser', clean: false },
])
