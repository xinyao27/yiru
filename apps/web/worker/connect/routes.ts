import {
  CreateConnectGrantRequestSchema,
  WEB_CONNECT_GRANT_TTL_MS,
  WEB_CONNECT_PROTOCOL_VERSION
} from '@yiru/runtime-protocol/web-connect'

import { randomBase64Url, sha256Base64Url } from './encoding'
import type { WebWorkerEnvironment } from './environment'
import { apiError, jsonResponse } from './responses'

const CONNECT_API_PREFIX = '/api/connect/grants'

export async function handleConnectApi(
  request: Request,
  env: WebWorkerEnvironment
): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname === CONNECT_API_PREFIX) {
    return request.method === 'POST'
      ? await createGrant(request, env)
      : apiError('method_not_allowed', 405)
  }
  const machineMatch = /^\/api\/connect\/machines\/([A-Za-z0-9_-]+)\/(ticket|socket)$/.exec(
    url.pathname
  )
  if (machineMatch) {
    if (machineMatch[2] === 'socket') {
      const socketLimit = await env.CONNECT_NETWORK_RATE_LIMIT.limit({
        key: request.headers.get('CF-Connecting-IP') ?? 'unknown-network'
      })
      if (!socketLimit.success) {
        return apiError('rate_limited', 429)
      }
    }
    const objectId = env.CONNECT_MACHINES.idFromName(`machine:${machineMatch[1]}`)
    return await env.CONNECT_MACHINES.get(objectId).fetch(request)
  }
  const revokeMatch =
    /^\/api\/connect\/machines\/([A-Za-z0-9_-]+)\/access\/([A-Za-z0-9_-]+)\/revoke$/.exec(
      url.pathname
    )
  if (revokeMatch) {
    const objectId = env.CONNECT_MACHINES.idFromName(`machine:${revokeMatch[1]}`)
    return await env.CONNECT_MACHINES.get(objectId).fetch(request)
  }
  const match = /^\/api\/connect\/grants\/([A-Za-z0-9_-]+)(?:\/(exchange|confirm|status))?$/.exec(
    url.pathname
  )
  if (!match) {
    return url.pathname.startsWith(`${CONNECT_API_PREFIX}/`) ? apiError('not_found', 404) : null
  }
  const grantId = match[1]
  const objectId = env.CONNECT_GRANTS.idFromName(`grant:${grantId}`)
  return await env.CONNECT_GRANTS.get(objectId).fetch(request)
}

async function createGrant(request: Request, env: WebWorkerEnvironment): Promise<Response> {
  const parsed = CreateConnectGrantRequestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return apiError('invalid_request', 400)
  }
  const browserLimit = await env.CONNECT_BROWSER_RATE_LIMIT.limit({
    key: `${parsed.data.browser.signingKey.x}.${parsed.data.browser.signingKey.y}`
  })
  const networkLimit = await env.CONNECT_NETWORK_RATE_LIMIT.limit({
    key: request.headers.get('CF-Connecting-IP') ?? 'unknown-network'
  })
  if (!browserLimit.success || !networkLimit.success) {
    return apiError('rate_limited', 429)
  }
  const grantId = randomBase64Url(18)
  const secret = randomBase64Url(32)
  const expiresAt = Date.now() + WEB_CONNECT_GRANT_TTL_MS
  const objectId = env.CONNECT_GRANTS.idFromName(`grant:${grantId}`)
  const createRequest = new Request(`https://connect.internal/grants/${grantId}/internal/create`, {
    method: 'PUT',
    body: JSON.stringify({
      browser: parsed.data.browser,
      secretHash: await sha256Base64Url(secret),
      expiresAt
    })
  })
  const created = await env.CONNECT_GRANTS.get(objectId).fetch(createRequest)
  if (!created.ok) {
    return apiError('grant_creation_failed', 500)
  }
  return jsonResponse({
    version: WEB_CONNECT_PROTOCOL_VERSION,
    grant: `yrp_${grantId}.${secret}`,
    grantId,
    expiresAt
  })
}
