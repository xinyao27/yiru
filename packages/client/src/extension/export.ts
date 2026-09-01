import type { ShellExportApi } from '../runtime/shell-tools-client'
import { getExtensionBrowserCapabilities } from './browser-capabilities'

export const extensionShellExportApi: ShellExportApi = {
  htmlToPdf: (input) => getExtensionBrowserCapabilities().exportHtmlToPdf(input)
}
