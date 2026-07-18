import { LoadingIndicatorPreview } from '@/components/loading-indicator'
import { cn } from '@/lib/class-names'
import {
  LOADER_STYLES,
  normalizeLoaderStyle,
  type LoaderStyle
} from '../../../../shared/loader-style'
import { translate } from '@/i18n/i18n'
import { Label } from '../ui/label'

type LoaderStyleSettingProps = {
  value: LoaderStyle | undefined
  onChange: (value: LoaderStyle) => void
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
        <p className="text-xs text-muted-foreground">
          {translate(
            'settings.appearance.loader.description',
            'Choose the animation used across Yiru. The drawn icons option cycles through a piggy bank, calculator, wallet, and kitten.'
          )}
        </p>
      </div>
      <div role="radiogroup" aria-label={title} className="grid grid-cols-3 gap-2">
        {LOADER_STYLES.map((loaderStyle) => {
          const active = loaderStyle === selected
          const label = getLoaderStyleLabel(loaderStyle)
          return (
            <button
              key={loaderStyle}
              type="button"
              role="radio"
              aria-checked={active}
              data-current={active ? 'true' : undefined}
              onClick={() => onChange(loaderStyle)}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-1.5 border px-2 py-2 text-center outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
                active
                  ? 'border-ring bg-accent text-accent-foreground'
                  : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <LoadingIndicatorPreview loaderStyle={loaderStyle} className="size-7" />
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
