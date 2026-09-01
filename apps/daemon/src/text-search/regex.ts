// Why: user input and file paths must be literal when interpolated into a regular expression.
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
