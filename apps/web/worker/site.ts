import { YIRU_GITHUB_RELEASES_URL, YIRU_GITHUB_REPOSITORY_URL } from '@yiru/workbench-model/product'

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

type SiteEnv = {
  ASSETS: Fetcher
}

function isDocumentationPath(pathname: string): boolean {
  return (
    DOCUMENTATION_PATHS.has(pathname) ||
    pathname === DOCUMENTATION_PREFIX ||
    pathname.startsWith(`${DOCUMENTATION_PREFIX}/`)
  )
}

export default {
  fetch(request: Request, env: SiteEnv): Response | Promise<Response> {
    const url = new URL(request.url)
    if (REDIRECTED_HOSTNAMES.has(url.hostname)) {
      url.hostname = CANONICAL_HOSTNAME
      return Response.redirect(url.toString(), 301)
    }

    // Why: /download and /download/ have to land in the same place; a trailing
    // slash is what a stray copy-paste adds. Root keeps its own slash.
    const pathname = url.pathname === '/' ? url.pathname : url.pathname.replace(/\/+$/, '')

    if (pathname === DOWNLOAD_PATH) {
      return Response.redirect(`${YIRU_GITHUB_RELEASES_URL}/latest`, TEMPORARY_REDIRECT)
    }

    if (isDocumentationPath(pathname)) {
      return Response.redirect(YIRU_GITHUB_REPOSITORY_URL, TEMPORARY_REDIRECT)
    }

    return env.ASSETS.fetch(request)
  }
}
