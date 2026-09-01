import { sameStringArray, terminalLayoutEqual } from './agent-status-equality'
import { browserCertificateFailureEqual, sameBrowserPages } from './store-equality'
import type { buildRemoteSessionSurfaceMirror } from './surface-reconciliation'
import type { RemoteSessionTabsSyncState } from './tabs-state'

export function buildRemoteSessionResourceReconciliation(input: {
  state: RemoteSessionTabsSyncState
  environmentId: string
  surfaceMirror: ReturnType<typeof buildRemoteSessionSurfaceMirror>
}) {
  const { state, environmentId, surfaceMirror } = input
  const {
    mirroredTerminalTabs,
    removedTerminalIds,
    mirroredBrowserTabs,
    removedBrowserWorkspaceIds
  } = surfaceMirror
  let nextPtyIdsByTabId = state.ptyIdsByTabId
  for (const removedId of removedTerminalIds) {
    if (nextPtyIdsByTabId[removedId]) {
      nextPtyIdsByTabId =
        nextPtyIdsByTabId === state.ptyIdsByTabId ? { ...state.ptyIdsByTabId } : nextPtyIdsByTabId
      delete nextPtyIdsByTabId[removedId]
    }
  }
  for (const { tab, ptyIds } of mirroredTerminalTabs) {
    const current = nextPtyIdsByTabId[tab.id] ?? []
    if (!sameStringArray(current, ptyIds)) {
      nextPtyIdsByTabId =
        nextPtyIdsByTabId === state.ptyIdsByTabId ? { ...state.ptyIdsByTabId } : nextPtyIdsByTabId
      nextPtyIdsByTabId[tab.id] = ptyIds
    }
  }
  let nextTerminalLayoutsByTabId = state.terminalLayoutsByTabId
  for (const removedId of removedTerminalIds) {
    if (nextTerminalLayoutsByTabId[removedId]) {
      nextTerminalLayoutsByTabId =
        nextTerminalLayoutsByTabId === state.terminalLayoutsByTabId
          ? { ...state.terminalLayoutsByTabId }
          : nextTerminalLayoutsByTabId
      delete nextTerminalLayoutsByTabId[removedId]
    }
  }
  for (const { tab, layout } of mirroredTerminalTabs) {
    if (!terminalLayoutEqual(nextTerminalLayoutsByTabId[tab.id], layout)) {
      nextTerminalLayoutsByTabId =
        nextTerminalLayoutsByTabId === state.terminalLayoutsByTabId
          ? { ...state.terminalLayoutsByTabId }
          : nextTerminalLayoutsByTabId
      nextTerminalLayoutsByTabId[tab.id] = layout
    }
  }
  let nextUnreadTerminalTabs = state.unreadTerminalTabs
  for (const removedId of removedTerminalIds) {
    if (nextUnreadTerminalTabs[removedId]) {
      nextUnreadTerminalTabs =
        nextUnreadTerminalTabs === state.unreadTerminalTabs
          ? { ...state.unreadTerminalTabs }
          : nextUnreadTerminalTabs
      delete nextUnreadTerminalTabs[removedId]
    }
  }
  let nextBrowserPagesByWorkspace = state.browserPagesByWorkspace
  let nextRemoteBrowserPageHandlesByPageId = state.remoteBrowserPageHandlesByPageId
  let nextBrowserCertificateFailuresByPageId = state.browserCertificateFailuresByPageId
  for (const removedWorkspaceId of removedBrowserWorkspaceIds) {
    const pages = nextBrowserPagesByWorkspace[removedWorkspaceId] ?? []
    if (nextBrowserPagesByWorkspace[removedWorkspaceId]) {
      nextBrowserPagesByWorkspace =
        nextBrowserPagesByWorkspace === state.browserPagesByWorkspace
          ? { ...state.browserPagesByWorkspace }
          : nextBrowserPagesByWorkspace
      delete nextBrowserPagesByWorkspace[removedWorkspaceId]
    }
    for (const page of pages) {
      if (nextBrowserCertificateFailuresByPageId[page.id]) {
        nextBrowserCertificateFailuresByPageId =
          nextBrowserCertificateFailuresByPageId === state.browserCertificateFailuresByPageId
            ? { ...state.browserCertificateFailuresByPageId }
            : nextBrowserCertificateFailuresByPageId
        delete nextBrowserCertificateFailuresByPageId[page.id]
      }
      if (nextRemoteBrowserPageHandlesByPageId[page.id]) {
        nextRemoteBrowserPageHandlesByPageId =
          nextRemoteBrowserPageHandlesByPageId === state.remoteBrowserPageHandlesByPageId
            ? { ...state.remoteBrowserPageHandlesByPageId }
            : nextRemoteBrowserPageHandlesByPageId
        delete nextRemoteBrowserPageHandlesByPageId[page.id]
      }
    }
  }
  for (const { page, certificateFailure, remotePageId } of mirroredBrowserTabs) {
    const current = nextBrowserPagesByWorkspace[page.workspaceId] ?? []
    if (!sameBrowserPages(current, [page])) {
      nextBrowserPagesByWorkspace =
        nextBrowserPagesByWorkspace === state.browserPagesByWorkspace
          ? { ...state.browserPagesByWorkspace }
          : nextBrowserPagesByWorkspace
      nextBrowserPagesByWorkspace[page.workspaceId] = [page]
    }
    const currentHandle = nextRemoteBrowserPageHandlesByPageId[page.id]
    if (
      currentHandle?.environmentId !== environmentId ||
      currentHandle.remotePageId !== remotePageId
    ) {
      nextRemoteBrowserPageHandlesByPageId =
        nextRemoteBrowserPageHandlesByPageId === state.remoteBrowserPageHandlesByPageId
          ? { ...state.remoteBrowserPageHandlesByPageId }
          : nextRemoteBrowserPageHandlesByPageId
      nextRemoteBrowserPageHandlesByPageId[page.id] = {
        environmentId,
        remotePageId
      }
    }
    if (
      !browserCertificateFailureEqual(
        nextBrowserCertificateFailuresByPageId[page.id],
        certificateFailure
      )
    ) {
      nextBrowserCertificateFailuresByPageId =
        nextBrowserCertificateFailuresByPageId === state.browserCertificateFailuresByPageId
          ? { ...state.browserCertificateFailuresByPageId }
          : nextBrowserCertificateFailuresByPageId
      if (certificateFailure) {
        nextBrowserCertificateFailuresByPageId[page.id] = certificateFailure
      } else {
        delete nextBrowserCertificateFailuresByPageId[page.id]
      }
    }
  }
  return {
    nextPtyIdsByTabId,
    nextTerminalLayoutsByTabId,
    nextUnreadTerminalTabs,
    nextBrowserPagesByWorkspace,
    nextRemoteBrowserPageHandlesByPageId,
    nextBrowserCertificateFailuresByPageId
  }
}
