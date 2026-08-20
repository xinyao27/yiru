import { IntegrationStatusPill } from '~renderer/components/integration-status-pill'
import { translate } from '~renderer/i18n/i18n'
import { getSkillFreshnessDisplayStatus } from '~renderer/lib/skill-freshness-display-status'

import { useSkillFreshness } from './use-skill-freshness'

// Why: the setup rails' Installed pill is presence-only; when freshness knows a
// safe update exists (or that every copy is current) the pill should say so.
// Falls back to plain Installed for blocked/unrecognized copies so an unsafe
// placement is never advertised as updatable here.
export function SkillFreshnessStatusPill({ skillName }: { skillName: string }): React.JSX.Element {
  const { inventory } = useSkillFreshness()
  const status = getSkillFreshnessDisplayStatus(inventory, skillName)
  if (status === 'update-available') {
    return (
      <IntegrationStatusPill tone="attention">
        {translate(
          'auto.components.skills.SkillFreshnessStatusPill.updateAvailable',
          'Update available'
        )}
      </IntegrationStatusPill>
    )
  }
  if (status === 'up-to-date') {
    return (
      <IntegrationStatusPill tone="connected">
        {translate('auto.components.skills.SkillFreshnessStatusPill.upToDate', 'Up to date')}
      </IntegrationStatusPill>
    )
  }
  return (
    <IntegrationStatusPill tone="connected">
      {translate('auto.components.skills.SkillFreshnessStatusPill.installed', 'Installed')}
    </IntegrationStatusPill>
  )
}
