import { existsSync, accessSync, chmodSync, constants } from 'node:fs'
import { platform, arch } from 'node:os'
import { join } from 'node:path'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import type { BrowserMouseModifier } from './agent-browser-bridge-input'

export function agentBrowserNativeName(): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return `agent-browser-${platform()}-${arch()}${ext}`
}

export function resolveAgentBrowserBinary(): string {
  const pathsProvider = getRuntimeHostPathsProvider()
  // Why: production builds copy the platform-specific binary into resources/
  // via electron-builder extraResources. Use the host's resolved resources path
  // instead of hand-rolling ../resources so packaged macOS builds keep working
  // on case-sensitive filesystems where Contents/Resources casing matters.
  const bundledResourcesPath =
    pathsProvider.resourcesPath() ??
    (process.platform === 'darwin'
      ? join(pathsProvider.executablePath(), '..', '..', 'Resources')
      : join(pathsProvider.executablePath(), '..', 'resources'))
  const bundled = join(bundledResourcesPath, agentBrowserNativeName())
  if (existsSync(bundled)) {
    return bundled
  }

  // Why: in dev mode, resolve directly to the native binary inside node_modules.
  // Use the host app path for a stable project root — __dirname is unreliable after
  // electron-vite bundles main process code into out/main/index.js.
  const nmBin = join(
    pathsProvider.appPath(),
    'node_modules',
    'agent-browser',
    'bin',
    agentBrowserNativeName()
  )
  if (existsSync(nmBin)) {
    if (process.platform !== 'win32') {
      try {
        accessSync(nmBin, constants.X_OK)
      } catch {
        chmodSync(nmBin, 0o755)
      }
    }
    return nmBin
  }

  // Last resort: assume it's on PATH
  return 'agent-browser'
}

// Why: exec commands arrive as a single string (e.g. 'keyboard inserttext "hello world"').
// Naive split on whitespace breaks quoted arguments. This parser respects double and
// single quotes so the value arrives as a single argument without surrounding quotes.
export function parseShellArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let inDouble = false
  let inSingle = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
    } else if (ch === "'" && !inDouble) {
      inSingle = !inSingle
    } else if (ch === ' ' && !inDouble && !inSingle) {
      if (current) {
        args.push(current)
        current = ''
      }
    } else {
      current += ch
    }
  }
  if (current) {
    args.push(current)
  }
  return args
}

export function stripAgentBrowserTargetArgs(args: string[]): string[] {
  const stripped: string[] = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--cdp' || arg === '--session') {
      index++
      continue
    }
    if (arg.startsWith('--cdp=') || arg.startsWith('--session=')) {
      continue
    }
    stripped.push(arg)
  }
  return stripped
}

// Why: agent-browser returns generic error messages for stale/unknown refs.
// Map them to a specific code so agents can reliably detect and re-snapshot.
export function classifyErrorCode(message: string): string {
  if (/unknown ref|ref not found|element not found: @e/i.test(message)) {
    return 'browser_stale_ref'
  }
  return 'browser_error'
}

export function isTabClosedTransportError(message: string): boolean {
  return /session destroyed while command|session destroyed while commands|connection refused|cdp discovery methods failed|websocket connect failed/i.test(
    message
  )
}

export function pageUnavailableMessageForSession(sessionName: string): string {
  const prefix = 'yiru-tab-'
  const browserPageId = sessionName.startsWith(prefix) ? sessionName.slice(prefix.length) : null
  return browserPageId
    ? `Browser page ${browserPageId} is no longer available`
    : 'Browser tab is no longer available'
}

export type CdpMouseButton = 'left' | 'middle' | 'right'

export type BrowserClickPoint = {
  x: number
  y: number
  adjusted: boolean
  handled: boolean
}

export function normalizeCdpMouseButton(button?: string): CdpMouseButton {
  return button === 'middle' || button === 'right' ? button : 'left'
}

export function cdpMouseButtonMask(button: CdpMouseButton): number {
  if (button === 'right') {
    return 2
  }
  if (button === 'middle') {
    return 4
  }
  return 1
}

export function cdpMouseModifierMask(modifiers: BrowserMouseModifier[] | undefined): number {
  if (!modifiers || modifiers.length === 0) {
    return 0
  }
  let mask = 0
  for (const modifier of modifiers) {
    if (modifier === 'alt') {
      mask |= 1
    } else if (modifier === 'ctrl') {
      mask |= 2
    } else if (modifier === 'cmd') {
      mask |= 4
    } else if (modifier === 'shift') {
      mask |= 8
    }
  }
  return mask
}

export function readClickPoint(value: unknown, fallback: BrowserClickPoint): BrowserClickPoint {
  const point = value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  const x = point?.x
  const y = point?.y
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y)
  ) {
    return fallback
  }
  return { x, y, adjusted: point?.adjusted === true, handled: point?.handled === true }
}

// Why: must exceed agent-browser's internal per-command timeouts (goto defaults to 30s,
// wait can be up to 60s). Using 90s ensures the bridge never kills a command before
