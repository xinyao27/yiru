import {
  DEFAULT_LOADER_VARIANT,
  LOADER_VARIANTS,
  LOADER_VARIANT_TASKS,
  isLegacyLoaderVariant,
  normalizeLoaderVariant,
  type LoaderVariant
} from '@yiru/workbench-model/loader'

import { translate } from '../i18n/translate'

export const MOBILE_LOADER_STYLES = LOADER_VARIANTS
export type MobileLoaderStyle = LoaderVariant
export const DEFAULT_MOBILE_LOADER_STYLE: MobileLoaderStyle = DEFAULT_LOADER_VARIANT

export function normalizeMobileLoaderStyle(value: unknown): MobileLoaderStyle {
  return normalizeLoaderVariant(value)
}

export function getMobileLoaderStyleLabel(style: MobileLoaderStyle): string {
  const fallback = isLegacyLoaderVariant(style)
    ? LOADER_VARIANT_TASKS[style]
    : `${style} · ${LOADER_VARIANT_TASKS[style]}`
  return translate(`mobile.appearance.loader.style.${style}`, fallback)
}
