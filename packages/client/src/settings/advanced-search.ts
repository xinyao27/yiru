import { getAdvancedNetworkSearchEntries } from './advanced-network-search'
import type { SettingsSearchEntry } from './search'

export function getAdvancedPaneSearchEntries(): SettingsSearchEntry[] {
  return getAdvancedNetworkSearchEntries()
}
