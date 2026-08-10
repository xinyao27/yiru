import type { ContractRouter } from '@orpc/contract'

export type { ContractRouterClient } from '@orpc/contract'

import type { RuntimeProcedureMeta } from './access-meta.js'
import { accountsContract } from './accounts.js'
import { agentStatusContract } from './agent-status.js'
import { agentTeamsContract } from './agent-teams.js'
import { aiVaultContract } from './ai-vault.js'
import { automationContract } from './automations.js'
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
import { coworkingContract } from './coworking.js'
import { diagnosticsContract } from './diagnostics.js'
import { emulatorContract } from './emulator.js'
import {
  EXTERNAL_EDITOR_OPEN_REMOTE_SSH_CONTRACT,
  externalEditorContract
} from './external-editor.js'
import { filesContract } from './files.js'
import { folderWorkspaceContract } from './folder-workspace.js'
import { gitContract } from './git.js'
import { githubContract } from './github.js'
import { gitlabContract } from './gitlab.js'
import { hostContract } from './host-capabilities.js'
import { hostedReviewContract } from './hosted-review.js'
import { mobileContract } from './mobile-development-pairing.js'
import { nativeChatContract } from './native-chat.js'
import { notebookContract } from './notebook.js'
import { notificationsContract } from './notifications.js'
import { orchestrationContract } from './orchestration.js'
import { preflightContract } from './preflight.js'
import { projectGroupContract } from './project-group.js'
import { projectContract, projectHostSetupContract } from './project.js'
import { CURSOR_USAGE_GET_CONTRACT, providerUsageContract } from './provider-usage.js'
import { rateLimitResumeContract } from './rate-limit-resume.js'
import { repoContract } from './repo.js'
import { markdownContract, sessionContract } from './session-tabs.js'
import { settingsContract } from './settings.js'
import { skillsContract } from './skills.js'
import { speechContract } from './speech.js'
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
import { updaterContract } from './updater.js'
import { workspaceCleanupContract } from './workspace-cleanup.js'
import { workspacePortsContract } from './workspace-ports.js'
import { workspaceSpaceContract } from './workspace-space.js'
import { workspaceContract } from './workspace.js'
import { worktreeContract } from './worktree.js'

export const runtimeContract = {
  accounts: accountsContract,
  agentStatus: agentStatusContract,
  agentTeams: agentTeamsContract,
  aiVault: aiVaultContract,
  automation: automationContract,
  browser: browserContract,
  cli: cliContract,
  clipboard: clipboardContract,
  computer: computerContract,
  coworking: coworkingContract,
  diagnostics: diagnosticsContract,
  emulator: emulatorContract,
  externalEditor: externalEditorContract,
  files: filesContract,
  folderWorkspace: folderWorkspaceContract,
  git: gitContract,
  github: githubContract,
  gitlab: gitlabContract,
  host: hostContract,
  hostedReview: hostedReviewContract,
  mobile: mobileContract,
  markdown: markdownContract,
  nativeChat: nativeChatContract,
  notebook: notebookContract,
  notifications: notificationsContract,
  orchestration: orchestrationContract,
  preflight: preflightContract,
  project: projectContract,
  projectGroup: projectGroupContract,
  projectHostSetup: projectHostSetupContract,
  usage: providerUsageContract,
  rateLimitResume: rateLimitResumeContract,
  repo: repoContract,
  runtime: runtimeNamespaceContract,
  session: sessionContract,
  settings: settingsContract,
  skills: skillsContract,
  speech: speechContract,
  stats: statsContract,
  status: statusContract,
  terminal: terminalContract,
  ui: uiContract,
  updater: updaterContract,
  workspace: workspaceContract,
  workspaceCleanup: workspaceCleanupContract,
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
export * from './agent-teams.js'
export * from './ai-vault.js'
export * from './automations.js'
export * from './browser/browser.js'
export * from './accounts.js'
export * from './cli.js'
export * from './clipboard.js'
export * from './client-events.js'
export * from './computer.js'
export * from './coworking.js'
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
export * from './gitlab.js'
export { hostContract } from './host-capabilities.js'
export type { RuntimeHostPlatform } from './host-capabilities.js'
export * from './hosted-review.js'
export * from './mobile-development-pairing.js'
export * from './native-chat.js'
export * from './notebook.js'
export * from './notifications.js'
export * from './orchestration.js'
export * from './preflight.js'
export * from './project-group.js'
export * from './project.js'
export * from './provider-usage.js'
export * from './rate-limit-resume.js'
export * from './repo.js'
export * from './session-tabs.js'
export * from './settings.js'
export * from './shell-services-browser.js'
export * from './shell-services-pty.js'
export * from './shell-services-platform.js'
export * from './shell-services-terminal.js'
export * from './shell-services-ui.js'
export * from './shell-services.js'
export * from './skills.js'
export * from './speech.js'
export * from './stats.js'
export * from './status.js'
export * from './terminal.js'
export * from './ui.js'
export * from './updater.js'
export * from './workspace.js'
export * from './workspace-cleanup.js'
export * from './workspace-ports.js'
export * from './workspace-space.js'
export * from './worktree.js'
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
