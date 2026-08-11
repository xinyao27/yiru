// Why: feature modules depend on the renderer host adapter, not the preload
// implementation. Electron and web each install their own Window.api adapter.
export const rendererHostClient: Window['api'] = window.api
