import type {
  ExternalAutomationManager,
  ExternalAutomationProvider
} from '~shared/automations-types'

export type ExternalAutomationSourceAvailability = {
  statusLabel: string
  summary: string
  detail: string
  isConnecting: boolean
}

type ExternalAutomationSourceAvailabilityArgs = {
  manager: ExternalAutomationManager
  providerLabel: string
  targetKindLabel: string
}

export function getExternalAutomationSourceAvailability({
  manager,
  providerLabel,
  targetKindLabel
}: ExternalAutomationSourceAvailabilityArgs): ExternalAutomationSourceAvailability {
  return {
    statusLabel: 'Source unavailable',
    summary:
      manager.error ?? `${providerLabel} source unavailable on ${targetKindLabel.toLowerCase()}.`,
    detail: 'Install or repair the local automation source, then retry to load jobs.',
    isConnecting: false
  }
}

export function getExternalAutomationActionDisabledMessage(args: {
  manager: ExternalAutomationManager
  providerLabel?: string
  targetKindLabel?: string
  actionInProgress?: boolean
}): string | null {
  if (args.actionInProgress) {
    return 'Another automation action is still running.'
  }
  if (args.manager.canManage) {
    return null
  }
  const providerLabel = args.providerLabel ?? getProviderLabel(args.manager.provider)
  const targetKindLabel = args.targetKindLabel ?? 'Local'
  return (
    args.manager.error ??
    `${providerLabel} cannot manage automations on this ${targetKindLabel.toLowerCase()}.`
  )
}

function getProviderLabel(provider: ExternalAutomationProvider): string {
  return provider === 'hermes' ? 'Hermes' : 'OpenClaw'
}
