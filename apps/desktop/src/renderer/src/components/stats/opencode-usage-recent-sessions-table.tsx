import { translate } from '@/i18n/i18n'

import type { OpenCodeUsageSessionRow } from '../../../../shared/opencode-usage-types'
import { formatSessionTime, formatTokens } from './usage-formatters'

export function OpenCodeUsageRecentSessionsTable({
  recentSessions
}: {
  recentSessions: OpenCodeUsageSessionRow[]
}): React.JSX.Element {
  return (
    <section className="border-border/60 bg-card/40 rounded-lg border p-4">
      <div className="mb-3">
        <h4 className="text-foreground text-sm font-semibold">
          {translate('auto.components.stats.OpenCodeUsagePane.4799177b1c', 'Recent sessions')}
        </h4>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.stats.OpenCodeUsagePane.81817a641a',
            'Most recent local OpenCode sessions in this scope.'
          )}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-border/60 text-muted-foreground border-b text-left text-xs">
              <th className="px-2 py-2 font-medium">
                {translate('auto.components.stats.OpenCodeUsagePane.d97bdf6e27', 'Last active')}
              </th>
              <th className="px-2 py-2 font-medium">
                {translate('auto.components.stats.OpenCodeUsagePane.a4738de041', 'Project')}
              </th>
              <th className="px-2 py-2 font-medium">
                {translate('auto.components.stats.OpenCodeUsagePane.08c78441b7', 'Model')}
              </th>
              <th className="px-2 py-2 font-medium">
                {translate('auto.components.stats.OpenCodeUsagePane.d416f5cf92', 'Events')}
              </th>
              <th className="px-2 py-2 font-medium">
                {translate('auto.components.stats.OpenCodeUsagePane.0f2f266c9d', 'Input')}
              </th>
              <th className="px-2 py-2 font-medium">
                {translate('auto.components.stats.OpenCodeUsagePane.dfc4513657', 'Output')}
              </th>
              <th className="px-2 py-2 font-medium">
                {translate('auto.components.stats.OpenCodeUsagePane.349f7c3f5c', 'Total')}
              </th>
            </tr>
          </thead>
          <tbody>
            {recentSessions.map((row) => (
              <tr key={row.sessionId} className="border-border/40 border-b last:border-b-0">
                <td className="text-muted-foreground px-2 py-2">
                  {formatSessionTime(row.lastActiveAt)}
                </td>
                <td className="text-foreground px-2 py-2">{row.projectLabel}</td>
                <td className="text-muted-foreground px-2 py-2">
                  {row.model ??
                    translate('auto.components.stats.OpenCodeUsagePane.362231082f', 'Unknown')}
                </td>
                <td className="text-muted-foreground px-2 py-2">{row.events}</td>
                <td className="text-muted-foreground px-2 py-2">{formatTokens(row.inputTokens)}</td>
                <td className="text-muted-foreground px-2 py-2">
                  {formatTokens(row.outputTokens)}
                </td>
                <td className="text-muted-foreground px-2 py-2">{formatTokens(row.totalTokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
