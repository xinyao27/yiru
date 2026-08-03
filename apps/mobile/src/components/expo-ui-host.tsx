import { Host } from '@expo/ui'
import type { ReactNode } from 'react'
import { useCSSVariable, useUniwind, withUniwind } from 'uniwind'

import { resolveCssString } from '~/style/resolve-css-variable'

const UniwindHost = withUniwind(Host)

type ExpoUiHostProps = {
  children: ReactNode
  layout?: 'fill' | 'inline'
}

// Why: feature-owned native islands should use Expo UI directly, while this
// adapter keeps Yiru's theme bridge out of every caller.
export function ExpoUiHost({ children, layout = 'inline' }: ExpoUiHostProps): React.JSX.Element {
  const { theme } = useUniwind()
  const primaryColor = resolveCssString(useCSSVariable('--color-primary'))

  return (
    <UniwindHost
      className={layout === 'fill' ? 'w-full bg-transparent' : 'bg-transparent'}
      colorScheme={theme}
      ignoreSafeArea="all"
      matchContents={layout === 'inline' ? true : { vertical: true }}
      seedColor={primaryColor}
    >
      {children}
    </UniwindHost>
  )
}
