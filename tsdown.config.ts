import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { transform } from 'lightningcss'
import { defineConfig, type UserConfig } from 'tsdown'

const CSS_PREFIX = '\0dev-actions-css:'
const CSS_SUFFIX = '.mjs'

function cssInlinePlugin(): NonNullable<UserConfig['plugins']>[number] {
  return {
    name: 'dev-actions-css-inline',
    resolveId(source: string, importer?: string) {
      if (!source.endsWith('.css')) return null
      return CSS_PREFIX + (importer === undefined ? source : resolve(dirname(importer), source)) + CSS_SUFFIX
    },
    async load(id: string) {
      if (!id.startsWith(CSS_PREFIX)) return null
      const file = id.slice(CSS_PREFIX.length, -CSS_SUFFIX.length)
      this.addWatchFile(file)
      const source = await readFile(file)
      const { code, exports } = transform({ filename: file, code: source, cssModules: { pattern: '[hash]_[local]' }, minify: true })
      const classMap: Record<string, string> = {}
      for (const [local, value] of Object.entries(exports ?? {})) classMap[local] = value.name
      const tagId = `dsh-dev-actions/${basename(file)}`
      return [
        `const cssText = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        'function installStyles() {',
        "  if (typeof document === 'undefined') return () => {};",
        "  let tag = document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']');",
        "  if (tag === null) { tag = document.createElement('style'); document.head.appendChild(tag); }",
        "  tag.dataset.plugin = 'dsh-dev-actions';",
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = cssText;',
        '  tag.dataset.pluginOwners = String(Number(tag.dataset.pluginOwners || 0) + 1);',
        '  let disposed = false;',
        '  return () => {',
        '    if (disposed) return;',
        '    disposed = true;',
        '    const owners = Number(tag.dataset.pluginOwners || 1) - 1;',
        "    if (owners <= 0) tag.remove(); else tag.dataset.pluginOwners = String(owners);",
        '  };',
        '}',
        'export { installStyles };',
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }
}

function clientConfig(entryName: string, moduleId: string): UserConfig {
  return {
    entry: { [entryName]: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    dts: false,
    platform: 'browser',
    clean: false,
    external: ['react', 'react/jsx-runtime', 'cordis', 'dsh-better-sidebar'],
    plugins: [cssInlinePlugin()],
    outputOptions: {
      entryFileNames: `${entryName}.js`,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(moduleId)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  }
}

export default defineConfig([
  { entry: { index: 'src/index.ts' }, outDir: 'lib', format: 'esm', dts: true },
  clientConfig('client', 'dsh-dev-actions'),
  clientConfig('client-registry', 'skitse/dsh-dev-actions'),
])
