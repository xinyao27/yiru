import { translate } from '~renderer/i18n/i18n'
import { ChatCentered as MessageSquarePlus } from '~renderer/icons/hugeicons'
import { DropdownMenuItem } from '~renderer/ui/dropdown-menu'

type AgentSessionContinuationMenuItemProps = {
  onSelect: () => void
}

export function AgentSessionContinuationMenuItem({
  onSelect
}: AgentSessionContinuationMenuItemProps): React.JSX.Element {
  return (
    <DropdownMenuItem onClick={onSelect}>
      <MessageSquarePlus />
      {translate(
        'components.agentSessionContinuation.continueInNewSession',
        'Continue in New Session…'
      )}
    </DropdownMenuItem>
  )
}
