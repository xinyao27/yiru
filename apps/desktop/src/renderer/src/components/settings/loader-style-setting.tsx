import { LoadingIndicatorPreview } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import {
  LOADER_STYLES,
  normalizeLoaderStyle,
  type LoaderStyle
} from '../../../../shared/loader-style'
import { Label } from '../ui/label'

type LoaderStyleSettingProps = {
  value: LoaderStyle | undefined
  onChange: (value: LoaderStyle) => void
}

function handleLoaderStyleKeyDown(
  event: React.KeyboardEvent<HTMLButtonElement>,
  currentIndex: number,
  onChange: (value: LoaderStyle) => void
): void {
  let nextIndex: number | null = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (currentIndex + 1) % LOADER_STYLES.length
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (currentIndex - 1 + LOADER_STYLES.length) % LOADER_STYLES.length
  } else if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = LOADER_STYLES.length - 1
  }
  if (nextIndex === null) {
    return
  }

  event.preventDefault()
  onChange(LOADER_STYLES[nextIndex])
  event.currentTarget.parentElement
    ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    [nextIndex]?.focus()
}

function getLoaderStyleLabel(loaderStyle: LoaderStyle): string {
  switch (loaderStyle) {
    case 'drawing':
      return translate('settings.appearance.loader.drawing', 'Drawn icons')
    case 'code':
      return translate('settings.appearance.loader.code', 'Code braces')
    case 'macos':
      return translate('settings.appearance.loader.macos', 'macOS')
    case 'square':
      return translate('settings.appearance.loader.square', 'Square')
    case 'flipbook':
      return translate('settings.appearance.loader.flipbook', 'Flipbook')
    case 'escalade':
      return translate('settings.appearance.loader.escalade', 'Escalade')
    case 'thinking-orb-working':
      return translate('settings.appearance.loader.orbWorking', 'Working')
    case 'thinking-orb-searching':
      return translate('settings.appearance.loader.orbSearching', 'Searching')
    case 'thinking-orb-solving':
      return translate('settings.appearance.loader.orbSolving', 'Solving')
    case 'thinking-orb-listening':
      return translate('settings.appearance.loader.orbListening', 'Listening')
    case 'thinking-orb-composing':
      return translate('settings.appearance.loader.orbComposing', 'Composing')
    case 'thinking-orb-shaping':
      return translate('settings.appearance.loader.orbShaping', 'Shaping')
  }
}

export function LoaderStyleSetting({
  value,
  onChange
}: LoaderStyleSettingProps): React.JSX.Element {
  const selected = normalizeLoaderStyle(value)
  const title = translate('settings.appearance.loader.title', 'Loader')

  return (
    <div className="space-y-3 py-3">
      <div className="space-y-1">
        <Label>{title}</Label>
        <p className="text-muted-foreground text-xs">
          {translate(
            'settings.appearance.loader.description',
            'Choose the animation used across Yiru. Drawn icons cycle through four sketches, and Thinking Orbs adds six dotted agent-state animations.'
          )}
        </p>
      </div>
      <div role="radiogroup" aria-label={title} className="grid grid-cols-3 gap-2">
        {LOADER_STYLES.map((loaderStyle, index) => {
          const active = loaderStyle === selected
          const label = getLoaderStyleLabel(loaderStyle)
          return (
            <Button
              variant="outline"
              size="default"
              key={loaderStyle}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              data-current={active ? 'true' : undefined}
              onClick={() => onChange(loaderStyle)}
              onKeyDown={(event) => handleLoaderStyleKeyDown(event, index, onChange)}
              className={cn(
                'focus-visible:border-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:border-2 flex min-h-16 flex-col gap-1.5 px-2 text-center transition-colors',
                active ? 'border-ring bg-accent text-accent-foreground' : 'text-muted-foreground'
              )}
            >
              <LoadingIndicatorPreview loaderStyle={loaderStyle} className="size-7" />
              <span className="text-[11px] font-medium">{label}</span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}
