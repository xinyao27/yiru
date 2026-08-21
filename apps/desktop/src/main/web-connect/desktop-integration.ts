import { resolve } from 'node:path'

import type { ShellWebConnectStatus } from '@yiru/runtime-protocol/contract'
import { app, dialog, shell } from 'electron'
import { translateMain } from '~main/i18n/main-i18n'

import {
  findWebConnectDeepLinkArgument,
  parseWebConnectDeepLink,
  WEB_CONNECT_URL_SCHEME
} from './deep-link'
import { WebConnectService, type LocalRuntimeTargetResolver } from './service'

export type WebConnectIntegrationOptions = {
  onStatusChange: (status: ShellWebConnectStatus) => void
  reportError: (message: string, error: unknown) => void
  resolveTarget: LocalRuntimeTargetResolver
  userDataPath: string
}

let service: WebConnectService | null = null
let reportIntegrationError: WebConnectIntegrationOptions['reportError'] = () => {}
let promptedVerificationCode: string | null = null

export function initializeWebConnect(options: WebConnectIntegrationOptions): void {
  reportIntegrationError = options.reportError
  service = new WebConnectService({
    onStatusChange: (status) => {
      options.onStatusChange(status)
      promptPendingVerification(status)
    },
    resolveTarget: options.resolveTarget,
    userDataPath: options.userDataPath
  })
  registerProtocolClient()
  const launchLink = findWebConnectDeepLinkArgument(process.argv)
  if (launchLink) {
    routeDeepLink(launchLink)
  }
}

// Why: the relay bridge needs the app's own WebSocket endpoint, which only
// exists once the runtime transport has started — initialization happens earlier,
// so the connect attempt is repeated here rather than lost.
export function connectWebConnectIfPaired(): void {
  service?.connect()
}

export function getWebConnectService(): WebConnectService {
  if (!service) {
    throw new Error('unavailable_on_host: shell web-connect service is not initialized')
  }
  return service
}

export function hasWebConnectService(): boolean {
  return service !== null
}

// Why: macOS delivers the link as an event while Windows and Linux re-launch the
// binary with it in argv, so both entry points funnel through here.
export function installWebConnectDeepLinkListeners(): void {
  app.on('open-url', (event, url) => {
    event.preventDefault()
    routeDeepLink(url)
  })
  app.on('second-instance', (_event, argv) => {
    const link = findWebConnectDeepLinkArgument(argv)
    if (link) {
      routeDeepLink(link)
    }
  })
}

export function openWebConnectBrowserSession(): Promise<boolean> {
  const url = getWebConnectService().createBrowserSessionUrl()
  return shell
    .openExternal(url)
    .then(() => true)
    .catch((error: unknown) => {
      reportIntegrationError('[web-connect] Failed to open the connect page', error)
      return false
    })
}

// Why: an unsolicited grant is approved against a code the user must compare, so
// the prompt has to be a surface a web page cannot draw over or suppress — and it
// must appear whether or not the status popover happens to be open.
function promptPendingVerification(status: ShellWebConnectStatus): void {
  const pending = status.pendingVerification
  if (!pending) {
    promptedVerificationCode = null
    return
  }
  if (promptedVerificationCode === pending.verificationCode) {
    return
  }
  promptedVerificationCode = pending.verificationCode
  void dialog
    .showMessageBox({
      type: 'question',
      buttons: [
        translateMain('webConnect.confirmPairing', 'Codes match, connect'),
        translateMain('webConnect.cancelPairing', 'Cancel')
      ],
      cancelId: 1,
      // Why: defaults to Cancel so a stray Enter never approves a browser.
      defaultId: 1,
      message: translateMain('webConnect.pairingTitle', 'Connect this browser to Yiru?'),
      detail: translateMain(
        'webConnect.pairingDetail',
        'The web page must show this same code:\n\n{{code}}\n\nCancel if it does not.',
        { code: pending.verificationCode }
      )
    })
    .then(async (result) => {
      if (!service) {
        return
      }
      if (result.response === 0) {
        await service.confirmPendingVerification()
        return
      }
      service.cancelPendingVerification()
    })
    .catch((error: unknown) => {
      reportIntegrationError('[web-connect] Pairing confirmation failed', error)
    })
}

function routeDeepLink(value: string): void {
  const link = parseWebConnectDeepLink(value)
  if (!link || !service) {
    return
  }
  void service.handleDeepLink(link).catch((error: unknown) => {
    reportIntegrationError('[web-connect] Pairing from a deep link failed', error)
  })
}

function registerProtocolClient(): void {
  // Why: an unpackaged dev run is launched through the Electron binary, so the
  // scheme has to be registered against that binary plus the app path or the OS
  // hands the link to Electron itself instead of this project.
  if (process.defaultApp) {
    const appPath = process.argv[1]
    if (appPath) {
      app.setAsDefaultProtocolClient(WEB_CONNECT_URL_SCHEME, process.execPath, [resolve(appPath)])
      return
    }
  }
  app.setAsDefaultProtocolClient(WEB_CONNECT_URL_SCHEME)
}
