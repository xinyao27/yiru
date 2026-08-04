import { parseExecutionHostId } from '@yiru/workbench-model/workspace'
import type { Store } from '~main/persistence'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

import type { CoworkingHostAdapter } from '../execution-gateway'
import { CoworkingFileOperationExecutor } from '../file-operation-executor'
import { CoworkingGitCommitReferences } from '../git-commit-references'
import { CoworkingGitOperationExecutor } from '../git-operation-executor'
import { CoworkingGitReadProfile } from '../git-read-profile'
import { CoworkingOwnerSessionRecords } from '../owner/session-records'
import type { CoworkingExecutionHostSessionReader } from '../session/source'
import { CoworkingStructuredHostAdapter } from '../structured-host-adapter'
import { CoworkingTerminalSessionBindings } from '../terminal-session-bindings'
import { CoworkingWorktreeContainment } from '../worktree-containment'
import type { CoworkingPublicWorktreeInstance } from '../worktree-publication-state'
import { YiruCoworkingExecutionHostSessionReader } from '../yiru-session-reader'
import { YiruCoworkingHostChecks } from './checks'
import { YiruCoworkingHostFiles } from './files'
import { YiruCoworkingHostGit } from './git'
import { YiruCoworkingHostSessions } from './sessions'
import { YiruCoworkingHostTerminal } from './terminal'
import { YiruCoworkingHostTerminalLaunch } from './terminal-launch'

export type YiruCoworkingHostAdapterOptions = {
  store: Store
  runtime: YiruRuntimeService
  pairedRuntimeAdapter?: CoworkingHostAdapter
  pairedRuntimeSessionReader?: CoworkingExecutionHostSessionReader
}

export type YiruCoworkingHostAdapterBundle = {
  adapter: CoworkingStructuredHostAdapter
  terminal: YiruCoworkingHostTerminal
  sessionRecords: CoworkingOwnerSessionRecords
  terminalSessionBindings: CoworkingTerminalSessionBindings
  sessionReader: YiruCoworkingExecutionHostSessionReader
  resolveAdapter(target: CoworkingPublicWorktreeInstance): CoworkingHostAdapter | null
}

/** Builds the owner adapter without opening a paired-runtime connection. */
export function createYiruCoworkingHostAdapter(
  options: YiruCoworkingHostAdapterOptions
): YiruCoworkingHostAdapterBundle {
  const files = new YiruCoworkingHostFiles(options.store)
  const git = new YiruCoworkingHostGit(options.store, options.runtime.gitCommands)
  const checks = new YiruCoworkingHostChecks(
    options.store,
    options.runtime,
    options.runtime.gitCommands
  )
  const sessionRecords = new CoworkingOwnerSessionRecords()
  const terminalSessionBindings = new CoworkingTerminalSessionBindings()
  const terminal = new YiruCoworkingHostTerminal(
    options.runtime,
    new YiruCoworkingHostTerminalLaunch(options.runtime, options.store, terminalSessionBindings)
  )
  const adapter = new CoworkingStructuredHostAdapter(
    new CoworkingFileOperationExecutor(new CoworkingWorktreeContainment(files), files),
    new CoworkingGitOperationExecutor(
      new CoworkingGitReadProfile(git, new CoworkingGitCommitReferences()),
      git
    ),
    checks,
    terminal,
    new YiruCoworkingHostSessions(options.runtime, sessionRecords, terminalSessionBindings)
  )
  const sessionReader = new YiruCoworkingExecutionHostSessionReader(
    options.runtime,
    options.pairedRuntimeSessionReader
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
