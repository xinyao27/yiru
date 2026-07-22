import {
  Code,
  Eye,
  FileText,
  GitDiff as GitCompareArrows,
  Notebook as NotebookText,
  Pencil,
  Table as TableIcon,
  type Icon as PhosphorIcon
} from '@phosphor-icons/react'
import React from 'react'
import { useTranslation } from 'react-i18next'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { MarkdownViewMode } from '@/store/slices/editor'

// Why: 'changes' is not a MarkdownViewMode in the store — it lives on the
// orthogonal editorViewMode slice. This toggle unifies both dimensions into a
// single segmented control because they are mutually exclusive at render time:
// a file can show Source, Rich, Preview, Edit, OR Changes, but never two at
// once. 'edit' is the code-file counterpart to markdown's 'source' — it means
// "the normal editor for this file" without implying the markdown source/raw
// distinction. See reviews/changes-view-mode-plan.md.
export type EditorToggleValue = MarkdownViewMode | 'edit' | 'changes'

type ViewModeMetadata = { label: string; icon: PhosphorIcon; title?: string }

const DEFAULT_VIEW_MODE_METADATA: Record<EditorToggleValue, ViewModeMetadata> = {
  source: {
    get label() {
      return translate('auto.components.editor.EditorViewToggle.4d6ccb7ba6', 'Source')
    },
    icon: Code
  },
  rich: {
    get label() {
      return translate('auto.components.editor.EditorViewToggle.aff15f94f5', 'Rich Editor')
    },
    icon: Pencil
  },
  preview: {
    get label() {
      return translate('auto.components.editor.EditorViewToggle.0d193dc03c', 'Preview')
    },
    icon: Eye
  },
  edit: {
    get label() {
      return translate('auto.components.editor.EditorViewToggle.ac3bb87913', 'Edit')
    },
    icon: FileText
  },
  changes: {
    get label() {
      return translate('auto.components.editor.EditorViewToggle.4837f3f578', 'Changes')
    },
    icon: GitCompareArrows,
    // Why: "Changes" collides with the Source Control sidebar's "Branch
    // Changes" section, which diffs against the base ref. This toggle shows
    // uncommitted changes (working tree vs HEAD), so disambiguate in the
    // hover title without repeating the button label.
    get title() {
      return translate('auto.components.editor.EditorViewToggle.167f45888c', 'Uncommitted changes')
    }
  }
}

// Why: CSV/TSV files reuse the 'rich' view mode slot but the rendered surface
// is a read-only table, not an editor. The Pencil icon implies editability,
// which we don't offer, so callers can override the per-mode presentation.
export const CSV_VIEW_MODE_METADATA: Partial<Record<MarkdownViewMode, ViewModeMetadata>> = {
  rich: {
    get label() {
      return translate('auto.components.editor.EditorViewToggle.e408aa9cd5', 'Table')
    },
    icon: TableIcon
  }
}

export const NOTEBOOK_VIEW_MODE_METADATA: Partial<Record<MarkdownViewMode, ViewModeMetadata>> = {
  rich: {
    get label() {
      return translate('auto.components.editor.EditorViewToggle.b3410cd5e0', 'Notebook')
    },
    icon: NotebookText
  }
}

type EditorViewToggleProps = {
  value: EditorToggleValue
  modes: readonly EditorToggleValue[]
  onChange: (value: EditorToggleValue) => void
  metadataOverride?: Partial<Record<MarkdownViewMode, ViewModeMetadata>>
}

export default function EditorViewToggle({
  value,
  modes,
  onChange,
  metadataOverride
}: EditorViewToggleProps): React.JSX.Element {
  // Why: metadata labels are lightweight getters, so subscribe this compact
  // control to repaint when the active language changes.
  useTranslation()
  return (
    <TooltipProvider delay={300}>
      <ToggleGroup
        size="sm"
        className="h-[23px] [&_[data-slot=toggle-group-item]]:h-[23px] [&_[data-slot=toggle-group-item]]:min-w-[24px] [&_[data-slot=toggle-group-item]]:px-2"
        variant="outline"
        value={[value]}
        onValueChange={(v) => {
          const next = v[0]
          if (next) {
            onChange(next as EditorToggleValue)
          }
        }}
      >
        {modes.map((viewMode) => {
          // Why: metadataOverride is keyed by MarkdownViewMode (source/rich/preview)
          // because only those slots have language-specific presentation variants
          // (e.g. CSV's "Table" label on the 'rich' slot). 'edit'/'changes' are
          // orthogonal toggle values and always use the default metadata.
          const override = (
            metadataOverride as Partial<Record<EditorToggleValue, ViewModeMetadata>> | undefined
          )?.[viewMode]
          const metadata = override ?? DEFAULT_VIEW_MODE_METADATA[viewMode]
          const Icon = metadata.icon
          const tooltipLabel = metadata.title ?? metadata.label
          return (
            <Tooltip key={viewMode}>
              <TooltipTrigger
                render={
                  <ToggleGroupItem
                    value={viewMode}
                    aria-label={metadata.label}
                    className="aria-[checked=true]:border-foreground/20 aria-[checked=true]:bg-foreground/10 aria-[checked=true]:text-foreground aria-[checked=true]:hover:bg-foreground/15 aria-[checked=true]:hover:text-foreground data-[state=on]:border-foreground/20 data-[state=on]:bg-foreground/10 data-[state=on]:text-foreground data-[state=on]:hover:bg-foreground/15 data-[state=on]:hover:text-foreground h-[23px] min-w-[24px] px-2"
                  >
                    <Icon className="size-3.5" />
                  </ToggleGroupItem>
                }
              />
              <TooltipContent side="top" sideOffset={4}>
                {tooltipLabel}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </ToggleGroup>
    </TooltipProvider>
  )
}
