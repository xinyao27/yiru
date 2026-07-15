import type { SpoolSessionCatalogPageState } from '../../../../shared/spool/spool-catalog-contract'
import { translate } from '@/i18n/i18n'

export function getSpoolSessionCatalogStatusLabel(
  status: SpoolSessionCatalogPageState['status']
): string | null {
  switch (status) {
    case 'loading':
      return translate(
        'auto.components.sidebar.SpoolWorktreeRow.loadingSessions',
        'Loading sessions…'
      )
    case 'error':
      return translate(
        'auto.components.sidebar.SpoolWorktreeRow.sessionsUnavailable',
        'Session list unavailable'
      )
    case 'complete':
      return null
  }
}
