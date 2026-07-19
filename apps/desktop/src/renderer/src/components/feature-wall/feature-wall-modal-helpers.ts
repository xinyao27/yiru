import type { FeatureWallOpenSourceTelemetry } from '../../../../shared/telemetry-events'
export { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

export function getFeatureWallOpenSource(
  modalData: Record<string, unknown>
): FeatureWallOpenSourceTelemetry {
  const source = modalData.source
  return source === 'help_menu' || source === 'popup' || source === 'onboarding'
    ? source
    : 'unknown'
}
