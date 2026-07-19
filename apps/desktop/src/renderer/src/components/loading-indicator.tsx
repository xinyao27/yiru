import { createContext, useContext } from 'react'
import type React from 'react'

import { cn } from '@/lib/class-names'

import {
  DEFAULT_LOADER_STYLE,
  normalizeLoaderStyle,
  type LoaderStyle
} from '../../../shared/loader-style'

const LoadingIndicatorStyleContext = createContext<LoaderStyle>(DEFAULT_LOADER_STYLE)

type LoadingIndicatorBaseProps = Omit<React.ComponentPropsWithoutRef<'span'>, 'children'> & {
  size?: number | string
}

type LoadingIndicatorPreviewProps = LoadingIndicatorBaseProps & {
  loaderStyle: LoaderStyle
}

function DrawingLoader(): React.JSX.Element {
  return (
    <svg className="yiru-loader-visual yiru-loader-drawing size-full" viewBox="0 0 24 24">
      <g className="yiru-loader-drawing-frame yiru-loader-drawing-pig">
        <path
          pathLength="1"
          d="M4 12c0-3.4 3-6 7-6h3.1c1.4 0 2.7.4 3.7 1.2L21 6.3v5.2c0 1.4-.8 2.7-2.1 3.3L18 18h-3v-2H9v2H6v-3c-1.2-.7-2-1.7-2-3Z"
        />
        <path
          pathLength="1"
          d="M15.5 6.2c.7-1.4 2.1-2 3.2-1.7L18 7.8M9 9h5M17.4 10.4h.1M4.2 10.4c-1.7.2-2.4-.5-2.2-1.5"
        />
      </g>
      <g className="yiru-loader-drawing-frame yiru-loader-drawing-calculator">
        <path
          pathLength="1"
          d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        />
        <path pathLength="1" d="M8 6h8v4H8V6Zm0 7h1m3 0h1m3 0h1M8 17h1m3 0h1m3 0h1" />
      </g>
      <g className="yiru-loader-drawing-frame yiru-loader-drawing-wallet">
        <path
          pathLength="1"
          d="M5 5h12a2 2 0 0 1 2 2v2h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        />
        <path pathLength="1" d="M3 8h16m-2 2h4v6h-4a3 3 0 0 1 0-6Zm0 3h.1" />
      </g>
      <g className="yiru-loader-drawing-frame yiru-loader-drawing-kitten">
        <path
          pathLength="1"
          d="M6.5 8 5 3.5l4 2.2a8.5 8.5 0 0 1 6 0l4-2.2L17.5 8c1 1.2 1.5 2.7 1.5 4.3 0 4-3.1 7.2-7 7.2s-7-3.2-7-7.2C5 10.7 5.5 9.2 6.5 8Z"
        />
        <path
          pathLength="1"
          d="M8.5 11h.1m6.8 0h.1M10 14c1.3 1.2 2.7 1.2 4 0m-2-1v2m-3.5-1.8-4-.8m4 2.2-3.7 1.2m10.7-2.6 4-.8m-4 2.2 3.7 1.2"
        />
      </g>
    </svg>
  )
}

function CodeLoader(): React.JSX.Element {
  return (
    <svg className="yiru-loader-visual yiru-loader-code size-full" viewBox="0 0 24 24">
      <text className="yiru-loader-code-brace yiru-loader-code-open" x="2" y="18">
        {'{'}
      </text>
      <text className="yiru-loader-code-brace yiru-loader-code-close" x="13" y="18">
        {'}'}
      </text>
    </svg>
  )
}

function MacosLoader(): React.JSX.Element {
  return (
    <span className="yiru-loader-visual yiru-loader-macos">
      {Array.from({ length: 12 }, (_, index) => {
        const rotation = index * 30
        return (
          <span
            key={rotation}
            className="yiru-loader-macos-blade"
            style={{
              animationDelay: `${index / 12}s`,
              transform: `rotate(${rotation}deg)`
            }}
          />
        )
      })}
    </span>
  )
}

function SquareLoader(): React.JSX.Element {
  return (
    <span className="yiru-loader-visual yiru-loader-square">
      <span className="yiru-loader-square-fill" />
    </span>
  )
}

function FlipbookLoader(): React.JSX.Element {
  return (
    <span className="yiru-loader-visual yiru-loader-book">
      {[0, 1, 2].map((page) => (
        <span
          key={page}
          className="yiru-loader-book-page"
          style={{ animationDelay: `${page * 0.4}s` }}
        />
      ))}
    </span>
  )
}

function EscaladeLoader(): React.JSX.Element {
  return (
    <svg className="yiru-loader-visual yiru-loader-escalade size-full" viewBox="0 -25 100 150">
      <g>
        <path pathLength="1" d="M50 100A1 1 0 0 1 50 0" />
      </g>
      <g>
        <path pathLength="1" d="M50 75A1 1 0 0 0 50-25" />
      </g>
    </svg>
  )
}

function LoaderVisual({ loaderStyle }: { loaderStyle: LoaderStyle }): React.JSX.Element {
  switch (loaderStyle) {
    case 'drawing':
      return <DrawingLoader />
    case 'code':
      return <CodeLoader />
    case 'macos':
      return <MacosLoader />
    case 'square':
      return <SquareLoader />
    case 'flipbook':
      return <FlipbookLoader />
    case 'escalade':
      return <EscaladeLoader />
  }
}

function removeLegacySpinClass(className: string | undefined): string | undefined {
  // Why: nested variants own their motion; a leftover icon class would rotate the whole drawing.
  return className
    ?.split(/\s+/)
    .filter((token) => token && token !== 'animate-spin')
    .join(' ')
}

function LoadingIndicatorVisual({
  loaderStyle,
  size,
  className,
  style,
  role,
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden,
  ...props
}: LoadingIndicatorPreviewProps): React.JSX.Element {
  const dimension = typeof size === 'number' ? `${size}px` : size
  return (
    <span
      {...props}
      data-slot="loading-indicator"
      data-loader-style={loaderStyle}
      role={role ?? (ariaLabel ? 'status' : undefined)}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : (ariaHidden ?? true)}
      className={cn(
        'inline-block size-4 shrink-0 overflow-visible align-middle',
        removeLegacySpinClass(className)
      )}
      style={{
        ...style,
        ...(dimension ? { width: dimension, height: dimension } : {})
      }}
    >
      <LoaderVisual loaderStyle={loaderStyle} />
    </span>
  )
}

type LoadingIndicatorStyleProviderProps = React.ComponentPropsWithRef<'div'> & {
  loaderStyle: LoaderStyle | undefined
}

export function LoadingIndicatorStyleProvider({
  loaderStyle,
  children,
  ...props
}: LoadingIndicatorStyleProviderProps): React.JSX.Element {
  const normalizedLoaderStyle = normalizeLoaderStyle(loaderStyle)
  return (
    <LoadingIndicatorStyleContext.Provider value={normalizedLoaderStyle}>
      <div {...props}>{children}</div>
    </LoadingIndicatorStyleContext.Provider>
  )
}

export function LoadingIndicator(props: LoadingIndicatorBaseProps): React.JSX.Element {
  const configuredStyle = useContext(LoadingIndicatorStyleContext)
  return <LoadingIndicatorVisual {...props} loaderStyle={configuredStyle} />
}

export function LoadingIndicatorPreview({
  loaderStyle,
  ...props
}: LoadingIndicatorPreviewProps): React.JSX.Element {
  return <LoadingIndicatorVisual {...props} loaderStyle={normalizeLoaderStyle(loaderStyle)} />
}
