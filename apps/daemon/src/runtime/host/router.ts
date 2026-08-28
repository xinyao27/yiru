import { isProcedure, type AnyRouter } from '@orpc/server'
import { runtimeContract } from '@yiru/runtime-protocol/contract'

import {
  checkRuntimeUpdater,
  downloadRuntimeUpdater,
  getRuntimeUpdaterStatus,
  installRuntimeUpdater
} from '../rpc/methods/updater'
import { runtimeImplementation } from '../rpc/orpc/access-middleware'
import { wireRuntimeMethod } from '../rpc/orpc/registered-method'
import { assertRuntimeOrpcRouterComplete } from '../rpc/orpc/router-completeness'
import { agentSessionRuntimeHandlers } from '../rpc/orpc/router-direct/agent-session'
import { aiVaultRuntimeHandlers } from '../rpc/orpc/router-direct/ai-vault'
import { clientSurfaceRuntimeHandlers } from '../rpc/orpc/router-direct/client-surface'
import { computerUseRuntimeHandlers } from '../rpc/orpc/router-direct/computer-use'
import { editorDocumentsRuntimeHandlers } from '../rpc/orpc/router-direct/editor-documents'
import { emulatorRuntimeHandlers } from '../rpc/orpc/router-direct/emulator'
import { filesRuntimeHandlers } from '../rpc/orpc/router-direct/files'
import { gitRuntimeHandlers } from '../rpc/orpc/router-direct/git'
import { githubRuntimeHandlers } from '../rpc/orpc/router-direct/github'
import { gitlabRuntimeHandlers } from '../rpc/orpc/router-direct/gitlab'
import { hostTelemetryRuntimeHandlers } from '../rpc/orpc/router-direct/host-telemetry'
import { hostedReviewRuntimeHandlers } from '../rpc/orpc/router-direct/hosted-review'
import { orchestrationRuntimeHandlers } from '../rpc/orpc/router-direct/orchestration'
import { portableHostToolingRuntimeHandlers } from '../rpc/orpc/router-direct/portable-host-tooling'
import { providerToolingRuntimeHandlers } from '../rpc/orpc/router-direct/provider-tooling'
import { providerUsageRuntimeHandlers } from '../rpc/orpc/router-direct/provider-usage'
import { runtimeEventsRuntimeHandlers } from '../rpc/orpc/router-direct/runtime-events'
import { sourceControlRuntimeHandlers } from '../rpc/orpc/router-direct/source-control'
import { workspaceRuntimeHandlers } from '../rpc/orpc/router-direct/workspace'
import { getNodeRuntimeHostStatus } from './status'
import { nodeTerminalRuntimeContract, nodeTerminalRuntimeHandlers } from './terminal-router'

const { mobile: nodeMobileHandlers, ...nodeAgentSessionHandlers } = agentSessionRuntimeHandlers

// Why: the Node host exposes the complete contract; platform-specific domains
// retain their precise domain-level refusal semantics behind mounted procedures.
const nodeRuntimeHostHandlers = {
  ...nodeTerminalRuntimeHandlers,
  ...nodeAgentSessionHandlers,
  // Why: the Node daemon feeds real hook state into the host event-source bridge.
  agentStatus: agentSessionRuntimeHandlers.agentStatus,
  // Why: the host's attached RateLimitService owns snapshots and change notifications.
  accounts: providerToolingRuntimeHandlers.accounts,
  ...aiVaultRuntimeHandlers,
  clipboard: clientSurfaceRuntimeHandlers.clipboard,
  // Why: host RPC mutations notify the same Store bridged by host/event-sources.ts.
  settings: clientSurfaceRuntimeHandlers.settings,
  // Why: host UI mutations publish from that Store without requiring a BrowserWindow.
  ui: clientSurfaceRuntimeHandlers.ui,
  ...computerUseRuntimeHandlers,
  emulator: emulatorRuntimeHandlers.emulator,
  ...editorDocumentsRuntimeHandlers,
  externalEditor: portableHostToolingRuntimeHandlers.externalEditor,
  ...filesRuntimeHandlers,
  ...gitRuntimeHandlers,
  ...githubRuntimeHandlers,
  ...gitlabRuntimeHandlers,
  host: {
    ...portableHostToolingRuntimeHandlers.host
  },
  diagnostics: hostTelemetryRuntimeHandlers.diagnostics,
  stats: hostTelemetryRuntimeHandlers.stats,
  ...hostedReviewRuntimeHandlers,
  ...orchestrationRuntimeHandlers,
  rateLimitResume: providerToolingRuntimeHandlers.rateLimitResume,
  skills: {
    discover: providerToolingRuntimeHandlers.skills.discover,
    // Why: host skill mutations drive the process-wide runner bridged into this runtime.
    manage: providerToolingRuntimeHandlers.skills.manage
  },
  ...providerUsageRuntimeHandlers,
  mobile: nodeMobileHandlers,
  updater: {
    // Why: the default remote-server updater adapter is the headless authority:
    // status reports manual mode and mutations reject with remote_update_manual_required.
    getStatus: runtimeImplementation.updater.getStatus.handler(
      wireRuntimeMethod('updater.getStatus', getRuntimeUpdaterStatus)
    ),
    check: runtimeImplementation.updater.check.handler(
      wireRuntimeMethod('updater.check', checkRuntimeUpdater)
    ),
    download: runtimeImplementation.updater.download.handler(
      wireRuntimeMethod('updater.download', downloadRuntimeUpdater)
    ),
    install: runtimeImplementation.updater.install.handler(
      wireRuntimeMethod('updater.install', installRuntimeUpdater)
    )
  },
  cli: portableHostToolingRuntimeHandlers.cli,
  preflight: portableHostToolingRuntimeHandlers.preflight,
  ...sourceControlRuntimeHandlers,
  // Why: host repo/worktree operations emit real progress through the runtime bridge.
  runtime: runtimeEventsRuntimeHandlers.runtime,
  ...workspaceRuntimeHandlers,
  // Why: host PTY output drives the advertised-URL watcher with Store ownership filtering.
  workspacePorts: workspaceRuntimeHandlers.workspacePorts,
  status: {
    get: runtimeImplementation.status.get.handler(
      wireRuntimeMethod('status.get', getNodeRuntimeHostStatus)
    )
  }
} as const

const nodeNotificationsContract: Partial<typeof runtimeContract.notifications> = {
  ...runtimeContract.notifications
}
delete nodeNotificationsContract.registerPush
const nodeRepoContract: Partial<typeof runtimeContract.repo> = {
  ...runtimeContract.repo
}
delete nodeRepoContract.browse
delete nodeRepoContract.discover
const nodeWorktreeContract: Partial<typeof runtimeContract.worktree> = {
  ...runtimeContract.worktree
}
delete nodeWorktreeContract.archive
delete nodeWorktreeContract.listArchives
delete nodeWorktreeContract.restoreArchive

const nodeRuntimeHostContract = {
  ...nodeTerminalRuntimeContract,
  accounts: runtimeContract.accounts,
  agentStatus: runtimeContract.agentStatus,
  agentTeams: runtimeContract.agentTeams,
  aiVault: runtimeContract.aiVault,
  clipboard: runtimeContract.clipboard,
  cli: runtimeContract.cli,
  computer: runtimeContract.computer,
  diagnostics: runtimeContract.diagnostics,
  emulator: runtimeContract.emulator,
  externalEditor: runtimeContract.externalEditor,
  files: runtimeContract.files,
  folderWorkspace: runtimeContract.folderWorkspace,
  git: runtimeContract.git,
  github: runtimeContract.github,
  gitlab: runtimeContract.gitlab,
  host: {
    platform: runtimeContract.host.platform,
    wsl: runtimeContract.host.wsl,
    pwsh: runtimeContract.host.pwsh,
    gitBash: runtimeContract.host.gitBash,
    agentTrust: runtimeContract.host.agentTrust
  },
  hostedReview: runtimeContract.hostedReview,
  markdown: runtimeContract.markdown,
  mobile: runtimeContract.mobile,
  notebook: runtimeContract.notebook,
  notifications: nodeNotificationsContract,
  orchestration: runtimeContract.orchestration,
  repo: nodeRepoContract,
  project: runtimeContract.project,
  projectGroup: runtimeContract.projectGroup,
  projectHostSetup: runtimeContract.projectHostSetup,
  preflight: runtimeContract.preflight,
  rateLimitResume: runtimeContract.rateLimitResume,
  runtime: runtimeContract.runtime,
  settings: runtimeContract.settings,
  session: runtimeContract.session,
  skills: {
    discover: runtimeContract.skills.discover,
    manage: runtimeContract.skills.manage
  },
  stats: runtimeContract.stats,
  status: runtimeContract.status,
  ui: runtimeContract.ui,
  updater: runtimeContract.updater,
  usage: runtimeContract.usage,
  workspace: runtimeContract.workspace,
  workspaceCleanup: runtimeContract.workspaceCleanup,
  workspacePorts: runtimeContract.workspacePorts,
  workspaceSpace: runtimeContract.workspaceSpace,
  worktree: nodeWorktreeContract
} as const

// Why: the shared implementer is typed against all 569 procedures. The
// independent completeness walk proves every leaf is mounted on this host.
const nodeRuntimeHostRouterInput: unknown = nodeRuntimeHostHandlers
export const nodeRuntimeHostRouter: AnyRouter = runtimeImplementation.router(
  nodeRuntimeHostRouterInput as Parameters<typeof runtimeImplementation.router>[0]
)

assertRuntimeOrpcRouterComplete(nodeRuntimeHostRouter, nodeRuntimeHostContract)

export function isNodeRuntimeHostProcedureMounted(path: readonly string[]): boolean {
  let node: unknown = nodeRuntimeHostRouter
  for (const segment of path) {
    if (!isRecord(node)) {
      return false
    }
    node = node[segment]
  }
  return isProcedure(node)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
