import { shellClient } from './shell-client'

// Why: feature modules depend on one renderer-host facade. Shell-owned
// capabilities come from typed oRPC; remaining data-plane domains stay on the
// audited preload bridge until their own migration package lands.
export const rendererHostClient = {
  ...window.api,
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
