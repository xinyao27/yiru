import { rendererHostClient } from '../renderer-host-client'

// Why: native downloads, renderer-authorized absolute paths, and upload
// staging remain Electron shell capabilities until D3 defines shell.files.*.
export function getNativeFiles(): Window['api']['fileHost'] {
  return rendererHostClient.fileHost
}
