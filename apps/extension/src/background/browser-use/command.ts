import { executeBrowserEnvironment } from './environment'
import { executeBrowserInteraction } from './interaction'
import { executeBrowserNavigation } from './navigation'
import { executeBrowserObservability } from './observability'
import { executeBrowserPointer } from './pointer'

const NAVIGATION_METHODS = new Set([
  'browser.back',
  'browser.certificate.proceed',
  'browser.forward',
  'browser.goto',
  'browser.profileClearDefaultCookies',
  'browser.profileCreate',
  'browser.profileDelete',
  'browser.profileDetectBrowsers',
  'browser.profileImportFromBrowser',
  'browser.profileList',
  'browser.reload',
  'browser.tabClose',
  'browser.tabCreate',
  'browser.tabCurrent',
  'browser.tabList',
  'browser.tabProfileClone',
  'browser.tabProfileShow',
  'browser.tabSetProfile',
  'browser.tabShow',
  'browser.tabSwitch'
])

const INTERACTION_METHODS = new Set([
  'browser.check',
  'browser.clear',
  'browser.click',
  'browser.dblclick',
  'browser.download',
  'browser.drag',
  'browser.eval',
  'browser.fill',
  'browser.find',
  'browser.focus',
  'browser.fullScreenshot',
  'browser.get',
  'browser.highlight',
  'browser.hover',
  'browser.is',
  'browser.keyboardInsertText',
  'browser.keypress',
  'browser.pdf',
  'browser.screenshot',
  'browser.scroll',
  'browser.scrollIntoView',
  'browser.select',
  'browser.selectAll',
  'browser.snapshot',
  'browser.type',
  'browser.upload',
  'browser.wait'
])

const ENVIRONMENT_METHODS = new Set([
  'browser.clipboardRead',
  'browser.clipboardWrite',
  'browser.cookie.delete',
  'browser.cookie.get',
  'browser.cookie.set',
  'browser.dialogAccept',
  'browser.dialogDismiss',
  'browser.geolocation',
  'browser.intercept.disable',
  'browser.intercept.enable',
  'browser.intercept.list',
  'browser.setCredentials',
  'browser.setDevice',
  'browser.setHeaders',
  'browser.setMedia',
  'browser.setOffline',
  'browser.storage.local.clear',
  'browser.storage.local.get',
  'browser.storage.local.set',
  'browser.storage.session.clear',
  'browser.storage.session.get',
  'browser.storage.session.set',
  'browser.viewport'
])

const OBSERVABILITY_METHODS = new Set([
  'browser.capture.start',
  'browser.capture.stop',
  'browser.console',
  'browser.network'
])

const POINTER_METHODS = new Set([
  'browser.mouseClick',
  'browser.mouseDown',
  'browser.mouseMove',
  'browser.mouseUp',
  'browser.mouseWheel'
])

export function executeBrowserCommand(method: string, input: unknown): Promise<unknown> {
  if (NAVIGATION_METHODS.has(method)) {
    return executeBrowserNavigation(method, input)
  }
  if (INTERACTION_METHODS.has(method)) {
    return executeBrowserInteraction(method, input)
  }
  if (ENVIRONMENT_METHODS.has(method)) {
    return executeBrowserEnvironment(method, input)
  }
  if (OBSERVABILITY_METHODS.has(method)) {
    return executeBrowserObservability(method, input)
  }
  if (POINTER_METHODS.has(method)) {
    return executeBrowserPointer(method, input)
  }
  return Promise.reject(new Error(`browser_command_unsupported:${method}`))
}
