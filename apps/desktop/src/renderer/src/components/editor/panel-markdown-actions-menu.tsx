import { DotsThree as MoreHorizontal } from '@phosphor-icons/react'
import type React from 'react'
import { Button } from '~renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~renderer/components/ui/dropdown-menu'
import { translate } from '~renderer/i18n/i18n'

type EditorPanelMarkdownActionsMenuProps = {
  isMarkdown: boolean
  isDiffSurface: boolean
  diffWordWrap: boolean
  shouldShowMarkdownExportAction: boolean
  canExportMarkdownToPdf: boolean
  canShowMarkdownFrontmatterToggle: boolean
  markdownFrontmatterVisible: boolean
  onToggleDiffWordWrap: () => void
  onToggleMarkdownFrontmatter: () => void
  onExportMarkdownToPdf: () => void
}

export function EditorPanelMarkdownActionsMenu({
  isMarkdown,
  isDiffSurface,
  diffWordWrap,
  shouldShowMarkdownExportAction,
  canExportMarkdownToPdf,
  canShowMarkdownFrontmatterToggle,
  markdownFrontmatterVisible,
  onToggleDiffWordWrap,
  onToggleMarkdownFrontmatter,
  onExportMarkdownToPdf
}: EditorPanelMarkdownActionsMenuProps): React.JSX.Element | null {
  const hasMarkdownActions =
    isMarkdown && (shouldShowMarkdownExportAction || canShowMarkdownFrontmatterToggle)
  if (!isDiffSurface && !hasMarkdownActions) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          // Why: lives in the editor header ButtonGroup beside view-mode/TOC
          // segments. Default Button size uses has-[>svg]:px-3 which widens
          // icon-only triggers past the shared 23×30/px-2 segment chrome.
          <Button
            variant="outline"
            type="button"
            className="h-[23px] w-[30px] shrink-0 px-2 py-0 focus:z-10 focus-visible:z-10 has-[>svg]:px-2"
            aria-label={translate(
              'auto.components.editor.EditorPanelMarkdownActionsMenu.561251019a',
              'More actions'
            )}
            title={translate(
              'auto.components.editor.EditorPanelMarkdownActionsMenu.561251019a',
              'More actions'
            )}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={4}>
        {isDiffSurface ? (
          <>
            <DropdownMenuCheckboxItem checked={diffWordWrap} onCheckedChange={onToggleDiffWordWrap}>
              {translate(
                'auto.components.editor.EditorPanelMarkdownActionsMenu.1eef809708',
                'Word Wrap'
              )}
            </DropdownMenuCheckboxItem>
            {hasMarkdownActions ? <DropdownMenuSeparator /> : null}
          </>
        ) : null}
        {canShowMarkdownFrontmatterToggle ? (
          <>
            <DropdownMenuItem
              onClick={(event) => {
                event.preventDefault()
                onToggleMarkdownFrontmatter()
              }}
              closeOnClick={false}
            >
              {markdownFrontmatterVisible
                ? translate(
                    'auto.components.editor.EditorPanelMarkdownActionsMenu.10c39d58c1',
                    'Hide front matter'
                  )
                : translate(
                    'auto.components.editor.EditorPanelMarkdownActionsMenu.8c8b7f5ff5',
                    'Show front matter'
                  )}
            </DropdownMenuItem>
            {shouldShowMarkdownExportAction ? <DropdownMenuSeparator /> : null}
          </>
        ) : null}
        {shouldShowMarkdownExportAction ? (
          <DropdownMenuItem
            // Why: source/Monaco fallbacks have no rendered document DOM to export.
            disabled={!canExportMarkdownToPdf}
            onClick={onExportMarkdownToPdf}
          >
            {translate(
              'auto.components.editor.EditorPanelMarkdownActionsMenu.3e0ce48c24',
              'Export as PDF'
            )}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
