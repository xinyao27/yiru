export function clearPierreRenameInput(input: HTMLInputElement): void {
  input.value = ''
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
}
