import { shellClient } from './shell-client'

// Why: lazy accessors keep this legacy facade safe across the web bundle's
// shell-client import cycle while every member resolves through an explicit client.
export const rendererHostClient = {
  get claudeAccounts() {
    return shellClient.accounts.claude
  },
  get codexAccounts() {
    return shellClient.accounts.codex
  },
  get automations() {
    return shellClient.automations
  },
  get app() {
    return shellClient.app
  },
  get crashReports() {
    return shellClient.crashReports
  },
  get developerPermissions() {
    return shellClient.developerPermissions
  },
  get diagnostics() {
    return shellClient.diagnostics
  },
  get export() {
    return shellClient.export
  },
  get feedback() {
    return shellClient.feedback
  },
  get friday() {
    return shellClient.friday
  },
  get repoHost() {
    return shellClient.repoHost
  },
  get runtime() {
    return shellClient.runtime
  },
  get gh() {
    return shellClient.gh
  },
  get localhostWorktreeLabels() {
    return shellClient.localhostWorktreeLabels
  },
  get minimaxCredentials() {
    return shellClient.minimaxCredentials
  },
  get mobile() {
    return shellClient.mobile
  },
  get notifications() {
    return shellClient.notifications
  },
  get pet() {
    return shellClient.pet
  },
  get speech() {
    return shellClient.speech
  },
  get starNag() {
    return shellClient.starNag
  },
  get updater() {
    return shellClient.updater
  }
}
