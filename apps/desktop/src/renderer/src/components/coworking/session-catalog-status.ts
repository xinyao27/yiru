import { translate } from '@/i18n/i18n'

import type { CoworkingSessionCatalogPageState } from '../../../../shared/coworking/catalog-contract'

export function getCoworkingSessionCatalogStatusLabel(
  status: CoworkingSessionCatalogPageState['status']
): string | null {
  switch (status) {
    case 'loading':
      return translate(
        'auto.components.sidebar.CoworkingWorktreeRow.loadingSessions',
        'Loading sessions…'
      )
    case 'error':
      return translate(
        'auto.components.sidebar.CoworkingWorktreeRow.sessionsUnavailable',
        'Session list unavailable'
      )
    case 'complete':
      return null
  }
}
