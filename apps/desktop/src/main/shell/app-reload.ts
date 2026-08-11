type ShellAppReloader = () => void

const reloaders = new Map<number, ShellAppReloader>()

export function registerShellAppReloader(
  webContentsId: number,
  reloader: ShellAppReloader
): () => void {
  reloaders.set(webContentsId, reloader)
  return () => reloaders.delete(webContentsId)
}

export function reloadShellApp(webContentsId: number): void {
  reloaders.get(webContentsId)?.()
}
