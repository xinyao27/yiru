import { renderToString } from 'react-dom/server'

import { App } from './app'
import { renderFaqStructuredData } from './structured-data'

/**
 * Why: the build-time counterpart of main.tsx. `vp build` emits a document whose
 * #root is empty, and the crawlers that matter most for a developer tool — the
 * ones behind AI search — do not run JavaScript, so they would read a blank
 * page. apps/landing/scripts/prerender.mjs bundles this for Node and injects the
 * result.
 *
 * StrictMode is deliberately absent: it changes nothing about the markup, and
 * main.tsx keeps it for the client tree where its checks actually run.
 */
export function renderApp(): string {
  return renderToString(<App />)
}

export { renderFaqStructuredData }
