import type { SelectionDrawerOption } from '~/components/selection-drawer'
import { translate } from '~/i18n/translate'

export type RestoreValue = 'indefinite' | '60s' | '5m' | '30m'

export type TextSizeValue = 'smallest' | 'smaller' | 'default' | 'large' | 'larger' | 'largest'

// Why: scale is the terminal WebView's baseline zoom. Keeping it on the
// selection model lets stored scale values and drawer ids share one source.
export const TEXT_SIZE_OPTIONS: (SelectionDrawerOption<TextSizeValue, TextSizeValue> & {
  scale: number
})[] = [
  {
    id: 'smallest',
    value: 'smallest',
    label: translate('mobile.terminalSettings.textSize.smallest', 'Smallest (50%)'),
    scale: 0.5
  },
  {
    id: 'smaller',
    value: 'smaller',
    label: translate('mobile.terminalSettings.textSize.smaller', 'Smaller (75%)'),
    scale: 0.75
  },
  {
    id: 'default',
    value: 'default',
    label: translate('mobile.terminalSettings.textSize.default', 'Default (100%)'),
    scale: 1
  },
  {
    id: 'large',
    value: 'large',
    label: translate('mobile.terminalSettings.textSize.large', 'Large (125%)'),
    scale: 1.25
  },
  {
    id: 'larger',
    value: 'larger',
    label: translate('mobile.terminalSettings.textSize.larger', 'Larger (150%)'),
    scale: 1.5
  },
  {
    id: 'largest',
    value: 'largest',
    label: translate('mobile.terminalSettings.textSize.largest', 'Largest (200%)'),
    scale: 2
  }
]

export const AUTO_RESTORE_FIT_OPTIONS: (SelectionDrawerOption<RestoreValue, RestoreValue> & {
  ms: number | null
})[] = [
  {
    id: 'indefinite',
    value: 'indefinite',
    label: translate(
      'mobile.terminalSettings.autoRestore.keepPhoneSize',
      'Keep at phone size (default)'
    ),
    ms: null
  },
  {
    id: '60s',
    value: '60s',
    label: translate('mobile.terminalSettings.autoRestore.afterOneMinute', 'After 1 minute'),
    ms: 60_000
  },
  {
    id: '5m',
    value: '5m',
    label: translate('mobile.terminalSettings.autoRestore.afterFiveMinutes', 'After 5 minutes'),
    ms: 5 * 60_000
  },
  {
    id: '30m',
    value: '30m',
    label: translate('mobile.terminalSettings.autoRestore.afterThirtyMinutes', 'After 30 minutes'),
    ms: 30 * 60_000
  }
]

export function textSizeValueFromScale(scale: number): TextSizeValue {
  return TEXT_SIZE_OPTIONS.find((option) => option.scale === scale)?.value ?? 'default'
}

export function textSizeSummary(scale: number): string {
  return (TEXT_SIZE_OPTIONS.find((option) => option.scale === scale) ?? TEXT_SIZE_OPTIONS[0]!).label
}

export function valueFromMs(ms: number | null | undefined): RestoreValue {
  if (ms == null) {
    return 'indefinite'
  }
  const exact = AUTO_RESTORE_FIT_OPTIONS.find((option) => option.ms === ms)
  if (exact) {
    return exact.value
  }
  // Why: a server can return a custom or future duration. Snapping to the
  // closest preset keeps the selected radio consistent with the row summary.
  let closest: (typeof AUTO_RESTORE_FIT_OPTIONS)[number] | null = null
  let bestDelta = Infinity
  for (const option of AUTO_RESTORE_FIT_OPTIONS) {
    if (option.ms == null) {
      continue
    }
    const delta = Math.abs(option.ms - ms)
    if (delta < bestDelta) {
      bestDelta = delta
      closest = option
    }
  }
  return closest ? closest.value : 'indefinite'
}

export function autoRestoreSummary(ms: number | null | undefined): string {
  if (ms === undefined) {
    return translate('mobile.terminalSettings.autoRestore.loading', '…')
  }
  if (ms === null) {
    return AUTO_RESTORE_FIT_OPTIONS[0]!.label
  }
  const exact = AUTO_RESTORE_FIT_OPTIONS.find((option) => option.ms === ms)
  return exact
    ? exact.label
    : translate('mobile.terminalSettings.autoRestore.afterSeconds', 'After {{seconds}}s', {
        seconds: Math.round(ms / 1000)
      })
}
