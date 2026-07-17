import { track } from '@/lib/telemetry'
import type { EventProps } from '../../../../shared/telemetry-events'

export type YiruCliFeatureTipSource = EventProps<'yiru_cli_feature_tip_shown'>['source']
export type YiruCliFeatureTipSetupResult = EventProps<'yiru_cli_feature_tip_setup_result'>['result']
export type CmdJPaletteFeatureTipSource = EventProps<'cmd_j_palette_feature_tip_shown'>['source']

export function getYiruCliFeatureTipTelemetrySource(value: unknown): YiruCliFeatureTipSource {
  return value === 'app_open' ? 'app_open' : 'manual'
}

export function trackYiruCliFeatureTipShown(source: YiruCliFeatureTipSource): void {
  track('yiru_cli_feature_tip_shown', { source })
}

export function trackYiruCliFeatureTipSetupClicked(source: YiruCliFeatureTipSource): void {
  track('yiru_cli_feature_tip_setup_clicked', { source })
}

export function trackYiruCliFeatureTipSetupResult(
  source: YiruCliFeatureTipSource,
  result: YiruCliFeatureTipSetupResult
): void {
  track('yiru_cli_feature_tip_setup_result', { source, result })
}

export function trackCmdJPaletteFeatureTipShown(source: CmdJPaletteFeatureTipSource): void {
  track('cmd_j_palette_feature_tip_shown', { source })
}

export function trackCmdJPaletteFeatureTipAcknowledged(source: CmdJPaletteFeatureTipSource): void {
  track('cmd_j_palette_feature_tip_acknowledged', { source })
}
