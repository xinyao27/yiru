import {
  DEFAULT_LOADER_VARIANT,
  LOADER_VARIANTS,
  normalizeLoaderVariant,
  type LoaderVariant
} from '@yiru/workbench-model/loader'

export const LOADER_STYLES = LOADER_VARIANTS
export type LoaderStyle = LoaderVariant
export const DEFAULT_LOADER_STYLE: LoaderStyle = DEFAULT_LOADER_VARIANT

export function normalizeLoaderStyle(value: unknown): LoaderStyle {
  return normalizeLoaderVariant(value)
}
