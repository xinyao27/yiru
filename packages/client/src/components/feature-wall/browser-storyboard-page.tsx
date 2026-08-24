import type { JSX, RefObject } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'

export function BrowserStoryboardPricing(props: {
  cardRef: RefObject<HTMLDivElement | null>
  ctaRef: RefObject<HTMLSpanElement | null>
  ringStarter: boolean
  ctaHighlighted: boolean
  ctaPressing: boolean
}): JSX.Element {
  return (
    <>
      <div className="text-[15px] leading-tight font-bold">
        {translate('auto.components.feature.wall.BrowserAnimatedVisual.9e0f530390', 'Pricing')}
      </div>
      <div className="bg-foreground/10 h-2 w-4/5" />
      <div className="mt-1 grid grid-cols-2 gap-2.5">
        <PricingCard
          cardRef={props.cardRef}
          ctaRef={props.ctaRef}
          label={translate(
            'auto.components.feature.wall.BrowserAnimatedVisual.59ae327405',
            'Starter'
          )}
          cta="Try free"
          target
          ringActive={props.ringStarter}
          ctaHighlighted={props.ctaHighlighted}
          ctaPressing={props.ctaPressing}
        />
        <PricingCard
          label={translate('auto.components.feature.wall.BrowserAnimatedVisual.25f15c2219', 'Pro')}
          cta="Get Pro"
          highlighted
        />
      </div>
    </>
  )
}

export function BrowserStoryboardSignup(): JSX.Element {
  return (
    <div className="flex animate-[browserViewIn_360ms_cubic-bezier(.2,.8,.2,1)_both] flex-col gap-3">
      <div className="text-[15px] leading-tight font-bold">
        {translate(
          'auto.components.feature.wall.BrowserAnimatedVisual.46df009982',
          'Start your free trial'
        )}
      </div>
      <div className="bg-foreground/10 h-2 w-[70%]" />
      <div className="bg-foreground/10 -mt-1 h-2 w-[55%]" />
    </div>
  )
}

function PricingCard(props: {
  label: string
  cta: string
  highlighted?: boolean
  target?: boolean
  ringActive?: boolean
  ctaHighlighted?: boolean
  ctaPressing?: boolean
  cardRef?: RefObject<HTMLDivElement | null>
  ctaRef?: RefObject<HTMLSpanElement | null>
}): JSX.Element {
  const ctaIsBranded = props.ctaHighlighted && !props.highlighted
  return (
    <div
      ref={props.cardRef}
      className="border-border bg-card relative flex flex-col gap-1.5 border p-2.5"
    >
      {props.target ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute -inset-[3px] border-2 border-blue-500 bg-blue-500/10 transition-opacity duration-300',
            props.ringActive ? 'opacity-100' : 'opacity-0'
          )}
        />
      ) : null}
      <span className="text-[11.5px] font-semibold">{props.label}</span>
      <div className="bg-foreground/10 h-1.5 w-3/5" />
      <div className="bg-foreground/10 h-1.5 w-4/5" />
      <span
        ref={props.ctaRef}
        className={cn(
          'mt-1 inline-flex w-fit items-center px-2 py-1 text-[11px] font-semibold transition-[background-color,color,transform] duration-300',
          props.highlighted
            ? 'bg-foreground text-background'
            : ctaIsBranded
              ? 'bg-blue-600 text-white'
              : 'bg-foreground/[0.07] text-foreground',
          props.ctaPressing ? 'scale-[0.96]' : null
        )}
      >
        {props.cta}
      </span>
    </div>
  )
}
