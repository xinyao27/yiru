import type { BaseDiffOptions, HunkSeparators } from '@pierre/diffs'
import { CURSOR_DARK_THEME_NAME, CURSOR_LIGHT_THEME_NAME } from '@yiru/editor-themes/cursor'

import { CURSOR_PIERRE_UNSAFE_CSS } from '../cursor-pierre-theme'
import { buildEditorFontFamily } from '../font-family'

export type DiffCodeViewRenderAppearance = {
  isDark: boolean
  sideBySide: boolean
  /** Off means the code scrolls sideways instead of wrapping. */
  wordWrap: boolean
  /** On leaves the filename row to the surrounding surface instead of Pierre. */
  disableFileHeader: boolean
}

export type DiffCodeViewFontAppearance = {
  fontSize: number
  fontFamily?: string
}

const DIFF_CODE_VIEW_MIN_LINE_HEIGHT_PX = 19

/**
 * The look every Pierre diff surface shares — single file and CodeView list
 * alike. `CODE_VIEW_DIFF_OPTION_KEYS` passes all of these straight through, so
 * one appearance lives here instead of drifting between the two renderers.
 */
export function buildDiffCodeViewRenderOptions(appearance: DiffCodeViewRenderAppearance): Pick<
  BaseDiffOptions,
  | 'theme'
  | 'themeType'
  | 'diffStyle'
  | 'diffIndicators'
  | 'disableFileHeader'
  | 'lineDiffType'
  | 'overflow'
  | 'unsafeCSS'
  // Why: both consumers reject the deprecated 'custom' separator, so narrow it
  // here rather than making each call site re-assert the value.
> & { hunkSeparators: Exclude<HunkSeparators, 'custom'> } {
  return {
    theme: { dark: CURSOR_DARK_THEME_NAME, light: CURSOR_LIGHT_THEME_NAME },
    themeType: appearance.isDark ? 'dark' : 'light',
    diffStyle: appearance.sideBySide ? 'split' : 'unified',
    diffIndicators: 'bars',
    disableFileHeader: appearance.disableFileHeader,
    hunkSeparators: 'line-info-basic',
    lineDiffType: 'word-alt',
    overflow: appearance.wordWrap ? 'wrap' : 'scroll',
    // Why: Pierre renders inside Shadow DOM, so app-wide geometry and exact
    // Cursor line fills need a narrow library-owned override.
    unsafeCSS: CURSOR_PIERRE_UNSAFE_CSS
  }
}

/** Custom properties that bind Pierre's Shadow DOM to the app's theme tokens. */
export function buildDiffCodeViewCSSVariables(
  appearance: DiffCodeViewFontAppearance
): React.CSSProperties {
  return {
    '--diffs-light-bg': 'var(--background)',
    '--diffs-dark-bg': 'var(--background)',
    '--diffs-light': 'var(--foreground)',
    '--diffs-dark': 'var(--foreground)',
    '--diffs-font-family': buildEditorFontFamily(appearance.fontFamily),
    '--diffs-header-font-family': 'var(--app-font-family)',
    '--diffs-font-size': `${appearance.fontSize}px`,
    '--diffs-line-height': `${Math.max(DIFF_CODE_VIEW_MIN_LINE_HEIGHT_PX, Math.round(appearance.fontSize * 1.5))}px`,
    '--diffs-addition-color-override': 'var(--editor-diff-added-gutter)',
    '--diffs-deletion-color-override': 'var(--editor-diff-deleted-gutter)',
    '--diffs-modified-color-override': 'var(--editor-diff-modified-gutter)',
    '--diffs-bg-addition-emphasis-override': 'var(--editor-diff-inserted-text-background)',
    '--diffs-bg-deletion-emphasis-override': 'var(--editor-diff-removed-text-background)'
  } as React.CSSProperties
}
