import type { OpenFile } from '~renderer/editor/state'
import { dirname } from '~renderer/path'

type UntitledPathFile = Pick<OpenFile, 'filePath' | 'relativePath'>

export function getUntitledFileRoot(file: UntitledPathFile, worktreePath?: string | null): string {
  if (worktreePath) {
    return worktreePath
  }

  if (!file.relativePath) {
    return dirname(file.filePath)
  }

  const rootLength = file.filePath.length - file.relativePath.length - 1
  if (rootLength <= 0) {
    return dirname(file.filePath)
  }

  return file.filePath.slice(0, rootLength)
}
