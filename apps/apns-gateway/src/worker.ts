import { sendToApns } from './apns'
import { readPushRequest } from './request'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const requestId = request.headers.get('cf-ray') ?? crypto.randomUUID()
    if (request.method === 'GET' && url.pathname === '/healthz') {
      return Response.json({ status: 'ok' })
    }
    if (request.method !== 'POST' || url.pathname !== '/v1/push') {
      return Response.json({ error: 'not_found' }, { status: 404 })
    }
    if (!(await hasValidAuthorization(request, env.GATEWAY_SHARED_SECRET))) {
      log('warn', { event: 'gateway.auth_rejected', requestId })
      return Response.json({ error: 'unauthorized' }, { status: 401 })
    }
    const input = await readPushRequest(request)
    if (!input || input.environment !== env.APNS_ENVIRONMENT) {
      return Response.json({ error: 'invalid_request' }, { status: 400 })
    }
    try {
      const result = await sendToApns(input, env)
      log(result.accepted ? 'info' : 'warn', {
        apnsId: result.apnsId,
        apnsReason: result.reason,
        apnsStatus: result.status,
        event: result.accepted ? 'apns.accepted' : 'apns.rejected',
        requestId
      })
      return Response.json(
        { accepted: result.accepted, reason: result.reason, retryable: result.retryable },
        { status: result.accepted ? 202 : 502 }
      )
    } catch (error) {
      log('error', {
        error: error instanceof Error ? error.message : 'unknown_error',
        event: 'apns.failed',
        requestId
      })
      return Response.json(
        { accepted: false, reason: 'gateway_failure', retryable: true },
        { status: 502 }
      )
    }
  }
} satisfies ExportedHandler<Env>

async function hasValidAuthorization(request: Request, expected: string): Promise<boolean> {
  const authorization = request.headers.get('authorization') ?? ''
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const encoder = new TextEncoder()
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ])
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash)
}

function log(
  level: 'error' | 'info' | 'warn',
  fields: Record<string, boolean | number | string | null>
): void {
  const message = JSON.stringify(fields)
  switch (level) {
    case 'error':
      console.error(message)
      break
    case 'info':
      console.log(message)
      break
    case 'warn':
      console.warn(message)
      break
  }
}
