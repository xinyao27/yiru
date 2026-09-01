'use client'

import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import * as React from 'react'
import { cn } from '~renderer/ui/class-names'

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props): React.JSX.Element {
  return <AccordionPrimitive.Root data-slot="accordion" className={cn(className)} {...props} />
}

type AccordionItemProps = AccordionPrimitive.Item.Props & {
  bordered?: boolean
}

function AccordionItem({
  bordered = true,
  className,
  ...props
}: AccordionItemProps): React.JSX.Element {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(bordered && 'border-b last:border-b-0', className)}
      {...props}
    />
  )
}

type AccordionTriggerProps = AccordionPrimitive.Trigger.Props & {
  actions?: React.ReactNode
  indicatorPosition?: 'start' | 'end'
  variant?: 'default' | 'section'
}

function AccordionTrigger({
  actions,
  className,
  children,
  indicatorPosition = 'end',
  variant = 'default',
  ...props
}: AccordionTriggerProps): React.JSX.Element {
  const indicator = (
    <HugeiconsIcon
      icon={ArrowDown01Icon}
      className={cn(
        'text-muted-foreground size-4 shrink-0 transition-transform duration-200',
        variant === 'section' &&
          'group-hover/section:text-accent-foreground group-focus-within/section:text-accent-foreground',
        indicatorPosition === 'start' && '-rotate-90'
      )}
    />
  )

  return (
    <div
      className={cn(
        'flex',
        variant === 'section' &&
          'group/section hover:bg-accent hover:text-accent-foreground focus-within:bg-accent focus-within:text-accent-foreground items-center pr-2 pl-0.5'
      )}
    >
      <AccordionPrimitive.Header className="flex flex-1">
        <AccordionPrimitive.Trigger
          data-slot="accordion-trigger"
          className={cn(
            'flex flex-1 items-center text-left outline-none transition-colors focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50',
            variant === 'default' && 'gap-2 py-2 text-sm font-medium hover:text-foreground',
            variant === 'section' &&
              'text-foreground/70 group-hover/section:text-accent-foreground group-focus-within/section:text-accent-foreground h-auto gap-0.5 border-0 px-0.5 py-0.5 text-xs font-semibold tracking-wider whitespace-normal uppercase',
            indicatorPosition === 'end' && 'justify-between [&[data-panel-open]>svg]:rotate-180',
            indicatorPosition === 'start' && 'justify-start [&[data-panel-open]>svg]:rotate-0',
            className
          )}
          {...props}
        >
          {indicatorPosition === 'start' ? indicator : null}
          {children}
          {indicatorPosition === 'end' ? indicator : null}
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
    </div>
  )
}

type AccordionContentProps = AccordionPrimitive.Panel.Props & {
  padding?: 'default' | 'none'
}

function AccordionContent({
  className,
  children,
  padding = 'default',
  ...props
}: AccordionContentProps): React.JSX.Element {
  return (
    <AccordionPrimitive.Panel data-slot="accordion-content" className="overflow-hidden" {...props}>
      <div className={cn(padding === 'default' && 'pb-2 pt-0', className)}>{children}</div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
