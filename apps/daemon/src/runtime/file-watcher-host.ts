import type { FsChangeEvent } from '@yiru/runtime-protocol/workbench/types'

import { closeBunFileExplorerWatchers, watchFileExplorerWithBun } from './host/bun-file-watcher'

export function closeFileExplorerWatchers(rootPath: string): void {
  closeBunFileExplorerWatchers(rootPath)
}

export function watchFileExplorer(
  rootPath: string,
  callback: (events: FsChangeEvent[]) => void,
  onTerminalError: (error: Error) => void,
  signal?: AbortSignal
): () => Promise<void> {
  return watchFileExplorerWithBun(rootPath, callback, onTerminalError, signal)
}
