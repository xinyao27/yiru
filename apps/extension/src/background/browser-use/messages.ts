import { executeBrowserCommand } from './command'

export function handleBrowserUseMessage(
  message: object,
  respond: (response: unknown) => void
): boolean | null {
  if (Reflect.get(message, 'type') !== 'browser-command') {
    return null
  }
  const method = Reflect.get(message, 'method')
  if (typeof method !== 'string' || !method.startsWith('browser.')) {
    respond({ error: 'browser_command_method_invalid', ok: false })
    return false
  }
  void executeBrowserCommand(method, Reflect.get(message, 'input')).then(
    (result) => respond({ ok: true, result }),
    (error: unknown) =>
      respond({ error: error instanceof Error ? error.message : String(error), ok: false })
  )
  return true
}
