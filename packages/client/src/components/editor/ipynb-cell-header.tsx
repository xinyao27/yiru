import {
  BracketsCurly as Braces,
  FileCode as FileCode2,
  Play,
  Trash as Trash2,
  ArrowLineDown as ArrowDownToLine,
  ArrowLineUp as ArrowUpToLine,
  ArrowDown as MoveDown,
  ArrowUp as MoveUp
} from '~renderer/components/icons/hugeicons'
import { LoadingIndicator } from '~renderer/components/loading-indicator'
import { ShortcutKeyCombo } from '~renderer/components/shortcut-key-combo'
import { Button } from '~renderer/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~renderer/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import type { ShortcutKeyComboDetails } from '~renderer/hooks/use-shortcut-label'
import { translate } from '~renderer/i18n/i18n'

import type { IpynbCell, IpynbCellKind } from './ipynb-types'

export function NotebookCellHeader({
  cell,
  index,
  running,
  canMoveUp,
  canMoveDown,
  onRun,
  onKindChange,
  onInsertAbove,
  onInsertBelow,
  onMoveUp,
  onMoveDown,
  onDelete
}: {
  cell: IpynbCell
  index: number
  running: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onRun: () => void
  onKindChange: (kind: IpynbCellKind) => void
  onInsertAbove: (kind: IpynbCellKind) => void
  onInsertBelow: (kind: IpynbCellKind) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}): React.JSX.Element {
  const Icon = cell.kind === 'code' ? Play : cell.kind === 'markdown' ? FileCode2 : Braces
  const executionLabel = cell.kind === 'code' ? `In [${cell.executionCount ?? ' '}]:` : cell.kind
  return (
    <div className="border-border/50 bg-muted/20 text-muted-foreground flex items-center gap-2 border-b px-3 py-1.5 text-xs">
      <Icon className="size-3.5" />
      <span className="font-mono">{executionLabel}</span>
      <Select
        value={cell.kind}
        onValueChange={(value) => {
          if (value) {
            onKindChange(value as IpynbCellKind)
          }
        }}
      >
        <SelectTrigger size="xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="code">
            {translate('auto.components.editor.IpynbViewer.7005960d73', 'Code')}
          </SelectItem>
          <SelectItem value="markdown">
            {translate('auto.components.editor.IpynbViewer.1833dbbc43', 'Markdown')}
          </SelectItem>
          <SelectItem value="raw">
            {translate('auto.components.editor.IpynbViewer.3e4cbf15ea', 'Raw')}
          </SelectItem>
        </SelectContent>
      </Select>
      {cell.kind === 'code' ? (
        <NotebookHeaderButton
          label={translate('auto.components.editor.IpynbViewer.859bf9fc21', 'Run cell')}
          disabled={running}
          onClick={onRun}
        >
          {running ? <LoadingIndicator className="size-3.5" /> : <Play className="size-3.5" />}
        </NotebookHeaderButton>
      ) : null}
      <NotebookHeaderButton
        label={translate('auto.components.editor.IpynbViewer.fd8ac707bc', 'Move cell up')}
        disabled={!canMoveUp}
        onClick={onMoveUp}
      >
        <MoveUp className="size-3.5" />
      </NotebookHeaderButton>
      <NotebookHeaderButton
        label={translate('auto.components.editor.IpynbViewer.27e064e2db', 'Move cell down')}
        disabled={!canMoveDown}
        onClick={onMoveDown}
      >
        <MoveDown className="size-3.5" />
      </NotebookHeaderButton>
      <NotebookHeaderButton
        label={translate('auto.components.editor.IpynbViewer.53b839b8a0', 'Insert code cell above')}
        onClick={() => onInsertAbove('code')}
      >
        <ArrowUpToLine className="size-3.5" />
      </NotebookHeaderButton>
      <NotebookHeaderButton
        label={translate('auto.components.editor.IpynbViewer.b4208cad7e', 'Insert code cell below')}
        onClick={() => onInsertBelow('code')}
      >
        <ArrowDownToLine className="size-3.5" />
      </NotebookHeaderButton>
      <NotebookHeaderButton
        label={translate(
          'auto.components.editor.IpynbViewer.ffc1ac2699',
          'Insert markdown cell above'
        )}
        onClick={() => onInsertAbove('markdown')}
      >
        <span className="relative size-4">
          <FileCode2 className="absolute top-0.5 left-0.5 size-3" />
          <MoveUp className="absolute -top-0.5 -right-0.5 size-2.5" />
        </span>
      </NotebookHeaderButton>
      <NotebookHeaderButton
        label={translate(
          'auto.components.editor.IpynbViewer.b42f6a9547',
          'Insert markdown cell below'
        )}
        onClick={() => onInsertBelow('markdown')}
      >
        <span className="relative size-4">
          <FileCode2 className="absolute top-0.5 left-0.5 size-3" />
          <MoveDown className="absolute -right-0.5 -bottom-0.5 size-2.5" />
        </span>
      </NotebookHeaderButton>
      <NotebookHeaderButton
        label={translate('auto.components.editor.IpynbViewer.781abd6926', 'Delete cell')}
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
      </NotebookHeaderButton>
      <span className="ml-auto font-mono">#{index + 1}</span>
    </div>
  )
}

export function NotebookHeaderButton({
  label,
  disabled = false,
  shortcut,
  onClick,
  children
}: {
  label: string
  disabled?: boolean
  shortcut?: ShortcutKeyComboDetails
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>
        <span className="flex items-center gap-2">
          <span>{label}</span>
          {shortcut && shortcut.keys.length > 0 ? (
            <ShortcutKeyCombo
              keys={shortcut.keys}
              variant="inverted"
              doubleTap={shortcut.doubleTap}
            />
          ) : null}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
