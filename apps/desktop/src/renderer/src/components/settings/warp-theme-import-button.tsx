import { translate } from '@/i18n/i18n'

import { WarpIcon } from '../icons/warp-icon'
import { Button } from '../ui/button'
import type { UseWarpThemeImportReturn } from './use-warp-theme-import'

// Why: Warp import only produces terminal themes, so it sits with the theme
// pickers rather than in the Typography header.
export function WarpThemeImportButton({
  warpThemes
}: {
  warpThemes: UseWarpThemeImportReturn
}): React.JSX.Element {
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={() => void warpThemes.handleClick()}
    >
      <WarpIcon className="size-4" />
      {translate('auto.components.settings.WarpThemeImportModal.title', 'Import from Warp')}
    </Button>
  )
}
