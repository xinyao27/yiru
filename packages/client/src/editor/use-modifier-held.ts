import { useEffect, useState } from 'react'

// Why: plain click inside a contenteditable places the caret, so markdown links
// only open on Cmd/Ctrl-click. Rendering the modifier state as a class lets CSS
// surface a pointer cursor only at that moment — matching
// VS Code's link affordance without misleading the user into expecting a plain
// click to open.
export function useModifierHeld(isMac: boolean): boolean {
  const modifierKey = isMac ? 'Meta' : 'Control'
  const [heldKey, setHeldKey] = useState<string | null>(null)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === modifierKey) {
        setHeldKey(modifierKey)
      }
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === modifierKey) {
        setHeldKey(null)
      }
    }
    const onBlur = (): void => setHeldKey(null)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [modifierKey])
  return heldKey === modifierKey
}
