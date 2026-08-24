import type { SleepingAgentLaunchConfig } from '@yiru/workbench-model/agent'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import type {
  RuntimeTerminalRename,
  RuntimeTerminalCreate,
  RuntimeTerminalPresentation,
  RuntimeMobileSessionCreateTerminalResult
} from '~shared/runtime-types'
import type {
  ForceDeleteWorktreeBranchResult,
  GitHubPrStartPoint,
  GitPushTarget,
  Repo,
  RemoveWorktreeResult,
  WorktreeStartupLaunch,
  TuiAgent
} from '~shared/types'

import type { RuntimeStore } from '../model/runtime-store'
import type { TerminalCreateOptions } from '../model/terminal-launch'
import type { TerminalWorkspaceLaunchScope } from '../model/worktree-resolution'
import type { RuntimeWorktreeRemovalTarget } from '../model/worktree-storage'
import { RuntimeContractCreateDefaultTabTerminals } from './runtime-contract-create-default-tab-terminals'

export abstract class RuntimeContractResolveManagedPrBase extends RuntimeContractCreateDefaultTabTerminals {
  abstract resolveManagedPrBase(args: {
    repoSelector: string
    prNumber: number
    headRefName?: string
    baseRefName?: string
    isCrossRepository?: boolean
  }): Promise<GitHubPrStartPoint | { error: string }>

  abstract resolveManagedMrBase(args: {
    repoSelector: string
    executionHostId?: ExecutionHostId
    mrIid: number
    sourceBranch?: string
    targetBranch?: string
    isCrossRepository?: boolean
  }): Promise<
    { baseBranch: string; compareBaseRef?: string; pushTarget?: GitPushTarget } | { error: string }
  >

  protected abstract resolveGitLabProjectRemote(
    repoPath: string,
    preference?: Repo['forgeRemotePreference'],
    localGitOptions?: { wslDistro?: string }
  ): Promise<string>

  protected abstract resolveWorktreeRemovalTarget(
    worktreeSelector: string
  ): Promise<RuntimeWorktreeRemovalTarget>

  protected abstract removeWorktreeMetadataAndHistory(store: RuntimeStore, worktreeId: string): void

  protected abstract closeHeadlessBrowserPagesForWorktree(worktreeId: string): void

  protected abstract rememberPreservedBranchCleanupTarget(
    worktreeId: string,
    result: RemoveWorktreeResult | undefined,
    fallbackHead: string | undefined,
    pushTarget: GitPushTarget | undefined
  ): void

  protected abstract preserveBranchHeadFallback(
    result: RemoveWorktreeResult | undefined,
    fallbackHead: string | undefined
  ): RemoveWorktreeResult

  abstract forceDeletePreservedBranch(
    worktreeSelector: string,
    branchName: string,
    expectedHead: string
  ): Promise<ForceDeleteWorktreeBranchResult>

  abstract getBranchRenameFailureOutputForWorktree(worktreeSelector: string): Promise<string | null>

  abstract removeManagedWorktree(
    worktreeSelector: string,
    force?: boolean,
    runHooks?: boolean
  ): Promise<RemoveWorktreeResult & { warning?: string }>

  abstract renameTerminal(handle: string, title: string | null): Promise<RuntimeTerminalRename>

  protected abstract resolveAgentTerminalCreateOptions(
    workspace: TerminalWorkspaceLaunchScope,
    opts: TerminalCreateOptions
  ): Promise<TerminalCreateOptions>

  abstract createTerminal(
    worktreeSelector?: string,
    opts?: TerminalCreateOptions
  ): Promise<RuntimeTerminalCreate>

  abstract launchAgentTerminal(
    worktreeSelector: string,
    opts: { agent: TuiAgent; prompt: string; title?: string }
  ): Promise<RuntimeTerminalCreate>

  abstract createAgentTerminal(
    worktreeSelector: string,
    opts: {
      agent: TuiAgent
      title?: string
      presentation?: RuntimeTerminalPresentation
      beforeAgentTrust?: () => void | Promise<void>
      beforeSpawn?: () => void | Promise<void>
    }
  ): Promise<RuntimeTerminalCreate>

  abstract createMobileSessionTerminal(
    worktreeSelector: string,
    opts?: {
      afterTabId?: string
      targetGroupId?: string
      command?: string
      cwd?: string
      env?: Record<string, string>
      envToDelete?: string[]
      startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
      agent?: TuiAgent
      agentPrompt?: string
      launchConfig?: SleepingAgentLaunchConfig
      launchAgent?: TuiAgent
      activate?: boolean
      clientMutationId?: string
      signal?: AbortSignal
    }
  ): Promise<RuntimeMobileSessionCreateTerminalResult>

  protected abstract runCreateMobileSessionTerminal(
    worktreeSelector: string,
    opts?: {
      afterTabId?: string
      targetGroupId?: string
      command?: string
      cwd?: string
      env?: Record<string, string>
      envToDelete?: string[]
      startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
      agent?: TuiAgent
      agentPrompt?: string
      launchConfig?: SleepingAgentLaunchConfig
      launchAgent?: TuiAgent
      activate?: boolean
      clientMutationId?: string
      signal?: AbortSignal
    }
  ): Promise<RuntimeMobileSessionCreateTerminalResult>

  protected abstract resolveMobileSessionTerminalCommand(
    workspace: TerminalWorkspaceLaunchScope,
    opts: {
      command?: string
      env?: Record<string, string>
      envToDelete?: string[]
      startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
      agent?: TuiAgent
      agentPrompt?: string
      launchConfig?: SleepingAgentLaunchConfig
      launchAgent?: TuiAgent
    }
  ): Promise<{
    command?: string
    env?: Record<string, string>
    envToDelete?: string[]
    startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
    launchConfig?: SleepingAgentLaunchConfig
    launchAgent?: TuiAgent
  }>
}
