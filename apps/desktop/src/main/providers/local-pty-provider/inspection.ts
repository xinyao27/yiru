import { existsSync } from 'node:fs'
import { basename } from 'node:path'

import { resolveGitBashPath } from '~main/git-bash'
import { isWslAvailable } from '~main/wsl'

import { resolveAgentForegroundProcessWithAvailability } from '../agent-foreground-process'
import type { PtyProcessInfo } from '../types'
import { readWindowsConptyProcessIds } from '../windows-conpty-process-membership'
import { LocalPtyProviderShutdown } from './shutdown'
import type { DataCallback } from './state'
import {
  ptyProcesses,
  ptyShellName,
  ptyAgentForegroundContextPaths,
  ptyTerminalHandle,
  ptyInitialCwd,
  dataListeners,
  resolveForegroundFallbackProcess
} from './state'

export abstract class LocalPtyProviderInspection extends LocalPtyProviderShutdown {
  async clearBuffer(id: string): Promise<void> {
    // Why: xterm.js clear() only resets the renderer. ConPTY keeps its own
    // screen buffer, so without this its stale cursor row makes the next
    // prompt repaint land below a blank gap. No-op on POSIX.
    //
    // Unlike the daemon session, no PSReadLine form-feed nudge here: it is
    // only safe at an empty prompt, and without a headless emulator this
    // provider cannot tell whether input is pending.
    try {
      ptyProcesses.get(id)?.clear()
    } catch {
      /* PTY may have just exited */
    }
  }
  acknowledgeDataEvent(_id: string, _charCount: number): void {
    /* no flow control for local */
  }

  async hasChildProcesses(id: string): Promise<boolean> {
    const proc = ptyProcesses.get(id)
    if (!proc) {
      return false
    }
    try {
      const foreground = proc.process
      const shell = ptyShellName.get(id)
      if (!shell) {
        return true
      }
      return foreground !== shell
    } catch {
      return false
    }
  }

  async getForegroundProcess(id: string): Promise<string | null> {
    const proc = ptyProcesses.get(id)
    if (!proc) {
      return null
    }
    try {
      const resolution = await resolveAgentForegroundProcessWithAvailability(
        proc.pid,
        resolveForegroundFallbackProcess(proc.process || null, ptyShellName.get(id)),
        {
          contextPaths: ptyAgentForegroundContextPaths.get(id)
        }
      )
      return resolution.processName
    } catch {
      return null
    }
  }

  async confirmForegroundProcess(id: string): Promise<string | null> {
    const proc = ptyProcesses.get(id)
    if (!proc) {
      return null
    }
    try {
      const resolution = await resolveAgentForegroundProcessWithAvailability(
        proc.pid,
        resolveForegroundFallbackProcess(proc.process || null, ptyShellName.get(id)),
        {
          contextPaths: ptyAgentForegroundContextPaths.get(id),
          fresh: true,
          ...(process.platform === 'win32'
            ? {
                forceProcessScan: true,
                readWindowsConptyProcessIds: () => readWindowsConptyProcessIds(proc.pid)
              }
            : {})
        }
      )
      // Why: a fresh scan can outlive this PTY id; never publish identity from
      // an exited process or a replacement session that reused the same id.
      if (ptyProcesses.get(id) !== proc) {
        return null
      }
      return resolution.available ? resolution.processName : null
    } catch {
      return null
    }
  }

  async serialize(_ids: string[]): Promise<string> {
    return '{}'
  }
  async revive(_state: string): Promise<void> {
    /* re-spawning handles local revival */
  }

  async listProcesses(): Promise<PtyProcessInfo[]> {
    return Array.from(ptyProcesses.entries()).map(([id, proc]) => ({
      id,
      cwd: ptyInitialCwd.get(id) ?? '',
      title: proc.process || ptyShellName.get(id) || 'shell',
      ...(ptyTerminalHandle.get(id) ? { terminalHandle: ptyTerminalHandle.get(id) } : {})
    }))
  }

  async getDefaultShell(): Promise<string> {
    if (process.platform === 'win32') {
      return this.opts.getWindowsShell?.() || process.env.COMSPEC || 'powershell.exe'
    }
    return process.env.SHELL || '/bin/zsh'
  }

  async getProfiles(): Promise<{ name: string; path: string }[]> {
    if (process.platform === 'win32') {
      const profiles: { name: string; path: string }[] = [
        { name: 'PowerShell', path: 'powershell.exe' },
        { name: 'Command Prompt', path: 'cmd.exe' }
      ]
      const gitBashPath = resolveGitBashPath()
      if (gitBashPath) {
        profiles.push({ name: 'Git Bash', path: gitBashPath })
      }
      if (isWslAvailable()) {
        profiles.push({ name: 'WSL', path: 'wsl.exe' })
      }
      return profiles
    }
    const shells = ['/bin/zsh', '/bin/bash', '/bin/sh']
    return shells.filter((s) => existsSync(s)).map((s) => ({ name: basename(s), path: s }))
  }

  onData(callback: DataCallback): () => void {
    dataListeners.add(callback)
    return () => dataListeners.delete(callback)
  }
}
