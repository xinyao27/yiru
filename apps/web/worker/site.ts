import { YIRU_GITHUB_RELEASES_URL, YIRU_GITHUB_REPOSITORY_URL } from '@yiru/workbench-model/product'

import type { WebWorkerEnvironment } from './connect/environment'
import { ConnectGrantObject } from './connect/grant-object'
import { ConnectMachineObject } from './connect/machine-object'
import { handleConnectApi } from './connect/routes'

export { ConnectGrantObject, ConnectMachineObject }

// Why: the site is static, but the apex and www hostnames both resolve to this
// Worker. Serving identical bytes from two hostnames splits SEO signals, so www
// is redirected here rather than in a dashboard-only rule that is invisible to
// this repository.
const CANONICAL_HOSTNAME = 'yiru.ai'
const REDIRECTED_HOSTNAMES = new Set([`www.${CANONICAL_HOSTNAME}`])

// Why: shipped desktop builds and the README advertise /download, /privacy, and
// sixteen /docs/* paths this site does not serve. Editing those call sites cannot
// reach an install already on someone's machine, so the routes have to answer
// here — and until they did, every one of them returned 200 with the homepage,
// which is a soft 404 to a crawler and the wrong page to a visitor.
//
// Every one is 302, never 301: a real /download page and real documentation are
// both still on the table, and a permanent redirect is cached by browsers and
// search engines well past the point where publishing those pages would take
// effect — there is no way to call it back.
const TEMPORARY_REDIRECT = 302
const DOWNLOAD_PATH = '/download'
const DOCUMENTATION_PREFIX = '/docs'
const DOCUMENTATION_PATHS = new Set(['/privacy'])
const PRODUCT_APP_PATH = '/app'
const PRODUCT_SHELL_ASSET_PATH = '/web-app-shell.txt'
const PRODUCT_APP_HOSTNAME = `app.${CANONICAL_HOSTNAME}`
// Why: app.localhost is a browser-defined loopback origin, so local QA can
// exercise the same origin routing and CSP without weakening the production host.
const PRODUCT_APP_HOSTNAMES = new Set([PRODUCT_APP_HOSTNAME, 'app.localhost'])
const PRODUCT_SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self' wss://app.yiru.ai",
    "font-src 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "require-trusted-types-for 'script'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    'trusted-types default'
  ].join('; '),
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff'
} as const

function isDocumentationPath(pathname: string): boolean {
  return (
    DOCUMENTATION_PATHS.has(pathname) ||
    pathname === DOCUMENTATION_PREFIX ||
    pathname.startsWith(`${DOCUMENTATION_PREFIX}/`)
  )
}

export default {
  async fetch(request: Request, env: WebWorkerEnvironment): Promise<Response> {
    const url = new URL(request.url)
    // Why: proof-of-possession protects every sensitive endpoint. Keeping the
    // apex alias allows the legacy /app origin and Wrangler's hostname rewrite
    // to finish pairing while the UI itself remains isolated on app.yiru.ai.
    if (PRODUCT_APP_HOSTNAMES.has(url.hostname) || url.hostname === CANONICAL_HOSTNAME) {
      const connectApiResponse = await handleConnectApi(request, env)
      if (connectApiResponse) {
        return withProductSecurityHeaders(connectApiResponse)
      }
    }
    if (REDIRECTED_HOSTNAMES.has(url.hostname)) {
      url.hostname = CANONICAL_HOSTNAME
      return Response.redirect(url.toString(), 301)
    }

    // Why: /download and /download/ have to land in the same place; a trailing
    // slash is what a stray copy-paste adds. Root keeps its own slash.
    const pathname = url.pathname === '/' ? url.pathname : url.pathname.replace(/\/+$/, '')

    if (PRODUCT_APP_HOSTNAMES.has(url.hostname)) {
      if (pathname === '/') {
        // Why: the asset binding keys only by pathname. A fresh internal URL
        // avoids reusing the outer root navigation's cached marketing document.
        const appEntryUrl = new URL(request.url)
        appEntryUrl.pathname = PRODUCT_SHELL_ASSET_PATH
        appEntryUrl.search = ''
        const appEntry = withProductSecurityHeaders(await env.ASSETS.fetch(appEntryUrl))
        appEntry.headers.set('Content-Type', 'text/html; charset=utf-8')
        return appEntry
      }
      return withProductSecurityHeaders(await env.ASSETS.fetch(request))
    }

    if (pathname === PRODUCT_APP_PATH || pathname.startsWith(`${PRODUCT_APP_PATH}/`)) {
      const productUrl = new URL(request.url)
      productUrl.hostname = PRODUCT_APP_HOSTNAME
      productUrl.pathname = pathname.slice(PRODUCT_APP_PATH.length) || '/'
      return Response.redirect(productUrl.toString(), TEMPORARY_REDIRECT)
    }

    if (pathname === PRODUCT_SHELL_ASSET_PATH) {
      return new Response(null, { status: 404 })
    }

    if (pathname === DOWNLOAD_PATH) {
      return Response.redirect(`${YIRU_GITHUB_RELEASES_URL}/latest`, TEMPORARY_REDIRECT)
    }

    if (isDocumentationPath(pathname)) {
      return Response.redirect(YIRU_GITHUB_REPOSITORY_URL, TEMPORARY_REDIRECT)
    }

    return env.ASSETS.fetch(request)
  }
}

function withProductSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response)
  for (const [name, value] of Object.entries(PRODUCT_SECURITY_HEADERS)) {
    secured.headers.set(name, value)
  }
  return secured
}
