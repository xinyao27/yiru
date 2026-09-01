import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  TextAa as CaseSensitive,
  Swap as Replace,
  BracketsSquare as WholeWord,
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  CaretUp as ChevronUp,
  ArrowsClockwise as ReplaceAll,
  X
} from '~renderer/icons/hugeicons'
import { useOptionalShortcutLabel } from '~renderer/keyboard-input/use-shortcut-label'
import { Button } from '~renderer/ui/button'
import { Input } from '~renderer/ui/input'

type RichMarkdownSearchBarProps = {
  activeMatchIndex: number
  isOpen: boolean
  isReplaceMode: boolean
  matchCase: boolean
  matchCount: number
  query: string
  replaceQuery: string
  replaceDisabled: boolean
  searchInputRef: React.RefObject<HTMLInputElement | null>
  wholeWord: boolean
  onClose: () => void
  onMoveToMatch: (direction: 1 | -1) => void
  onQueryChange: (query: string) => void
  onReplaceAll: () => void
  onReplaceCurrent: () => void
  onReplaceQueryChange: (query: string) => void
  onToggleMatchCase: () => void
  onToggleReplaceMode: () => void
  onToggleWholeWord: () => void
}

export function RichMarkdownSearchBar({
  activeMatchIndex,
  isOpen,
  isReplaceMode,
  matchCase,
  matchCount,
  query,
  replaceQuery,
  replaceDisabled,
  searchInputRef,
  wholeWord,
  onClose,
  onMoveToMatch,
  onQueryChange,
  onReplaceAll,
  onReplaceCurrent,
  onReplaceQueryChange,
  onToggleMatchCase,
  onToggleReplaceMode,
  onToggleWholeWord
}: RichMarkdownSearchBarProps): React.JSX.Element | null {
  // Why: surface the same replace shortcut the source editor uses so the toggle
  // is discoverable; reads the user's effective binding, formatted per platform.
  const replaceShortcut = useOptionalShortcutLabel('editor.replace')
  const readOnlyExplanationId = React.useId()

  if (!isOpen) {
    return null
  }

  const keepSearchFocus = (event: React.MouseEvent<HTMLButtonElement>): void => {
    // Why: rich-mode find drives navigation through the ProseMirror selection.
    // Letting the toolbar buttons take focus interrupts that selection flow and
    // makes mouse-based next/previous navigation appear broken.
    event.preventDefault()
  }

  const noMatches = matchCount === 0
  const readOnlyReplaceExplanation = translate(
    'auto.components.editor.RichMarkdownSearchBar.preservedRichContentReadOnly',
    'Preserved rich content is read-only in rich mode.'
  )
  const toggleReplaceLabel = isReplaceMode
    ? translate('auto.components.editor.RichMarkdownSearchBar.e8c147435f', 'Hide replace')
    : translate('auto.components.editor.RichMarkdownSearchBar.9cdc38be33', 'Toggle replace')
  const toggleReplaceTitle = replaceShortcut
    ? `${toggleReplaceLabel} (${replaceShortcut})`
    : toggleReplaceLabel

  return (
    <div
      // Why: overlay the editor like Monaco's find widget instead of occupying
      // layout space — otherwise opening cmd+f shifts the document content down.
      className="border-border bg-background absolute top-2 right-3 z-20 flex w-fit max-w-[min(calc(100%-24px),520px)] items-stretch gap-0.5 border py-1 pr-1 pl-0.5"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Button
        type="button"
        variant="quiet"
        size="icon-xs"
        onMouseDown={keepSearchFocus}
        onClick={onToggleReplaceMode}
        title={toggleReplaceTitle}
        aria-label={translate(
          'auto.components.editor.RichMarkdownSearchBar.9cdc38be33',
          'Toggle replace'
        )}
        aria-expanded={isReplaceMode}
        // Why: the expand toggle spans both rows on the left like the source
        // editor's find widget, so it stays vertically centered across the
        // find/replace stack.
        className="h-auto w-4 min-w-4 self-stretch p-0"
      >
        {isReplaceMode ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </Button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center">
          <div className="border-ring bg-background flex w-[240px] min-w-0 flex-initial items-center gap-px border pr-0.5">
            <Input
              ref={searchInputRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.shiftKey) {
                  event.preventDefault()
                  onMoveToMatch(-1)
                  return
                }
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onMoveToMatch(1)
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onClose()
                }
              }}
              placeholder={translate(
                'auto.components.editor.RichMarkdownSearchBar.98b89276f3',
                'Find in rich editor'
              )}
              className="h-7 min-w-0 flex-1 !border-0 bg-transparent px-2 text-[13px] leading-none focus-visible:!border-0"
              aria-label={translate(
                'auto.components.editor.RichMarkdownSearchBar.158c645829',
                'Find in rich markdown editor'
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onMouseDown={keepSearchFocus}
              onClick={onToggleMatchCase}
              data-active={matchCase ? 'true' : undefined}
              aria-pressed={matchCase}
              title={translate(
                'auto.components.editor.RichMarkdownSearchBar.482b637099',
                'Match case'
              )}
              aria-label={translate(
                'auto.components.editor.RichMarkdownSearchBar.482b637099',
                'Match case'
              )}
              className="text-muted-foreground hover:text-foreground data-[active=true]:text-foreground h-[22px] w-[22px] min-w-[22px] flex-none border border-transparent p-0 hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] data-[active=true]:border-[color-mix(in_srgb,var(--foreground)_20%,transparent)] data-[active=true]:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]"
            >
              <CaseSensitive size={14} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onMouseDown={keepSearchFocus}
              onClick={onToggleWholeWord}
              data-active={wholeWord ? 'true' : undefined}
              aria-pressed={wholeWord}
              title={translate(
                'auto.components.editor.RichMarkdownSearchBar.68d090241d',
                'Match whole word'
              )}
              aria-label={translate(
                'auto.components.editor.RichMarkdownSearchBar.68d090241d',
                'Match whole word'
              )}
              className="text-muted-foreground hover:text-foreground data-[active=true]:text-foreground h-[22px] w-[22px] min-w-[22px] flex-none border border-transparent p-0 hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] data-[active=true]:border-[color-mix(in_srgb,var(--foreground)_20%,transparent)] data-[active=true]:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)]"
            >
              <WholeWord size={14} />
            </Button>
          </div>
          <div className="text-muted-foreground min-w-0 flex-none px-1.5 text-xs leading-none whitespace-nowrap tabular-nums">
            {query && noMatches
              ? translate('auto.components.editor.RichMarkdownSearchBar.a86958d508', 'No results')
              : `${noMatches ? 0 : activeMatchIndex + 1}/${matchCount}`}
          </div>
          <Button
            type="button"
            variant="quiet"
            size="icon-xs"
            onMouseDown={keepSearchFocus}
            onClick={() => onMoveToMatch(-1)}
            disabled={noMatches}
            title={translate(
              'auto.components.editor.RichMarkdownSearchBar.32ae8d7d57',
              'Previous match'
            )}
            aria-label={translate(
              'auto.components.editor.RichMarkdownSearchBar.32ae8d7d57',
              'Previous match'
            )}
            className="h-[22px] w-[22px] min-w-[22px] p-0"
          >
            <ChevronUp size={14} />
          </Button>
          <Button
            type="button"
            variant="quiet"
            size="icon-xs"
            onMouseDown={keepSearchFocus}
            onClick={() => onMoveToMatch(1)}
            disabled={noMatches}
            title={translate(
              'auto.components.editor.RichMarkdownSearchBar.f7bcecbe26',
              'Next match'
            )}
            aria-label={translate(
              'auto.components.editor.RichMarkdownSearchBar.f7bcecbe26',
              'Next match'
            )}
            className="h-[22px] w-[22px] min-w-[22px] p-0"
          >
            <ChevronDown size={14} />
          </Button>
          <div className="bg-border mx-0.5 h-4 w-px" />
          <Button
            type="button"
            variant="quiet"
            size="icon-xs"
            onMouseDown={keepSearchFocus}
            onClick={onClose}
            title={translate(
              'auto.components.editor.RichMarkdownSearchBar.de68b75bde',
              'Close search'
            )}
            aria-label={translate(
              'auto.components.editor.RichMarkdownSearchBar.de68b75bde',
              'Close search'
            )}
            className="h-[22px] w-[22px] min-w-[22px] p-0"
          >
            <X size={14} />
          </Button>
        </div>
        {isReplaceMode ? (
          <div className="flex min-w-0 items-center">
            <div className="border-ring bg-background flex w-[240px] min-w-0 flex-initial items-center gap-px border pr-0.5">
              <Input
                value={replaceQuery}
                onChange={(event) => onReplaceQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onReplaceCurrent()
                    return
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onClose()
                  }
                }}
                placeholder={translate(
                  'auto.components.editor.RichMarkdownSearchBar.fd97c7e585',
                  'Replace'
                )}
                className="h-7 min-w-0 flex-1 !border-0 bg-transparent px-2 text-[13px] leading-none focus-visible:!border-0"
                aria-label={translate(
                  'auto.components.editor.RichMarkdownSearchBar.44682b4159',
                  'Replace in rich markdown editor'
                )}
                aria-describedby={replaceDisabled ? readOnlyExplanationId : undefined}
              />
            </div>
            <Button
              type="button"
              variant="quiet"
              size="icon-xs"
              onMouseDown={keepSearchFocus}
              onClick={onReplaceCurrent}
              disabled={noMatches || replaceDisabled}
              title={
                replaceDisabled
                  ? readOnlyReplaceExplanation
                  : translate('auto.components.editor.RichMarkdownSearchBar.fd97c7e585', 'Replace')
              }
              aria-label={translate(
                'auto.components.editor.RichMarkdownSearchBar.fd97c7e585',
                'Replace'
              )}
              className="h-[22px] w-[22px] min-w-[22px] p-0"
            >
              <Replace size={14} />
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="icon-xs"
              onMouseDown={keepSearchFocus}
              onClick={onReplaceAll}
              disabled={noMatches || replaceDisabled}
              title={
                replaceDisabled
                  ? readOnlyReplaceExplanation
                  : translate(
                      'auto.components.editor.RichMarkdownSearchBar.c2884f5e95',
                      'Replace all'
                    )
              }
              aria-label={translate(
                'auto.components.editor.RichMarkdownSearchBar.c2884f5e95',
                'Replace all'
              )}
              className="h-[22px] w-[22px] min-w-[22px] p-0"
            >
              <ReplaceAll size={14} />
            </Button>
            {replaceDisabled ? (
              <span id={readOnlyExplanationId} className="sr-only" role="status">
                {readOnlyReplaceExplanation}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
