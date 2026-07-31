import type { ITerminalOptions } from '@xterm/xterm'
import { buildFontFamily } from '~renderer/components/terminal-pane/layout-serialization'
import { composeActiveTerminalTheme } from '~renderer/components/terminal-pane/terminal-appearance'
import { buildDefaultTerminalOptions } from '~renderer/lib/pane-manager/pane-terminal-options'
import { getBuiltinTheme, resolveEffectiveTerminalAppearance } from '~renderer/lib/terminal-theme'
import { resolveTerminalFontWeights } from '~shared/terminal/fonts'
import { normalizeTerminalLineHeight } from '~shared/terminal/line-height-settings'
import type { GlobalSettings } from '~shared/types'

// Why: this maps the user's global terminal preferences (theme, font, line
// height) into xterm's option shape — a mapping that changes whenever the
// settings schema or appearance rules evolve, independent of subscription
// or mutation-queue plumbing.
export function createTerminalOptions(
  settings: GlobalSettings | null,
  systemPrefersDark: boolean,
  canControl: boolean
): ITerminalOptions {
  const defaults = buildDefaultTerminalOptions()
  if (!settings) {
    return { ...defaults, disableStdin: !canControl }
  }
  const appearance = resolveEffectiveTerminalAppearance(settings, systemPrefersDark)
  const baseTheme = appearance.theme ?? getBuiltinTheme(appearance.themeName)
  const weights = resolveTerminalFontWeights(settings.terminalFontWeight)
  return {
    ...defaults,
    disableStdin: !canControl,
    theme: composeActiveTerminalTheme(baseTheme, settings) ?? undefined,
    fontFamily: buildFontFamily(settings.terminalFontFamily),
    fontSize: settings.terminalFontSize,
    fontWeight: weights.fontWeight,
    fontWeightBold: weights.fontWeightBold,
    lineHeight: normalizeTerminalLineHeight(settings.terminalLineHeight),
    allowTransparency:
      settings.terminalBackgroundOpacity !== undefined && settings.terminalBackgroundOpacity < 1
  }
}
