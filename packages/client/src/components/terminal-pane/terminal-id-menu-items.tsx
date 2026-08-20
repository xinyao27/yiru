import { Copy } from '~renderer/components/icons/hugeicons'
import { DropdownMenuItem } from '~renderer/components/ui/dropdown-menu'
import { translate } from '~renderer/i18n/i18n'

export function TerminalIdMenuItems({
  onCopyTerminalId,
  onCopyPaneId
}: {
  onCopyTerminalId: () => void
  onCopyPaneId: () => void
}): React.JSX.Element {
  return (
    <>
      <DropdownMenuItem onClick={onCopyTerminalId}>
        <Copy />
        {translate(
          'auto.components.terminal.pane.TerminalContextMenu.copyTerminalId',
          'Copy Terminal ID'
        )}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onCopyPaneId}>
        <Copy />
        {translate('auto.components.terminal.pane.TerminalContextMenu.2cf85a6a55', 'Copy Pane ID')}
      </DropdownMenuItem>
    </>
  )
}
