import { parseExecutionHostId } from '../../shared/execution-host'
import type { Store } from '../persistence'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { SpoolHostAdapter } from './spool-execution-gateway'
import { SpoolFileOperationExecutor } from './spool-file-operation-executor'
import { SpoolGitCommitReferences } from './spool-git-commit-references'
import { SpoolGitOperationExecutor } from './spool-git-operation-executor'
import { SpoolGitReadProfile } from './spool-git-read-profile'
import { OrcaSpoolHostFiles } from './spool-orca-host-files'
import { OrcaSpoolHostGit } from './spool-orca-host-git'
import { OrcaSpoolHostChecks } from './spool-orca-host-checks'
import { OrcaSpoolHostTerminal } from './spool-orca-host-terminal'
import { OrcaSpoolHostTerminalLaunch } from './spool-orca-host-terminal-launch'
import { OrcaSpoolHostSessions } from './spool-orca-host-sessions'
import { OrcaSpoolExecutionHostSessionReader } from './spool-orca-session-reader'
import { OrcaSpoolSshSessionReader } from './spool-orca-ssh-session-reader'
import { SpoolOwnerSessionRecords } from './spool-owner-session-records'
import { SpoolTerminalSessionBindings } from './spool-terminal-session-bindings'
import type { SpoolExecutionHostSessionReader } from './spool-session-source'
import { SpoolStructuredHostAdapter } from './spool-structured-host-adapter'
import type { SpoolPublicWorktreeInstance } from './spool-worktree-publication-state'
import { SpoolWorktreeContainment } from './spool-worktree-containment'

export type OrcaSpoolHostAdapterOptions = {
  store: Store
  runtime: OrcaRuntimeService
  pairedRuntimeAdapter?: SpoolHostAdapter
  pairedRuntimeSessionReader?: SpoolExecutionHostSessionReader
  sshSessionReader?: SpoolExecutionHostSessionReader
}

export type OrcaSpoolHostAdapterBundle = {
  adapter: SpoolStructuredHostAdapter
  terminal: OrcaSpoolHostTerminal
  sessionRecords: SpoolOwnerSessionRecords
  terminalSessionBindings: SpoolTerminalSessionBindings
  sessionReader: OrcaSpoolExecutionHostSessionReader
  resolveAdapter(target: SpoolPublicWorktreeInstance): SpoolHostAdapter | null
}

/** Builds the owner adapter without opening SSH or paired-runtime connections. */
export function createOrcaSpoolHostAdapter(
  options: OrcaSpoolHostAdapterOptions
): OrcaSpoolHostAdapterBundle {
  const files = new OrcaSpoolHostFiles(options.store)
  const git = new OrcaSpoolHostGit(options.store, options.runtime)
  const checks = new OrcaSpoolHostChecks(options.store, options.runtime)
  const sessionRecords = new SpoolOwnerSessionRecords()
  const terminalSessionBindings = new SpoolTerminalSessionBindings()
  const terminal = new OrcaSpoolHostTerminal(
    options.runtime,
    new OrcaSpoolHostTerminalLaunch(options.runtime, options.store, terminalSessionBindings)
  )
  const adapter = new SpoolStructuredHostAdapter(
    new SpoolFileOperationExecutor(new SpoolWorktreeContainment(files), files),
    new SpoolGitOperationExecutor(
      new SpoolGitReadProfile(git, new SpoolGitCommitReferences()),
      git
    ),
    checks,
    terminal,
    new OrcaSpoolHostSessions(options.runtime, sessionRecords, terminalSessionBindings)
  )
  const sessionReader = new OrcaSpoolExecutionHostSessionReader(
    options.runtime,
    options.pairedRuntimeSessionReader,
    options.sshSessionReader ?? new OrcaSpoolSshSessionReader()
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
