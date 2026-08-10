import type { DriverState, YiruRuntimeService } from '~main/runtime/yiru-runtime'
import {
  TERMINAL_INPUT_MAX_BYTES,
  TERMINAL_INPUT_TOO_LARGE_ERROR,
  isTerminalInputTooLargeWithYield
} from '~shared/terminal/input'

import { InvalidArgumentError } from '../core'
import type { TerminalViewportClient } from './terminal-viewport-control'

export function isTerminalInputLockedForClient(
  runtime: YiruRuntimeService,
  ptyId: string,
  client: TerminalViewportClient | undefined
): boolean {
  if (client?.type === 'mobile') {
    return false
  }
  // Why: old mobile callers lack metadata, while controlled desktop callers identify themselves.
  if (!client) {
    return false
  }
  return runtime.getDriver(ptyId).kind === 'mobile'
}

export async function assertTerminalSendTextWithinLimit(text: string | undefined): Promise<void> {
  if (!text) {
    return
  }
  if (await isTerminalInputTooLargeWithYield(text, TERMINAL_INPUT_MAX_BYTES)) {
    throw new InvalidArgumentError(TERMINAL_INPUT_TOO_LARGE_ERROR)
  }
}

export function resolveMobileFloorClientId(
  driver: DriverState | null,
  client: TerminalViewportClient | undefined
): string | null {
  if (client?.type === 'mobile') {
    return client.id
  }
  if (!client && driver?.kind === 'mobile') {
    return driver.clientId
  }
  return null
}

type MobileInputFloorClaimHolder = {
  current: ReturnType<YiruRuntimeService['beginMobileInputFloor']>
}

async function commitMobileInputFloorClaim(claim: MobileInputFloorClaimHolder): Promise<void> {
  const current = claim.current
  if (!current) {
    return
  }
  try {
    await current.commit()
  } finally {
    if (claim.current === current) {
      claim.current = null
    }
  }
}

export async function sendTerminalStreamInput(
  runtime: YiruRuntimeService,
  args: {
    terminal: string
    text: string
    client: TerminalViewportClient | undefined
    isMobile: boolean
  }
): Promise<void> {
  const action = { text: args.text, enter: false, interrupt: false }
  const clientId = args.isMobile ? args.client?.id : undefined
  const floorClaim: MobileInputFloorClaimHolder = { current: null }
  try {
    if (!clientId) {
      await runtime.sendTerminal(args.terminal, action)
      return
    }
    const result = await runtime.sendTerminal(args.terminal, action, {
      reserveWrite: (writePtyId) => {
        const claim = runtime.beginMobileInputFloor(writePtyId, clientId)
        if (!claim) {
          throw new Error('mobile_input_floor_unavailable')
        }
        floorClaim.current = claim
      },
      afterWrite: () => commitMobileInputFloorClaim(floorClaim)
    })
    if (!result.accepted) {
      floorClaim.current?.rollback()
    }
  } catch {
    floorClaim.current?.rollback()
  }
}

export function createMobileInputFloorClaimHolder(): MobileInputFloorClaimHolder {
  return { current: null }
}

export async function commitMobileInputFloor(claim: MobileInputFloorClaimHolder): Promise<void> {
  await commitMobileInputFloorClaim(claim)
}

export function rollbackMobileInputFloor(claim: MobileInputFloorClaimHolder): void {
  claim.current?.rollback()
}

export function reserveMobileInputFloor(
  runtime: YiruRuntimeService,
  claim: MobileInputFloorClaimHolder,
  ptyId: string,
  clientId: string
): void {
  const reservation = runtime.beginMobileInputFloor(ptyId, clientId)
  if (!reservation) {
    throw new Error('mobile_input_floor_unavailable')
  }
  claim.current = reservation
}

export function getTerminalSendGuardRefusedReason(
  error: unknown
): 'no-agent' | 'permission' | undefined {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('terminal_guard_permission')) {
    return 'permission'
  }
  if (message.includes('terminal_guard_no_agent')) {
    return 'no-agent'
  }
  return undefined
}

export function isTerminalSendGuardNotWritable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('terminal_guard_not_writable')
}

export function isTerminalAgentStatusNotWritable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return [
    'terminal_not_writable',
    'terminal_handle_stale',
    'terminal_gone',
    'terminal_exited'
  ].some((code) => message.includes(code))
}

export function assertTerminalSendExactPtyBinding(
  runtime: YiruRuntimeService,
  handle: string,
  expectedPtyId: string | undefined
): void {
  try {
    if (expectedPtyId && runtime.resolveLiveLeafForHandle(handle)?.ptyId === expectedPtyId) {
      return
    }
  } catch {
    // Fall through to the stable guarded-send result below.
  }
  throw new Error('terminal_guard_not_writable')
}
