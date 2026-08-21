import { RuntimeClientError } from '~shared/runtime-client-error'

const DEFAULT_CONNECT_ORIGIN = 'https://app.yiru.ai'

// Why: the grant API and the relay socket must always resolve to the same
// origin — a mismatch would pair against one service and stream through another.
export function connectOrigin(): string {
  const configured = process.env.YIRU_CONNECT_ORIGIN ?? DEFAULT_CONNECT_ORIGIN
  const url = new URL(configured)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new RuntimeClientError('invalid_environment', 'YIRU_CONNECT_ORIGIN must use HTTPS.')
  }
  return url.origin
}
