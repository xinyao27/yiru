import { getProviderToken } from './provider-token'
import type { PushRequest } from './request'

const APNS_HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com'
} as const

export type PushResult = {
  accepted: boolean
  apnsId: string | null
  reason: string | null
  retryable: boolean
  status: number
}

export async function sendToApns(input: PushRequest, env: Env): Promise<PushResult> {
  const token = await getProviderToken(env)
  const response = await fetch(`${APNS_HOSTS[input.environment]}/3/device/${input.deviceToken}`, {
    body: JSON.stringify({
      aps: {
        alert: {
          'loc-key': 'Open Yiru to view the update.',
          'title-loc-key': 'Yiru'
        },
        'mutable-content': 1,
        sound: 'default'
      },
      yiru: {
        ciphertext: input.ciphertext,
        keyId: input.keyId,
        nonce: input.nonce,
        v: 1
      }
    }),
    headers: {
      authorization: `bearer ${token}`,
      'apns-collapse-id': input.collapseId,
      'apns-expiration': '0',
      'apns-priority': '10',
      'apns-push-type': 'alert',
      'apns-topic': env.APNS_TOPIC,
      'content-type': 'application/json'
    },
    method: 'POST'
  })
  return {
    accepted: response.ok,
    apnsId: response.headers.get('apns-id'),
    reason: response.ok ? null : await readApnsReason(response),
    retryable: response.status === 429 || response.status >= 500,
    status: response.status
  }
}

async function readApnsReason(response: Response): Promise<string> {
  try {
    const value: unknown = await response.json()
    if (typeof value === 'object' && value !== null) {
      const reason = Reflect.get(value, 'reason')
      if (typeof reason === 'string' && reason.length <= 100) {
        return reason
      }
    }
  } catch {}
  return 'unknown_apns_error'
}
