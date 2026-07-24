import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const mocks = vi.hoisted(() => ({
  activateAndRevealWorktree: vi.fn(),
  authorizeExternalPath: vi.fn(async () => true),
  openFile: vi.fn(),
  openFilePath: vi.fn(async () => true),
  setMarkdownViewMode: vi.fn(),
  setPendingEditorReveal: vi.fn(),
  statRuntimePath: vi.fn(async () => ({ isDirectory: false }))
}))

const state = {
  activeFileIdByWorktree: {} as Record<string, string | null>,
  createBrowserTab: vi.fn(),
  openFile: mocks.openFile,
  setMarkdownViewMode: mocks.setMarkdownViewMode,
  setPendingEditorReveal: mocks.setPendingEditorReveal,
  settings: {}
}

vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => null }))
vi.mock('@/lib/markdown-internal-links', () => ({ absolutePathToFileUri: (path: string) => path }))
vi.mock('@/lib/terminal-links', () => ({
  isPathInsideWorktree: (path: string, root: string) => path.startsWith(`${root}/`),
  toWorktreeRelativePath: (path: string, root: string) => path.slice(root.length + 1)
}))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: mocks.activateAndRevealWorktree
}))
vi.mock('@/runtime/runtime-file-client', () => ({
  isRemoteRuntimeFileOperation: () => true,
  statRuntimePath: mocks.statRuntimePath
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({ settingsForRuntimeOwner: () => ({}) }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
vi.mock('./terminal-worktree-path-link', () => ({ resolveKnownWorktreeRootPathLink: () => null }))

import { openDetectedFilePath } from './terminal-file-open-routing'

let nextFrameId = 0
let frameCallbacks = new Map<number, FrameRequestCallback>()

function flushFrame(): void {
  const callbacks = [...frameCallbacks.values()]
  frameCallbacks.clear()
  for (const callback of callbacks) {
    callback(0)
  }
}

async function flushAsync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  nextFrameId = 0
  frameCallbacks = new Map()
  state.activeFileIdByWorktree = {}
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextFrameId
    frameCallbacks.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frameCallbacks.delete(id))
  vi.stubGlobal('window', {
    api: {
      fs: { authorizeExternalPath: mocks.authorizeExternalPath },
      shell: { openFilePath: mocks.openFilePath }
    }
  })
  mocks.openFile.mockImplementation((file: { filePath: string; worktreeId: string }) => {
    state.activeFileIdByWorktree[file.worktreeId] = `owner:${file.worktreeId}:${file.filePath}`
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('openDetectedFilePath line reveals', () => {
  it.each([
    ['local', null],
    ['WSL', 'runtime:wsl:ubuntu'],
    ['SSH', 'runtime:ssh:host-1']
  ])('targets the owner-qualified %s editor and puts Markdown in source mode', async (_, owner) => {
    const filePath = '/repo/docs/architecture.md'
    openDetectedFilePath(filePath, 230, null, {
      worktreeId: 'worktree-1',
      worktreePath: '/repo',
      runtimeEnvironmentId: owner
    })
    await flushAsync()
    flushFrame()
    flushFrame()

    const fileId = `owner:worktree-1:${filePath}`
    expect(mocks.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath, runtimeEnvironmentId: owner }),
      { forceContentReload: true }
    )
    expect(mocks.setMarkdownViewMode).toHaveBeenCalledWith(fileId, 'source')
    expect(mocks.setPendingEditorReveal).toHaveBeenLastCalledWith({
      filePath,
      fileId,
      line: 230,
      column: 1,
      matchLength: 0
    })
  })

  it('drops a stale async reveal when a newer file link wins', async () => {
    let resolveFirst!: (value: { isDirectory: boolean }) => void
    mocks.statRuntimePath
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ isDirectory: false })

    openDetectedFilePath('/repo/first.ts', 10, null, {
      worktreeId: 'worktree-1',
      worktreePath: '/repo'
    })
    openDetectedFilePath('/repo/second.ts', 20, 3, {
      worktreeId: 'worktree-1',
      worktreePath: '/repo'
    })
    await flushAsync()
    flushFrame()
    flushFrame()

    resolveFirst({ isDirectory: false })
    await flushAsync()

    expect(mocks.openFile).toHaveBeenCalledTimes(1)
    expect(mocks.setPendingEditorReveal).toHaveBeenLastCalledWith(
      expect.objectContaining({ filePath: '/repo/second.ts', line: 20, column: 3 })
    )
  })
})
