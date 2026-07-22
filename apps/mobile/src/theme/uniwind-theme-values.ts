import { useMemo } from 'react'
import { Uniwind, useCSSVariable } from 'uniwind'

function color(variable: string, bootstrapFallback: string): string {
  const value = Uniwind.getCSSVariable(variable)
  return typeof value === 'string' ? value : bootstrapFallback
}

// Why: a few imperative native and WebView APIs cannot consume className;
// resolve their values from the same Uniwind variables used by the UI.
export const colors = {
  get bgBase() {
    return color('--color-background', '#141414')
  },
  get bgPanel() {
    return color('--color-card', '#181818')
  },
  get bgRaised() {
    return color('--color-accent', '#333333')
  },
  get borderSubtle() {
    return color('--color-border', 'rgba(240, 240, 240, 0.08)')
  },
  get textPrimary() {
    return color('--color-foreground', '#f0f0f0')
  },
  get textSecondary() {
    return color('--color-muted-foreground', 'rgba(240, 240, 240, 0.6)')
  },
  get accentBlue() {
    return color('--color-primary', '#599ce7')
  },
  get terminalBg() {
    return color('--terminal-background', '#1a1b26')
  }
} as const

const THEME_COLOR_VARIABLES: string[] = [
  '--color-background',
  '--color-card',
  '--color-accent',
  '--color-border',
  '--color-foreground',
  '--color-muted-foreground',
  '--color-primary',
  '--terminal-background'
]

export type ThemeColors = {
  [Key in keyof typeof colors]: string
}

function resolvedColor(value: string | number | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

// Why: React surfaces that need raw colors must subscribe to theme changes;
// the imperative `colors` bridge alone cannot trigger a rerender.
export function useThemeColors(): ThemeColors {
  const values = useCSSVariable(THEME_COLOR_VARIABLES)
  return useMemo(
    () => ({
      bgBase: resolvedColor(values[0], '#141414'),
      bgPanel: resolvedColor(values[1], '#181818'),
      bgRaised: resolvedColor(values[2], '#333333'),
      borderSubtle: resolvedColor(values[3], 'rgba(240, 240, 240, 0.08)'),
      textPrimary: resolvedColor(values[4], '#f0f0f0'),
      textSecondary: resolvedColor(values[5], 'rgba(240, 240, 240, 0.6)'),
      accentBlue: resolvedColor(values[6], '#599ce7'),
      terminalBg: resolvedColor(values[7], '#1a1b26')
    }),
    [values]
  )
}

// Runtime geometry still needs numbers; these values mirror Tailwind's 4px scale.
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const

export const typography = { bodySize: 14, monoFamily: 'monospace' as const } as const
