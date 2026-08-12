import { shellClient } from './shell-client'

// Why: legacy feature modules still share this name, but every member now
// resolves through an explicit shell or host client instead of a preload fallback.
export const rendererHostClient = {
  claudeAccounts: shellClient.accounts.claude,
  codexAccounts: shellClient.accounts.codex,
  automations: shellClient.automations,
  app: shellClient.app,
  crashReports: shellClient.crashReports,
  developerPermissions: shellClient.developerPermissions,
  diagnostics: shellClient.diagnostics,
  export: shellClient.export,
  feedback: shellClient.feedback,
  friday: shellClient.friday,
  repoHost: shellClient.repoHost,
  runtime: shellClient.runtime,
  gh: shellClient.gh,
  localhostWorktreeLabels: shellClient.localhostWorktreeLabels,
  minimaxCredentials: shellClient.minimaxCredentials,
  mobile: shellClient.mobile,
  notifications: shellClient.notifications,
  pet: shellClient.pet,
  speech: shellClient.speech,
  starNag: shellClient.starNag,
  updater: shellClient.updater
}
