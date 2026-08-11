import { shellClient } from './shell-client'

// Why: feature modules depend on one renderer-host facade. Shell-owned
// capabilities come from typed oRPC; the remaining data-plane holdouts stay
// on the audited preload bridge until their own migration package lands.
export const rendererHostClient = {
  ...window.api,
  app: shellClient.app,
  repoHost: shellClient.repoHost,
  runtime: shellClient.runtime,
  gh: shellClient.gh,
  notifications: shellClient.notifications,
  starNag: shellClient.starNag,
  updater: shellClient.updater
}
