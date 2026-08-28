import {
  isNetworkMockActive,
  type NetworkMockMode,
  startNetworkMock,
  stopNetworkMock
} from './network-mock'

type Respond = (response: unknown) => void

export function handleNetworkMockMessage(message: object, respond: Respond): boolean | null {
  const type = Reflect.get(message, 'type')
  if (
    type !== 'network-mock-status' &&
    type !== 'network-mock-start' &&
    type !== 'network-mock-stop'
  ) {
    return null
  }
  const tabId = Reflect.get(message, 'tabId')
  if (typeof tabId !== 'number' || !Number.isInteger(tabId)) {
    respond({ error: 'invalid_tab_id', ok: false })
    return false
  }
  if (type === 'network-mock-status') {
    respond({ isActive: isNetworkMockActive(tabId), ok: true })
    return false
  }
  const task =
    type === 'network-mock-stop'
      ? stopNetworkMock(tabId)
      : startNetworkMock(tabId, parseRule(message))
  void task.then(
    () => respond({ ok: true }),
    (error: unknown) =>
      respond({ error: error instanceof Error ? error.message : String(error), ok: false })
  )
  return true
}

function parseRule(message: object): { mode: NetworkMockMode; urlIncludes: string } {
  const mode = Reflect.get(message, 'mode')
  const urlIncludes = Reflect.get(message, 'urlIncludes')
  if (
    (mode !== 'empty' && mode !== 'error-500' && mode !== 'slow') ||
    typeof urlIncludes !== 'string'
  ) {
    throw new Error('invalid_network_mock_rule')
  }
  return { mode, urlIncludes }
}
