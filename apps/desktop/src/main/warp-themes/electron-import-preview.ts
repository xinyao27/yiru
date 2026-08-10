import type { WebContents } from 'electron'
import type { WarpThemeImportPreview } from '~shared/terminal/custom-themes'

import type { Store } from '../persistence'
import {
  previewWarpThemeImport as previewPortableWarpThemeImport,
  type WarpThemeSourcePicker
} from './import-preview'
import {
  chooseManualWarpThemeFiles,
  chooseManualWarpThemeFolderPath
} from './manual-warp-theme-files'
import type { WarpThemePreviewOptions } from './preview-operation-budget'

export function previewWarpThemeImport(
  store: Store,
  source: unknown = { kind: 'auto' },
  webContents?: WebContents,
  options: WarpThemePreviewOptions = {}
): Promise<WarpThemeImportPreview> {
  const picker: WarpThemeSourcePicker = {
    chooseFiles: () => chooseManualWarpThemeFiles(webContents),
    chooseFolder: () => chooseManualWarpThemeFolderPath(webContents)
  }
  return previewPortableWarpThemeImport(store, source, options, picker)
}
