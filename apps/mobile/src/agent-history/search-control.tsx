import { MobileSearchField } from '~/components/search-field'

import type { MobileAgentHistorySearchControlProps } from './search-control-props'

export function MobileAgentHistorySearchControl({
  onChangeText,
  value
}: MobileAgentHistorySearchControlProps): React.JSX.Element {
  return (
    <MobileSearchField
      onChangeText={onChangeText}
      placeholder="Search sessions, repo:, path:"
      value={value}
    />
  )
}
