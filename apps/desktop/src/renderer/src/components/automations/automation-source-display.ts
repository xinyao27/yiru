import { getExecutionHostLabel } from '@yiru/workbench-model/workspace'

import type { ProjectSourceContext } from '../../../../shared/project-source-context'

export type AutomationSourceDisplay = {
  label: string
  title: string
}

export function getAutomationSourceDisplay(
  sourceContext: ProjectSourceContext | null | undefined,
  hostLabelById?: ReadonlyMap<string, string>
): AutomationSourceDisplay | null {
  if (!sourceContext) {
    return null
  }
  const providerLabel = getProviderLabel(sourceContext.provider)
  const hostLabel =
    hostLabelById?.get(sourceContext.hostId) ?? getExecutionHostLabel(sourceContext.hostId)
  const identityLabel = getSourceIdentityLabel(sourceContext)
  const label = [providerLabel, hostLabel, identityLabel]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
  const title = [
    `${providerLabel} source`,
    `Host: ${hostLabel}`,
    sourceContext.accountLabel ? `Account: ${sourceContext.accountLabel}` : null,
    identityLabel ? `Source: ${identityLabel}` : null
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
  return { label, title }
}

function getProviderLabel(provider: ProjectSourceContext['provider']): string {
  switch (provider) {
    case 'github':
      return 'GitHub'
    case 'gitlab':
      return 'GitLab'
  }
}

function getSourceIdentityLabel(sourceContext: ProjectSourceContext): string | null {
  const identity = sourceContext.providerIdentity
  if (identity) {
    switch (identity.provider) {
      case 'github':
        return `${identity.owner}/${identity.repo}`
      case 'gitlab':
        return identity.namespace && identity.project
          ? `${identity.namespace}/${identity.project}`
          : (identity.projectId ?? null)
    }
  }
  return sourceContext.accountLabel ?? sourceContext.repoId ?? null
}
