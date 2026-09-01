import { isWslUncPath } from '@yiru/runtime-protocol/model/platform'

export type TerminalQueryReplyOwner = 'model' | 'remote-view'

export function resolveTerminalQueryReplyOwner(hasActiveViewer: boolean): TerminalQueryReplyOwner {
  return hasActiveViewer ? 'remote-view' : 'model'
}

/** Main-side mirror of the renderer's isLocalNativeWindowsPty
 *  (windows-pty-compatibility.ts), computed from spawn-time facts: local or
 *  daemon provider (no SSH connection), win32 host, and not a WSL shell. */
export function isNativeWindowsLocalPtySpawn(opts: {
  connectionId: string | null | undefined
  cwd: string | null | undefined
  shellOverride: string | null | undefined
  platform?: NodeJS.Platform
}): boolean {
  if ((opts.platform ?? process.platform) !== 'win32') {
    return false
  }
  if (opts.connectionId) {
    return false
  }
  if (isWslUncPath(opts.cwd ?? '')) {
    return false
  }
  if (/(?:^|[/\\])wsl(?:\.exe)?$/i.test(opts.shellOverride ?? '')) {
    return false
  }
  return true
}

// Why module state: the provider records the determination at spawn, and the
// runtime consults it at emulator creation.
// Daemon-adopted PTYs from a previous app run carry no mark — acceptable:
// ConPTY's blocking DA1 only fires at spawn, which happened in a prior life.
const nativeWindowsConptyPtys = new Set<string>()

// Why installers: the mark lands after the awaited spawn response, but daemon
// stream data (warm-reattach flush) can lazy-create the runtime emulator
// first. The runtime registers an installer so marking retrofits the DA1
// override onto an existing emulator; installation is idempotent emulator-side.
type ConptyDa1OverrideInstaller = (ptyId: string) => void
const conptyDa1OverrideInstallers = new Set<ConptyDa1OverrideInstaller>()

export function registerConptyDa1OverrideInstaller(installer: ConptyDa1OverrideInstaller): void {
  conptyDa1OverrideInstallers.add(installer)
}

export function markNativeWindowsConptyPty(id: string): void {
  nativeWindowsConptyPtys.add(id)
  for (const installer of conptyDa1OverrideInstallers) {
    installer(id)
  }
}

export function isNativeWindowsConptyPty(id: string): boolean {
  return nativeWindowsConptyPtys.has(id)
}

/** Wired into clearProviderPtyState so every PTY teardown path releases the
 *  spawn record. */
export function clearNativeWindowsConptyPty(id: string): void {
  nativeWindowsConptyPtys.delete(id)
}
