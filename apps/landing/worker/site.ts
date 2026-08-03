// Why: the site is static, but the apex and www hostnames both resolve to this
// Worker. Serving identical bytes from two hostnames splits SEO signals, so www
// is redirected here rather than in a dashboard-only rule that is invisible to
// this repository.
const CANONICAL_HOSTNAME = 'yiru.ai'
const REDIRECTED_HOSTNAMES = new Set([`www.${CANONICAL_HOSTNAME}`])

type SiteEnv = {
  ASSETS: Fetcher
}

export default {
  fetch(request: Request, env: SiteEnv): Response | Promise<Response> {
    const url = new URL(request.url)
    if (REDIRECTED_HOSTNAMES.has(url.hostname)) {
      url.hostname = CANONICAL_HOSTNAME
      return Response.redirect(url.toString(), 301)
    }

    return env.ASSETS.fetch(request)
  }
}
