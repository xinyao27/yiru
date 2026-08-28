import { createHash } from 'node:crypto'

export function manualWarpThemeContentDiscriminator(label: string, content: string): string {
  return `${label}-${createHash('sha256').update(content).digest('hex').slice(0, 12)}`
}
