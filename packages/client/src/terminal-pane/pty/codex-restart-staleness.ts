import { useAppStore } from '~renderer/store/state'

let noticesSource: Record<
  string,
  { previousAccountLabel: string; nextAccountLabel: string }
> | null = null
let hasNotices = false

function hasCodexRestartNotices(
  noticesByPtyId: Record<string, { previousAccountLabel: string; nextAccountLabel: string }>
): boolean {
  if (noticesSource !== noticesByPtyId) {
    noticesSource = noticesByPtyId
    hasNotices = Object.keys(noticesByPtyId).length > 0
  }
  return hasNotices
}

export function isCodexPaneStale(args: {
  tabId: string
  worktreeId: string
  panePtyId: string | null
}): boolean {
  const state = useAppStore.getState()
  const { codexRestartNoticeByPtyId } = state
  if (!hasCodexRestartNotices(codexRestartNoticeByPtyId)) {
    return false
  }
  if (args.panePtyId && codexRestartNoticeByPtyId[args.panePtyId]) {
    return true
  }
  const tab = (state.tabsByWorktree[args.worktreeId] ?? []).find((entry) => entry.id === args.tabId)
  return Boolean(tab?.ptyId && codexRestartNoticeByPtyId[tab.ptyId])
}
