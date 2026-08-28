import { requireSuccessfulResponse } from './messages'

export async function executeDaemonBrowserCommand(
  method: string,
  input: unknown
): Promise<unknown> {
  const response: unknown = await chrome.runtime.sendMessage({
    input,
    method,
    type: 'browser-command'
  })
  requireSuccessfulResponse(response)
  return typeof response === 'object' && response !== null
    ? Reflect.get(response, 'result')
    : undefined
}
