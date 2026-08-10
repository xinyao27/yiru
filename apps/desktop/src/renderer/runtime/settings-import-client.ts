import { useAppStore } from '~renderer/store'
import type { WarpThemeImportPreview, WarpThemeImportSource } from '~shared/terminal/custom-themes'
import type { GhosttyImportPreview } from '~shared/types'

import { callRuntimeOrpc } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

// Why: fonts/Ghostty/Warp all read the active target's filesystem, not the
// shell's — a desktop paired to a remote environment should see that host's
// fonts and terminal-emulator configs, not always its own local machine's.
function activeSettingsImportTarget() {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

export function listInstalledFontFamilies(): Promise<string[]> {
  return callRuntimeOrpc(
    activeSettingsImportTarget(),
    (client) => client.settings.listFonts,
    undefined
  )
}

export function previewGhosttyImportOnActiveHost(): Promise<GhosttyImportPreview> {
  // Why: the contract widens `diff` to `Record<string, unknown>` because
  // `Partial<GlobalSettings>` is a desktop-only type the client-safe contract
  // package cannot import; this caller owns the concrete shape and narrows
  // the result back to it.
  return callRuntimeOrpc(
    activeSettingsImportTarget(),
    (client) => client.settings.previewGhosttyImport,
    undefined
  ) as Promise<GhosttyImportPreview>
}

export function previewWarpThemeImportOnActiveHost(
  source: WarpThemeImportSource
): Promise<WarpThemeImportPreview> {
  // Why: same widening as `previewGhosttyImportOnActiveHost` above, for
  // `themes[].terminal` (`TerminalColorOverrides`).
  return callRuntimeOrpc(
    activeSettingsImportTarget(),
    (client) => client.settings.previewWarpThemeImport,
    source
  ) as Promise<WarpThemeImportPreview>
}
