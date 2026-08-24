import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { getTerminalHandle } from '../selectors'

type HandlerClient = Parameters<CommandHandler>[0]['client']

export async function resolveOrchestrationTerminalHandle(
  flags: Map<string, string | boolean>,
  cwd: string,
  client: HandlerClient,
  flagName: 'from' | 'terminal',
  options: { validateEnvHandle?: boolean } = {}
): Promise<string> {
  const explicit = getOptionalStringFlag(flags, flagName)
  if (explicit) {
    return explicit
  }
  const environmentHandle = process.env.YIRU_TERMINAL_HANDLE
  if (environmentHandle) {
    if (flagName === 'from' && options.validateEnvHandle) {
      const live = await isLiveTerminalHandle(environmentHandle, client)
      if (!live) {
        const reminted = await resolvePaneTerminalHandle(client)
        if (reminted) {
          return reminted
        }
        throwNoActiveSenderTerminal()
      }
    }
    return environmentHandle
  }
  return flagName === 'from'
    ? resolveImplicitSender(flags, cwd, client)
    : getTerminalHandle(flags, cwd, client)
}

export function resolveCoordinatorTerminalHandle(
  flags: Map<string, string | boolean>,
  cwd: string,
  client: HandlerClient
): Promise<string> {
  return resolveOrchestrationTerminalHandle(flags, cwd, client, 'from', {
    validateEnvHandle: true
  })
}

export function throwNoActiveSenderTerminal(): never {
  throw new RuntimeClientError(
    'no_active_sender_terminal',
    'Could not determine the sender terminal for this orchestration command. ' +
      'Pass --from <terminal-handle> or run the command inside a live Yiru terminal with YIRU_TERMINAL_HANDLE set.'
  )
}

async function isLiveTerminalHandle(handle: string, client: HandlerClient): Promise<boolean> {
  try {
    await client.call(client.rpc.terminal.show, { terminal: handle })
    return true
  } catch (error) {
    if (isStaleTerminalIdentityError(error)) {
      return false
    }
    throw error
  }
}

async function resolvePaneTerminalHandle(client: HandlerClient): Promise<string | undefined> {
  const paneKey = process.env.YIRU_PANE_KEY
  if (!paneKey) {
    return undefined
  }
  try {
    const response = await client.call(client.rpc.terminal.resolvePane, { paneKey })
    return response.result.terminal.handle
  } catch (error) {
    if (isPaneRemintUnavailableError(error)) {
      return undefined
    }
    throw error
  }
}

async function resolveImplicitSender(
  flags: Map<string, string | boolean>,
  cwd: string,
  client: HandlerClient
): Promise<string> {
  try {
    return await getTerminalHandle(flags, cwd, client)
  } catch (error) {
    if (getClientErrorCode(error) !== 'no_active_terminal') {
      throw error
    }
    throwNoActiveSenderTerminal()
  }
}

function isStaleTerminalIdentityError(error: unknown): boolean {
  const code = getClientErrorCode(error)
  return code === 'terminal_handle_stale' || code === 'terminal_gone'
}

function isPaneRemintUnavailableError(error: unknown): boolean {
  const code = getClientErrorCode(error)
  const message = getClientErrorMessage(error)
  return (
    code === 'terminal_not_found' ||
    code === 'terminal_handle_stale' ||
    code === 'terminal_gone' ||
    message === 'terminal_not_found' ||
    message === 'terminal_handle_stale' ||
    message === 'terminal_gone'
  )
}

function getClientErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function getClientErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message
  }
  if (!error || typeof error !== 'object') {
    return undefined
  }
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' ? message : undefined
}
