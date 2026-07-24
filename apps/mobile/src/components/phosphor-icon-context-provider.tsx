import { IconContext, type IconWeight } from 'phosphor-react-native'
import { useContext, useMemo, type PropsWithChildren } from 'react'

export function PhosphorIconContextProvider({
  children,
  weight
}: PropsWithChildren<{ weight: IconWeight }>): React.JSX.Element {
  const parentValue = useContext(IconContext)
  // Why: nested Phosphor providers replace context, so preserve the root color
  // and defaults while scoping only the icon weight for compact chrome.
  const value = useMemo(() => ({ ...parentValue, weight }), [parentValue, weight])
  return <IconContext.Provider value={value}>{children}</IconContext.Provider>
}
