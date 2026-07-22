import {
  Warning as AlertTriangle,
  CalendarDots as CalendarClock,
  CheckCircle as CheckCircle2,
  Clock,
  Fingerprint,
  Chat as MessageSquare,
  Sparkle as Sparkles,
  Terminal
} from '@phosphor-icons/react'
import type { Icon as PhosphorIcon } from '@phosphor-icons/react'
import React, { useMemo, useState } from 'react'

import { CaretDown as ChevronDown, CaretRight as ChevronRight } from '@/components/regular-icons'
import CommentMarkdown from '@/components/sidebar/comment-markdown'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import {
  formatAutomationSchedule,
  isValidAutomationSchedule
} from '../../../../shared/automation-schedules'
import { parseHermesOutput, type ParsedHermesSection } from './hermes-cron-output-parse'

function isPromptSection(section: ParsedHermesSection): boolean {
  return /^prompt$/i.test(section.heading.trim())
}

function isResponseSection(section: ParsedHermesSection): boolean {
  return /^response$/i.test(section.heading.trim())
}

function isErrorSection(section: ParsedHermesSection): boolean {
  return /^error$/i.test(section.heading.trim())
}

function getScheduleDisplay(value: string): string | null {
  const trimmed = value.trim()
  if (!isValidAutomationSchedule(trimmed)) {
    return null
  }
  return formatAutomationSchedule(trimmed)
}

function isScheduleMetadataLabel(label: string): boolean {
  return /^(?:schedule|cron schedule|cron)$/i.test(label.trim())
}

function getMetadataDisplayLabel(label: string): string {
  return isScheduleMetadataLabel(label) ? 'Schedule' : label
}

type MetadataIconStyle = { icon: PhosphorIcon; iconClass: string; ringClass: string }

function getMetadataIconStyle(label: string): MetadataIconStyle {
  const normalized = label.toLowerCase()
  if (/(^|\s)(job\s*id|id)(\s|$)/.test(normalized)) {
    return {
      icon: Fingerprint,
      iconClass: 'text-violet-400',
      ringClass: 'bg-violet-500/10'
    }
  }
  if (/time|run/.test(normalized)) {
    return {
      icon: Clock,
      iconClass: 'text-sky-400',
      ringClass: 'bg-sky-500/10'
    }
  }
  if (/schedule|cron/.test(normalized)) {
    return {
      icon: CalendarClock,
      iconClass: 'text-amber-400',
      ringClass: 'bg-amber-500/10'
    }
  }
  return {
    icon: Sparkles,
    iconClass: 'text-muted-foreground',
    ringClass: 'bg-muted/40'
  }
}

type CollapsibleSectionProps = {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  tone?: 'default' | 'muted'
  icon?: PhosphorIcon
  iconClass?: string
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
  tone = 'default',
  icon: Icon,
  iconClass
}: CollapsibleSectionProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border border-border/50',
        tone === 'muted' ? 'bg-muted/15' : 'bg-background'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-foreground hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold tracking-wide uppercase transition-colors"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {Icon ? <Icon className={cn('size-3.5', iconClass ?? 'text-muted-foreground')} /> : null}
        {title}
      </button>
      {open ? <div className="border-border/50 border-t px-4 py-3">{children}</div> : null}
    </section>
  )
}

type SectionCardProps = {
  title: string
  accent?: 'response' | 'error' | 'default'
  children: React.ReactNode
}

function SectionCard({ title, accent = 'default', children }: SectionCardProps): React.JSX.Element {
  const Icon = accent === 'error' ? AlertTriangle : CheckCircle2
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-lg border',
        accent === 'error'
          ? 'border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-background to-background'
          : accent === 'response'
            ? 'border-emerald-500/25 bg-gradient-to-br from-emerald-500/5 via-background to-background'
            : 'border-border/50 bg-background'
      )}
    >
      <header
        className={cn(
          'flex items-center gap-2 border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-wide',
          accent === 'error'
            ? 'border-rose-500/20 text-rose-700 dark:text-rose-300'
            : accent === 'response'
              ? 'border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
              : 'border-border/50 text-foreground'
        )}
      >
        {accent !== 'default' ? <Icon className="size-3.5" /> : null}
        {title}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  )
}

function MetadataValue({ label, value }: { label: string; value: string }): React.JSX.Element {
  const scheduleDisplay = isScheduleMetadataLabel(label) ? getScheduleDisplay(value) : null

  if (!scheduleDisplay) {
    return <dd className="text-foreground mt-0.5 font-mono text-xs break-all">{value}</dd>
  }

  return (
    <dd className="text-foreground mt-0.5 text-xs font-medium break-words">{scheduleDisplay}</dd>
  )
}

export function HermesCronOutputView({ content }: { content: string }): React.JSX.Element {
  const parsed = useMemo(() => parseHermesOutput(content), [content])

  const responseSection = parsed.sections.find(isResponseSection)
  const errorSection = parsed.sections.find(isErrorSection)
  const promptSection = parsed.sections.find(isPromptSection)
  const otherSections = parsed.sections.filter(
    (section) =>
      !isResponseSection(section) && !isErrorSection(section) && !isPromptSection(section)
  )

  const hasStructure =
    parsed.metadata.length > 0 || [responseSection, errorSection, promptSection].some(Boolean)

  if (!hasStructure) {
    return (
      <CommentMarkdown
        variant="document"
        content={content}
        className="text-foreground text-sm leading-relaxed"
      />
    )
  }

  return (
    <div className="space-y-4">
      {parsed.metadata.length > 0 ? (
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {parsed.metadata.map((entry) => {
            const { icon: Icon, iconClass, ringClass } = getMetadataIconStyle(entry.label)
            return (
              <div
                key={entry.label}
                className="border-border/50 bg-muted/15 flex items-start gap-3 rounded-lg border px-3 py-2.5"
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
                    ringClass
                  )}
                >
                  <Icon className={cn('size-3.5', iconClass)} />
                </span>
                <div className="min-w-0 flex-1">
                  <dt className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
                    {getMetadataDisplayLabel(entry.label)}
                  </dt>
                  <MetadataValue label={entry.label} value={entry.value} />
                </div>
              </div>
            )
          })}
        </dl>
      ) : null}

      {errorSection ? (
        <SectionCard
          title={translate('auto.components.automations.HermesCronOutputView.05affc68e3', 'Error')}
          accent="error"
        >
          <CommentMarkdown
            variant="document"
            content={errorSection.body}
            className="text-foreground text-sm leading-relaxed"
          />
        </SectionCard>
      ) : null}

      {responseSection ? (
        <SectionCard
          title={translate(
            'auto.components.automations.HermesCronOutputView.4557213074',
            'Response'
          )}
          accent="response"
        >
          <CommentMarkdown
            variant="document"
            content={responseSection.body}
            className="text-foreground text-sm leading-relaxed"
          />
        </SectionCard>
      ) : null}

      {promptSection ? (
        <CollapsibleSection
          title={translate('auto.components.automations.HermesCronOutputView.e27c716b43', 'Prompt')}
          tone="muted"
          icon={MessageSquare}
          iconClass="text-indigo-700 dark:text-indigo-400"
        >
          <CommentMarkdown
            variant="document"
            content={promptSection.body}
            className="text-foreground/90 text-sm leading-relaxed"
          />
        </CollapsibleSection>
      ) : null}

      {otherSections.map((section) => (
        <CollapsibleSection
          key={section.heading}
          title={section.heading}
          tone="muted"
          icon={Terminal}
          iconClass="text-muted-foreground"
        >
          <CommentMarkdown
            variant="document"
            content={section.body}
            className="text-foreground/90 text-sm leading-relaxed"
          />
        </CollapsibleSection>
      ))}
    </div>
  )
}
