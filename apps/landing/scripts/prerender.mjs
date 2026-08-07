import { readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { build } from 'vite'

// Why: `vp build` emits the client bundle only, so dist/index.html ships an
// empty #root. TanStack Start's prerender would fill it, but Start's dev server
// is broken on this repo's Vite 8 toolchain (TanStack/router#7614, still open),
// and a single-route marketing page uses none of the rest of the framework.
// Bundling the same tree for Node and injecting it costs one build step instead.
const appDirectory = resolve(import.meta.dirname, '..')
const bundleDirectory = resolve(appDirectory, '.prerender')
const documentPath = resolve(appDirectory, 'dist/index.html')

// Why: matching the exact empty div rather than a regex means an index.html edit
// that changes the mount point fails the build instead of shipping a blank page.
const ROOT_MARKER = '<div id="root"></div>'

await build({
  configFile: resolve(appDirectory, 'vite.config.ts'),
  root: appDirectory,
  logLevel: 'warn',
  build: {
    ssr: resolve(appDirectory, 'src/prerender-entry.tsx'),
    outDir: bundleDirectory,
    emptyOutDir: true,
    copyPublicDir: false
  }
})

try {
  const bundlePath = resolve(bundleDirectory, 'prerender-entry.js')
  const { renderApp } = await import(pathToFileURL(bundlePath).href)
  const document = await readFile(documentPath, 'utf8')
  if (!document.includes(ROOT_MARKER)) {
    throw new Error(`${documentPath} has no ${ROOT_MARKER} to inject the prerendered tree into`)
  }
  await writeFile(
    documentPath,
    document.replace(ROOT_MARKER, `<div id="root">${renderApp()}</div>`)
  )
} finally {
  // Why: the bundle is a build intermediate. Leaving it behind would put a
  // Node-targeted copy of the app next to the assets wrangler uploads.
  await rm(bundleDirectory, { recursive: true, force: true })
}
