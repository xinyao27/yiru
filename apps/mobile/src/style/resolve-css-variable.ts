type CssVariableValue = string | number | undefined

export function resolveCssString(value: CssVariableValue): string {
  return typeof value === 'string' ? value : ''
}

export function resolveCssNumber(value: CssVariableValue): number {
  if (typeof value === 'number') {
    return value
  }
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}
