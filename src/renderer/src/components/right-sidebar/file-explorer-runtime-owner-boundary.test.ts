import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

const root = process.cwd()

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

describe('right sidebar file/git runtime ownership boundaries', () => {
  it.each([
    'src/renderer/src/components/right-sidebar/use-file-explorer-tree.ts',
    'src/renderer/src/components/right-sidebar/use-file-explorer-import.ts',
    'src/renderer/src/components/right-sidebar/use-file-explorer-inline-input.ts',
    'src/renderer/src/components/right-sidebar/use-file-explorer-drag-drop.ts',
    'src/renderer/src/components/right-sidebar/use-file-duplicate.ts',
    'src/renderer/src/components/right-sidebar/use-file-deletion.ts',
    'src/renderer/src/components/right-sidebar/use-file-explorer-ignored-paths.ts',
    'src/renderer/src/components/right-sidebar/use-git-status-polling.ts',
    'src/renderer/src/components/right-sidebar/use-file-search-runner.ts',
    'src/renderer/src/components/quick-open-file-list.ts'
  ])('%s routes file/git requests by the selected worktree owner', (path) => {
    const text = source(path)

    expect(text).toMatch(
      /getRightSidebarWorktreeRuntimeSettings|getSettingsForWorktreeRuntimeOwner|getFileExplorerOperationOwner|getFileExplorerOperationRoute/
    )
    expect(text).not.toContain('settings: useAppStore.getState().settings')
    expect(text).not.toContain('const settings = useAppStore.getState().settings')
  })

  it('derives owner settings through the shared worktree runtime owner helper', () => {
    const text = source('src/renderer/src/components/right-sidebar/file-explorer-runtime-owner.ts')

    expect(text).toContain('getSettingsForWorktreeRuntimeOwner')
    expect(text).toContain('useAppStore.getState()')
  })
})
