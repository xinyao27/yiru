import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

import { App } from './app'

import './index.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element not found')
}

const tree = (
  <StrictMode>
    <App />
  </StrictMode>
)

// Why: only the built document carries a prerendered tree, injected by
// apps/landing/scripts/prerender.mjs. `vp dev` still serves an empty #root, and
// hydrating an empty container logs a mismatch before falling back to a client
// render — so branch on the DOM that is actually there rather than on a build
// flag, and the dev server stays quiet.
if (container.firstChild) {
  hydrateRoot(container, tree)
} else {
  createRoot(container).render(tree)
}
