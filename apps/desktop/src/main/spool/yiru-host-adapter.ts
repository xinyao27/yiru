import { parseExecutionHostId } from '@yiru/workbench-model/workspace'

import type { Store } from '../persistence'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import type { SpoolHostAdapter } from './execution-gateway'
import { SpoolFileOperationExecutor } from './file-operation-executor'
import { SpoolGitCommitReferences } from './git-commit-references'
import { SpoolGitOperationExecutor } from './git-operation-executor'
import { SpoolGitReadProfile } from './git-read-profile'
import { SpoolOwnerSessionRecords } from './owner-session-records'
import type { SpoolExecutionHostSessionReader } from './session-source'
import { SpoolStructuredHostAdapter } from './structured-host-adapter'
import { SpoolTerminalSessionBindings } from './terminal-session-bindings'
import { SpoolWorktreeContainment } from './worktree-containment'
import type { SpoolPublicWorktreeInstance } from './worktree-publication-state'
import { YiruSpoolHostChecks } from './yiru-host-checks'
import { YiruSpoolHostFiles } from './yiru-host-files'
import { YiruSpoolHostGit } from './yiru-host-git'
import { YiruSpoolHostSessions } from './yiru-host-sessions'
import { YiruSpoolHostTerminal } from './yiru-host-terminal'
import { YiruSpoolHostTerminalLaunch } from './yiru-host-terminal-launch'
import { YiruSpoolExecutionHostSessionReader } from './yiru-session-reader'
import { YiruSpoolSshSessionReader } from './yiru-ssh-session-reader'

export type YiruSpoolHostAdapterOptions = {
  store: Store
  runtime: YiruRuntimeService
  pairedRuntimeAdapter?: SpoolHostAdapter
  pairedRuntimeSessionReader?: SpoolExecutionHostSessionReader
  sshSessionReader?: SpoolExecutionHostSessionReader
}

export type YiruSpoolHostAdapterBundle = {
  adapter: SpoolStructuredHostAdapter
  terminal: YiruSpoolHostTerminal
  sessionRecords: SpoolOwnerSessionRecords
  terminalSessionBindings: SpoolTerminalSessionBindings
  sessionReader: YiruSpoolExecutionHostSessionReader
  resolveAdapter(target: SpoolPublicWorktreeInstance): SpoolHostAdapter | null
}

/** Builds the owner adapter without opening SSH or paired-runtime connections. */
export function createYiruSpoolHostAdapter(
  options: YiruSpoolHostAdapterOptions
): YiruSpoolHostAdapterBundle {
  const files = new YiruSpoolHostFiles(options.store)
  const git = new YiruSpoolHostGit(options.store, options.runtime.gitCommands)
  const checks = new YiruSpoolHostChecks(
    options.store,
    options.runtime,
    options.runtime.gitCommands
  )
  const sessionRecords = new SpoolOwnerSessionRecords()
  const terminalSessionBindings = new SpoolTerminalSessionBindings()
  const terminal = new YiruSpoolHostTerminal(
    options.runtime,
    new YiruSpoolHostTerminalLaunch(options.runtime, options.store, terminalSessionBindings)
  )
  const adapter = new SpoolStructuredHostAdapter(
    new SpoolFileOperationExecutor(new SpoolWorktreeContainment(files), files),
    new SpoolGitOperationExecutor(
      new SpoolGitReadProfile(git, new SpoolGitCommitReferences()),
      git
    ),
    checks,
    terminal,
    new YiruSpoolHostSessions(options.runtime, sessionRecords, terminalSessionBindings)
  )
  const sessionReader = new YiruSpoolExecutionHostSessionReader(
    options.runtime,
    options.pairedRuntimeSessionReader,
    options.sshSessionReader ?? new YiruSpoolSshSessionReader()
  )
  return {
    adapter,
    terminal,
    sessionRecords,
    terminalSessionBindings,
    sessionReader,
    resolveAdapter: (target) => {
      const host = parseExecutionHostId(target.ownerWorktree.executionHostId)
      if (!host) {
        return null
      }
      if (host.kind === 'runtime') {
        return options.pairedRuntimeAdapter ?? null
      }
      return adapter
    }
  }
}
