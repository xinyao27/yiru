export function applyDocumentAppFont(fontFamily: string): void {
  document.documentElement.style.setProperty('--app-font-family', fontFamily)
}
