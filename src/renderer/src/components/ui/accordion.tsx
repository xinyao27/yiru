'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion'

import { cn } from '@/lib/utils'

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props): React.JSX.Element {
  return <AccordionPrimitive.Root data-slot="accordion" className={cn(className)} {...props} />
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props): React.JSX.Element {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn('border-b last:border-b-0', className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props): React.JSX.Element {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'flex flex-1 items-center justify-between gap-2 py-2 text-left text-sm font-medium outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&[data-panel-open]>svg]:rotate-180',
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props): React.JSX.Element {
  return (
    <AccordionPrimitive.Panel data-slot="accordion-content" className="overflow-hidden" {...props}>
      <div className={cn('pb-2 pt-0', className)}>{children}</div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
