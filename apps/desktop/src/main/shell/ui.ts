export type ShellWindowUiActions = {
  syncTrafficLights: (zoomFactor: number) => void
  setMarkdownEditorFocused: (focused: boolean) => void
  setTerminalInputFocused: (focused: boolean) => void
  setShortcutRecorderFocused: (focused: boolean) => void
  minimize: () => void
  maximize: () => void
  isMaximized: () => boolean
  isFullScreen: () => boolean
  requestClose: () => void
  popupMenu: () => void
  confirmWindowClose: () => void
}

const windowUiActions = new Map<number, ShellWindowUiActions>()

export function registerShellWindowUi(
  webContentsId: number,
  actions: ShellWindowUiActions
): () => void {
  windowUiActions.set(webContentsId, actions)
  return () => {
    if (windowUiActions.get(webContentsId) === actions) {
      windowUiActions.delete(webContentsId)
    }
  }
}

export function requireShellWindowUi(webContentsId: number | undefined): ShellWindowUiActions {
  const actions = webContentsId === undefined ? undefined : windowUiActions.get(webContentsId)
  if (!actions) {
    throw new Error('unavailable_on_host: shell window UI requires an Electron window')
  }
  return actions
}

export function readShellWindowUiState(
  webContentsId: number
): { isMaximized: boolean; isFullScreen: boolean } | null {
  const actions = windowUiActions.get(webContentsId)
  return actions
    ? { isMaximized: actions.isMaximized(), isFullScreen: actions.isFullScreen() }
    : null
}
