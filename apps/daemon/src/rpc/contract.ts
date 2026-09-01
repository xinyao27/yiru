import { implement } from '@orpc/server'
import { runtimeContract } from '@yiru/runtime-protocol/contract'

export const daemonContract = {
  agentSession: runtimeContract.agentSession,
  artifact: runtimeContract.artifact,
  browser: {
    back: runtimeContract.browser.back,
    capture: runtimeContract.browser.capture,
    certificate: runtimeContract.browser.certificate,
    check: runtimeContract.browser.check,
    clear: runtimeContract.browser.clear,
    click: runtimeContract.browser.click,
    clipboardRead: runtimeContract.browser.clipboardRead,
    clipboardWrite: runtimeContract.browser.clipboardWrite,
    console: runtimeContract.browser.console,
    cookie: runtimeContract.browser.cookie,
    dblclick: runtimeContract.browser.dblclick,
    dialogAccept: runtimeContract.browser.dialogAccept,
    dialogDismiss: runtimeContract.browser.dialogDismiss,
    download: runtimeContract.browser.download,
    drag: runtimeContract.browser.drag,
    eval: runtimeContract.browser.eval,
    exec: runtimeContract.browser.exec,
    fill: runtimeContract.browser.fill,
    find: runtimeContract.browser.find,
    focus: runtimeContract.browser.focus,
    forward: runtimeContract.browser.forward,
    fullScreenshot: runtimeContract.browser.fullScreenshot,
    geolocation: runtimeContract.browser.geolocation,
    get: runtimeContract.browser.get,
    goto: runtimeContract.browser.goto,
    highlight: runtimeContract.browser.highlight,
    hover: runtimeContract.browser.hover,
    intercept: runtimeContract.browser.intercept,
    is: runtimeContract.browser.is,
    keyboardInsertText: runtimeContract.browser.keyboardInsertText,
    keypress: runtimeContract.browser.keypress,
    mouseClick: runtimeContract.browser.mouseClick,
    mouseDown: runtimeContract.browser.mouseDown,
    mouseMove: runtimeContract.browser.mouseMove,
    mouseUp: runtimeContract.browser.mouseUp,
    mouseWheel: runtimeContract.browser.mouseWheel,
    network: runtimeContract.browser.network,
    pdf: runtimeContract.browser.pdf,
    profileClearDefaultCookies: runtimeContract.browser.profileClearDefaultCookies,
    profileCreate: runtimeContract.browser.profileCreate,
    profileDelete: runtimeContract.browser.profileDelete,
    profileDetectBrowsers: runtimeContract.browser.profileDetectBrowsers,
    profileImportFromBrowser: runtimeContract.browser.profileImportFromBrowser,
    profileList: runtimeContract.browser.profileList,
    reload: runtimeContract.browser.reload,
    screenshot: runtimeContract.browser.screenshot,
    scroll: runtimeContract.browser.scroll,
    scrollIntoView: runtimeContract.browser.scrollIntoView,
    screencast: runtimeContract.browser.screencast,
    select: runtimeContract.browser.select,
    selectAll: runtimeContract.browser.selectAll,
    setCredentials: runtimeContract.browser.setCredentials,
    setDevice: runtimeContract.browser.setDevice,
    setHeaders: runtimeContract.browser.setHeaders,
    setMedia: runtimeContract.browser.setMedia,
    setOffline: runtimeContract.browser.setOffline,
    snapshot: runtimeContract.browser.snapshot,
    storage: runtimeContract.browser.storage,
    tabClose: runtimeContract.browser.tabClose,
    tabCreate: runtimeContract.browser.tabCreate,
    tabCurrent: runtimeContract.browser.tabCurrent,
    tabList: runtimeContract.browser.tabList,
    tabProfileClone: runtimeContract.browser.tabProfileClone,
    tabProfileShow: runtimeContract.browser.tabProfileShow,
    tabSetProfile: runtimeContract.browser.tabSetProfile,
    tabShow: runtimeContract.browser.tabShow,
    tabSwitch: runtimeContract.browser.tabSwitch,
    type: runtimeContract.browser.type,
    upload: runtimeContract.browser.upload,
    viewport: runtimeContract.browser.viewport,
    wait: runtimeContract.browser.wait
  },
  browserCommand: runtimeContract.browserCommand,
  browserReplay: runtimeContract.browserReplay,
  browserWriteback: runtimeContract.browserWriteback,
  dangerousApproval: runtimeContract.dangerousApproval,
  githubCommentDraft: runtimeContract.githubCommentDraft,
  host: {
    add: runtimeContract.host.add,
    list: runtimeContract.host.list,
    probe: runtimeContract.host.probe,
    remove: runtimeContract.host.remove
  },
  layout: runtimeContract.layout,
  mobile: {
    developmentPairing: runtimeContract.mobile.developmentPairing,
    hostPairing: runtimeContract.mobile.hostPairing
  },
  notifications: runtimeContract.notifications,
  projectContext: runtimeContract.projectContext,
  repo: {
    add: runtimeContract.repo.add,
    browse: runtimeContract.repo.browse,
    discover: runtimeContract.repo.discover,
    list: runtimeContract.repo.list
  },
  ritual: runtimeContract.ritual,
  search: runtimeContract.search,
  skillCatalog: runtimeContract.skillCatalog,
  terminal: {
    approve: runtimeContract.terminal.approve
  },
  update: runtimeContract.update,
  visualRegression: runtimeContract.visualRegression,
  worktree: {
    archive: runtimeContract.worktree.archive,
    listArchives: runtimeContract.worktree.listArchives,
    restoreArchive: runtimeContract.worktree.restoreArchive
  },
  workspaceEvents: runtimeContract.workspaceEvents,
  workspacePorts: {
    scan: runtimeContract.workspacePorts.scan
  }
}

export type DaemonRequestContext =
  | {
      client: 'extension'
      connectionId: string
      sendBinary?: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
    }
  | {
      client: 'mobile'
      connectionId: string
      deviceId: string
      sendBinary?: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
    }

export const daemonImplementation = implement(daemonContract).$context<DaemonRequestContext>()
