import type { ContractRouter } from '@orpc/contract'

export type { ContractRouterClient } from '@orpc/contract'

import type { RuntimeProcedureMeta } from './access-meta.js'
import { accountsContract } from './accounts.js'
import { agentSessionContract } from './agent-session.js'
import { agentStatusContract } from './agent-status.js'
import { agentTeamsContract } from './agent-teams.js'
import { aiVaultContract } from './ai-vault.js'
import { artifactContract } from './artifact.js'
import { browserCommandContract } from './browser-command.js'
import { browserReplayContract } from './browser-replay.js'
import { browserWritebackContract } from './browser-writeback.js'
import { browserContract } from './browser/browser.js'
import {
  CLI_INSTALL_CONTRACT,
  CLI_INSTALL_STATUS_CONTRACT,
  CLI_REMOVE_CONTRACT,
  CLI_WSL_INSTALL_CONTRACT,
  CLI_WSL_INSTALL_STATUS_CONTRACT,
  CLI_WSL_REMOVE_CONTRACT,
  cliContract
} from './cli.js'
import { runtimeNamespaceContract } from './client-events.js'
import { clipboardContract } from './clipboard.js'
import { computerContract } from './computer.js'
import { dangerousApprovalContract } from './dangerous-approval.js'
import { diagnosticsContract } from './diagnostics.js'
import { emulatorContract } from './emulator.js'
import {
  EXTERNAL_EDITOR_OPEN_REMOTE_SSH_CONTRACT,
  externalEditorContract
} from './external-editor.js'
import { filesContract } from './files.js'
import { folderWorkspaceContract } from './folder-workspace.js'
import { gitContract } from './git.js'
import { githubCommentDraftContract } from './github-comment-draft.js'
import { githubContract } from './github.js'
import { gitlabContract } from './gitlab.js'
import { hostContract } from './host-capabilities.js'
import { runtimeHostContract } from './host.js'
import { hostedReviewContract } from './hosted-review.js'
import { layoutContract } from './layout.js'
import { mobileContract } from './mobile-development-pairing.js'
import { notebookContract } from './notebook.js'
import { notificationsContract } from './notifications.js'
import { orchestrationContract } from './orchestration.js'
import { preflightContract } from './preflight.js'
import { projectContextContract } from './project-context.js'
import { projectGroupContract } from './project-group.js'
import { projectContract, projectHostSetupContract } from './project.js'
import {
  CURSOR_USAGE_GET_CONTRACT,
  cursorUsageContract,
  providerUsageContract
} from './provider-usage.js'
import { rateLimitResumeContract } from './rate-limit-resume.js'
import { repoContract } from './repo.js'
import { ritualContract } from './ritual.js'
import { searchContract } from './search.js'
import { markdownContract, sessionContract } from './session-tabs.js'
import { settingsContract } from './settings.js'
import { shellContract } from './shell/shell.js'
import { skillCatalogContract } from './skill-catalog.js'
import { skillsContract } from './skills.js'
import { statsContract } from './stats.js'
import { STATUS_GET_CONTRACT, statusContract } from './status.js'
import {
  TERMINAL_MANAGEMENT_KILL_ALL_CONTRACT,
  TERMINAL_MANAGEMENT_KILL_ONE_CONTRACT,
  TERMINAL_MANAGEMENT_LIST_SESSIONS_CONTRACT,
  TERMINAL_MANAGEMENT_RESTART_CONTRACT
} from './terminal-management.js'
import { terminalContract } from './terminal.js'
import { uiContract } from './ui.js'
import { updateContract } from './update.js'
import { updaterContract } from './updater.js'
import { visualRegressionContract } from './visual-regression.js'
import { workspaceCleanupContract } from './workspace-cleanup.js'
import { workspaceEventsContract } from './workspace-events.js'
import { workspacePortsContract } from './workspace-ports.js'
import { workspaceSpaceContract } from './workspace-space.js'
import { workspaceContract } from './workspace.js'
import { worktreeContract } from './worktree.js'

export const runtimeContract = {
  accounts: accountsContract,
  agentSession: agentSessionContract,
  agentStatus: agentStatusContract,
  agentTeams: agentTeamsContract,
  aiVault: aiVaultContract,
  artifact: artifactContract,
  browser: browserContract,
  browserCommand: browserCommandContract,
  browserReplay: browserReplayContract,
  browserWriteback: browserWritebackContract,
  cli: cliContract,
  clipboard: clipboardContract,
  computer: computerContract,
  dangerousApproval: dangerousApprovalContract,
  diagnostics: diagnosticsContract,
  emulator: emulatorContract,
  externalEditor: externalEditorContract,
  files: filesContract,
  folderWorkspace: folderWorkspaceContract,
  git: gitContract,
  github: githubContract,
  githubCommentDraft: githubCommentDraftContract,
  gitlab: gitlabContract,
  host: { ...hostContract, ...runtimeHostContract },
  hostedReview: hostedReviewContract,
  layout: layoutContract,
  mobile: mobileContract,
  markdown: markdownContract,
  notebook: notebookContract,
  notifications: notificationsContract,
  orchestration: orchestrationContract,
  preflight: preflightContract,
  project: projectContract,
  projectContext: projectContextContract,
  projectGroup: projectGroupContract,
  projectHostSetup: projectHostSetupContract,
  providerUsage: providerUsageContract,
  rateLimitResume: rateLimitResumeContract,
  repo: repoContract,
  ritual: ritualContract,
  runtime: runtimeNamespaceContract,
  search: searchContract,
  session: sessionContract,
  settings: settingsContract,
  shell: shellContract,
  skillCatalog: skillCatalogContract,
  skills: skillsContract,
  stats: statsContract,
  status: statusContract,
  terminal: terminalContract,
  ui: uiContract,
  update: updateContract,
  updater: updaterContract,
  visualRegression: visualRegressionContract,
  usage: cursorUsageContract,
  workspace: workspaceContract,
  workspaceCleanup: workspaceCleanupContract,
  workspaceEvents: workspaceEventsContract,
  workspacePorts: workspacePortsContract,
  workspaceSpace: workspaceSpaceContract,
  worktree: worktreeContract
} satisfies ContractRouter<RuntimeProcedureMeta>

export type {
  RpcAccess,
  RpcAccessScope,
  RpcAccessTier,
  RpcCallerClass,
  RuntimeProcedureMeta
} from './access-meta.js'
export { RuntimeProcedureMetaSchema } from './access-meta.js'
export * from './agent-status.js'
export * from './agent-session.js'
export * from './agent-teams.js'
export * from './ai-vault.js'
export * from './artifact.js'
export * from './browser/browser.js'
export * from './browser-command.js'
export * from './browser-replay.js'
export * from './browser-writeback.js'
export * from './accounts.js'
export * from './cli.js'
export * from './clipboard.js'
export * from './client-events.js'
export * from './computer.js'
export * from './dangerous-approval.js'
// Why: `RuntimeEmulatorListResult`/`RuntimeEmulatorExecResult` are aliases of
// `RuntimeJsonValue` — a consumer that names either type in a declaration
// (e.g. `tsc --declaration`'s emit for a directly-wired handler) needs a
// portable public path to it, which this barrel didn't provide.
export type { RuntimeJsonPrimitive, RuntimeJsonValue } from './json-value.js'
export * from './diagnostics.js'
export * from './emulator.js'
export * from './external-editor.js'
export * from './files.js'
export * from './folder-workspace.js'
export * from './git.js'
export * from './github.js'
export * from './github-comment-draft.js'
export * from './gitlab.js'
export { hostContract } from './host-capabilities.js'
export type { AgentTrustInput, AgentTrustPreset, RuntimeHostPlatform } from './host-capabilities.js'
export * from './host.js'
export * from './hosted-review.js'
export * from './layout.js'
export * from './mobile-development-pairing.js'
export * from './notebook.js'
export * from './notifications.js'
export * from './orchestration.js'
export * from './preflight.js'
export * from './project-group.js'
export * from './project-context.js'
export * from './project.js'
export * from './provider-usage.js'
export * from './rate-limit-resume.js'
export * from './repo.js'
export * from './ritual.js'
export * from './search.js'
export * from './session-tabs.js'
export * from './settings.js'
export * from './shell/shell.js'
export * from './shell-services-browser.js'
export * from './shell-services-platform.js'
export * from './shell-services-terminal.js'
export * from './shell-services-ui.js'
export * from './shell-services.js'
export * from './skill-catalog.js'
export * from './skills.js'
export * from './stats.js'
export * from './status.js'
export * from './terminal.js'
export * from './ui.js'
export * from './update.js'
export * from './updater.js'
export * from './visual-regression.js'
export * from './workspace.js'
export * from './workspace-cleanup.js'
export * from './workspace-events.js'
export * from './workspace-ports.js'
export * from './workspace-space.js'
export * from './worktree.js'
export * from './worktree-archive.js'
export {
  CLI_INSTALL_CONTRACT,
  CLI_INSTALL_STATUS_CONTRACT,
  CLI_REMOVE_CONTRACT,
  CLI_WSL_INSTALL_CONTRACT,
  CLI_WSL_INSTALL_STATUS_CONTRACT,
  CLI_WSL_REMOVE_CONTRACT,
  CURSOR_USAGE_GET_CONTRACT,
  EXTERNAL_EDITOR_OPEN_REMOTE_SSH_CONTRACT,
  STATUS_GET_CONTRACT,
  TERMINAL_MANAGEMENT_KILL_ALL_CONTRACT,
  TERMINAL_MANAGEMENT_KILL_ONE_CONTRACT,
  TERMINAL_MANAGEMENT_LIST_SESSIONS_CONTRACT,
  TERMINAL_MANAGEMENT_RESTART_CONTRACT
}
