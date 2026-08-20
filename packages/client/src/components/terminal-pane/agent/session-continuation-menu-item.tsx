import { ChatCentered as MessageSquarePlus } from '~renderer/components/icons/hugeicons'
import { DropdownMenuItem } from '~renderer/components/ui/dropdown-menu'
import { translate } from '~renderer/i18n/i18n'

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
