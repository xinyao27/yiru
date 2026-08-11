import {
  BOUNDED_STATS_USAGE_RANGES,
  type StatsUsageBoundedRange
} from '@yiru/runtime-protocol/stats-usage-range'

import { translate } from '~/i18n/translate'

export const HOME_USAGE_RANGE_OPTIONS = BOUNDED_STATS_USAGE_RANGES.map((range) => ({
  label: usageRangeLabel(range),
  value: range
}))

export function usageRangeLabel(range: StatsUsageBoundedRange): string {
  switch (range) {
    case '7d':
      return translate('mobile.home.usageRange.sevenDays', '7 days')
    case '30d':
      return translate('mobile.home.usageRange.thirtyDays', '30 days')
    case '90d':
      return translate('mobile.home.usageRange.ninetyDays', '90 days')
  }
}
