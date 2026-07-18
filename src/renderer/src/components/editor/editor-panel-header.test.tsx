import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { OpenFile } from '@/store/slices/editor'
import { EditorPanelHeader } from './editor-panel-header'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeGroupIdByWorktree: {},
      settings: {},
      updateSettings: vi.fn()
    })
}))

vi.mock('@/store/worktree-diff-comments-selector', () => ({
  selectWorktreeDiffCommentsOrEmpty: () => []
}))

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  ),
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('./editor-panel-header-path', () => ({
  EditorPanelHeaderPath: () => null
}))

vi.mock('./editor-panel-markdown-actions-menu', () => ({
  EditorPanelMarkdownActionsMenu: () => null
}))

vi.mock('./diff-navigation-context', () => ({
  useDiffNavigation: () => ({
    changeCount: 2,
    goToPreviousDiff: vi.fn(),
    goToNextDiff: vi.fn()
  })
}))

const activeFile: OpenFile = {
  id: 'diff:/repo/file.ts',
  filePath: '/repo/file.ts',
  relativePath: 'file.ts',
  worktreeId: 'repo::/repo',
  language: 'typescript',
  isDirty: false,
  mode: 'diff'
}

describe('EditorPanelHeader', () => {
  it('labels both diff navigation controls', () => {
    const html = renderToStaticMarkup(
      <EditorPanelHeader
        activeFile={activeFile}
        copiedPathVisible={false}
        isSingleDiff={false}
        isDiffSurface
        isMarkdown={false}
        isCsv={false}
        isNotebook={false}
        hasEditorToggle={false}
        availableEditorToggleModes={[]}
        effectiveToggleValue="edit"
        canOpenPreviewToSide={false}
        canShowMarkdownPreview={false}
        canShowMarkdownTableOfContents={false}
        isMarkdownTableOfContentsDisabled={false}
        shouldShowMarkdownExportAction={false}
        canExportMarkdownToPdf={false}
        showMarkdownTableOfContents={false}
        canShowMarkdownFrontmatterToggle={false}
        markdownFrontmatterVisible={false}
        sideBySide={false}
        openFileState={{ canOpen: false }}
        onCopyPath={vi.fn()}
        onOpenDiffTargetFile={vi.fn()}
        onOpenPreviewToSide={vi.fn()}
        onOpenMarkdownPreview={vi.fn()}
        onOpenContainingFolder={vi.fn()}
        onToggleSideBySide={vi.fn()}
        onEditorToggleChange={vi.fn()}
        onToggleMarkdownTableOfContents={vi.fn()}
        onToggleMarkdownFrontmatter={vi.fn()}
        onExportMarkdownToPdf={vi.fn()}
      />
    )

    expect(html).toContain('aria-label="Previous change"')
    expect(html).toContain('aria-label="Next change"')
  })
})
