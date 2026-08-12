import { shellClient } from './shell-client'

// Why: feature modules depend on one renderer-host facade. Shell-owned
// capabilities come from typed oRPC; remaining data-plane domains stay on the
// audited preload bridge until their own migration package lands.
const shellOwnedDomains = {
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

type RendererHostClient = Window['api'] & typeof shellOwnedDomains

export const rendererHostClient: RendererHostClient = new Proxy(
  shellOwnedDomains as RendererHostClient,
  {
    get: (target, property, receiver) => {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver)
      }
      const client = window.api
      return client ? Reflect.get(client, property, receiver) : undefined
    }
  }
)
