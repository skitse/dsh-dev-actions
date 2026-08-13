import { defineConfig } from 'tsdown'

export default defineConfig([
  { entry: { index: 'src/index.ts' }, outDir: 'lib', format: 'esm', dts: true },
  {
    entry: { client: 'src/client/index.tsx' }, outDir: 'lib', format: 'cjs', dts: true, platform: 'browser', clean: false,
    external: ['react', 'react/jsx-runtime', 'cordis', 'dsh-better-sidebar'],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-dev-actions", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  },
])
