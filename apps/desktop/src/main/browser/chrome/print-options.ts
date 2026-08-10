import type { BrowserPrintToPdfOptions } from '../cdp-print-to-pdf'

export function toCdpPrintOptions(options: BrowserPrintToPdfOptions): Record<string, unknown> {
  const result: Record<string, unknown> = { ...options }
  if (options.pageSize) {
    result.paperWidth = options.pageSize.width
    result.paperHeight = options.pageSize.height
    delete result.pageSize
  }
  if (options.margins) {
    result.marginTop = options.margins.top
    result.marginBottom = options.margins.bottom
    result.marginLeft = options.margins.left
    result.marginRight = options.margins.right
    delete result.margins
  }
  return result
}
