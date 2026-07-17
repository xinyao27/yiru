import { parseExecutionHostId } from '../../shared/execution-host'
import type { Store } from '../persistence'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import type { SpoolHostAdapter } from './spool-execution-gateway'
import { SpoolFileOperationExecutor } from './spool-file-operation-executor'
import { SpoolGitCommitReferences } from './spool-git-commit-references'
import { SpoolGitOperationExecutor } from './spool-git-operation-executor'
import { SpoolGitReadProfile } from './spool-git-read-profile'
import { YiruSpoolHostFiles } from './spool-yiru-host-files'
import { YiruSpoolHostGit } from './spool-yiru-host-git'
import { YiruSpoolHostChecks } from './spool-yiru-host-checks'
import { YiruSpoolHostTerminal } from './spool-yiru-host-terminal'
import { YiruSpoolHostTerminalLaunch } from './spool-yiru-host-terminal-launch'
import { YiruSpoolHostSessions } from './spool-yiru-host-sessions'
import { YiruSpoolExecutionHostSessionReader } from './spool-yiru-session-reader'
import { YiruSpoolSshSessionReader } from './spool-yiru-ssh-session-reader'
import { SpoolOwnerSessionRecords } from './spool-owner-session-records'
import { SpoolTerminalSessionBindings } from './spool-terminal-session-bindings'
import type { SpoolExecutionHostSessionReader } from './spool-session-source'
import { SpoolStructuredHostAdapter } from './spool-structured-host-adapter'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'
import { SpoolWorktreeContainment } from './spool-worktree-containment'

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
  const git = new YiruSpoolHostGit(options.store, options.runtime)
  const checks = new YiruSpoolHostChecks(options.store, options.runtime)
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
