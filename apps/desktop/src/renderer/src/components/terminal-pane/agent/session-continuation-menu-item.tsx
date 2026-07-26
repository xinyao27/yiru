import { ChatCentered as MessageSquarePlus } from '@phosphor-icons/react'

import { translate } from '../../../i18n/i18n'
import { DropdownMenuItem } from '../../ui/dropdown-menu'

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
