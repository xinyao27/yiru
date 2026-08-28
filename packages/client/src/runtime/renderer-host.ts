export function isExtensionRenderer(): boolean {
  return Reflect.get(globalThis, '__YIRU_EXTENSION_CLIENT__') === true
}

export function usesBrowserUiRenderer(): boolean {
  return isExtensionRenderer() || Reflect.get(globalThis, '__YIRU_WEB_CLIENT__') === true
}

export function usesNativeWindowRenderer(): boolean {
  return !usesBrowserUiRenderer()
}
