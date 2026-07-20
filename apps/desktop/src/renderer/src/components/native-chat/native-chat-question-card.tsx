import { Check, Pencil } from '@phosphor-icons/react'
import { useState, type RefObject } from 'react'

import { X } from '@/components/regular-icons'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import type { AskAnswerSelection, AskPrompt } from './native-chat-interactive-prompt'
import { NATIVE_CHAT_CONTENT_WIDTH_CLASS } from './native-chat-layout'

export type NativeChatQuestionCardProps = {
  prompt: AskPrompt
  /** Whether the snapshotted answer is still being delivered to the agent. */
  isSubmitting?: boolean
  /** Deliver the chosen answer (per-question option indices + free text). */
  onAnswer: (selections: AskAnswerSelection[]) => void
  /** Dismiss the prompt (sends Escape to the agent). */
  onCancel: () => void
  /** Exposes the free-text row so pane-level Paste can target it while the
   *  card replaces the composer. */
  answerInputRef?: RefObject<HTMLInputElement | null>
}

/**
 * Native renderer for an agent's AskUserQuestion prompt: a numbered pick-list
 * (mobile/Claude-Code parity) with a header + close, a hover-highlighted row per
 * option, and an always-present free-text row for a custom answer. Single-select
 * commits on click; multi-select toggles and confirms via the trailing action.
 * Multi-question prompts step through tabs across the top. Neutral shadcn tokens.
 */
export function NativeChatQuestionCard({
  prompt,
  isSubmitting = false,
  onAnswer,
  onCancel,
  answerInputRef
}: NativeChatQuestionCardProps): React.JSX.Element {
  const [index, setIndex] = useState(0)
  // Keep option identity by index: labels are display text and are not guaranteed
  // unique, while Claude's selector commits the numbered row (STA-1860).
  const [selections, setSelections] = useState<number[][]>(() => prompt.questions.map(() => []))
  const [otherText, setOtherText] = useState<string[]>(() => prompt.questions.map(() => ''))

  const total = prompt.questions.length
  const isLast = index === total - 1
  const q = prompt.questions[index]!

  const setOther = (qi: number, value: string): void => {
    setOtherText((prev) => {
      const next = [...prev]
      next[qi] = value
      return next
    })
  }

  // The resolved answer for a question: picked labels plus any typed free-text.
  const answerFor = (qi: number, sel = selections, oth = otherText): string => {
    const question = prompt.questions[qi]
    const picked = (sel[qi] ?? [])
      .map((optionIndex) => question?.options[optionIndex]?.label ?? '')
      .filter((label) => label.length > 0)
    const other = (oth[qi] ?? '').trim()
    return [...picked, ...(other ? [other] : [])].join(', ')
  }

  const currentAnswered = answerFor(index).length > 0

  const submitAll = (sel: number[][], oth: string[]): void => {
    const resolved: AskAnswerSelection[] = prompt.questions.map((_, i) => {
      return { indices: [...(sel[i] ?? [])], other: (oth[i] ?? '').trim() }
    })
    const anyAnswered = resolved.some((s) => s.indices.length > 0 || (s.other ?? '').length > 0)
    if (anyAnswered) {
      onAnswer(resolved)
    }
  }

  // Advance to the next question, or submit on the last one — always from an
  // explicit snapshot so a just-committed single-select pick isn't lost to the
  // async setState.
  const advanceOrSubmit = (sel: number[][], oth: string[]): void => {
    if (isLast) {
      submitAll(sel, oth)
    } else {
      setIndex((i) => Math.min(i + 1, total - 1))
    }
  }

  // Selecting only highlights the row; submitting is an explicit step via the
  // trailing Send/Next button. (Auto-submitting on the first click dismissed the
  // card before the user saw any feedback, which read as "nothing happened".)
  const pickOption = (optionIndex: number): void => {
    setSelections((prev) => {
      const next = prev.map((s) => [...s])
      const cur = next[index] ?? []
      if (q.multiSelect) {
        next[index] = cur.includes(optionIndex)
          ? cur.filter((pickedIndex) => pickedIndex !== optionIndex)
          : [...cur, optionIndex].sort((a, b) => a - b)
      } else {
        next[index] = cur.includes(optionIndex) ? [] : [optionIndex]
      }
      return next
    })
  }

  // Trailing action (also fired by Enter). On any non-final question this just
  // advances — "Next" when answered, "Skip" when not — so skipping one question
  // never discards answers already given on the others. Only the final question
  // submits; an explicit Skip click there with nothing answered anywhere
  // dismisses, but a reflexive Enter in the empty field is a no-op so it can't
  // throw away the whole prompt.
  const confirm = (fromKeyboard = false): void => {
    if (!isLast) {
      advanceOrSubmit(selections, otherText)
      return
    }
    const anyAnswered = prompt.questions.some((_, i) => answerFor(i).length > 0)
    if (anyAnswered) {
      submitAll(selections, otherText)
    } else if (!fromKeyboard) {
      onCancel()
    }
  }

  return (
    // Part of the composer: docked in the bottom input region, matching the
    // composer's width and padding, rendered as the "ask" dialog card directly
    // above the text input. Its free-text row is the answer input.
    <div className="shrink-0" aria-busy={isSubmitting}>
      <div className="px-3 pt-2 pb-4 sm:px-4">
        <div className={cn('pointer-events-auto mx-auto w-full', NATIVE_CHAT_CONTENT_WIDTH_CLASS)}>
          {total > 1 ? (
            <div className="scrollbar-sleek mb-2 flex gap-1 overflow-x-auto pb-1">
              {prompt.questions.map((qq, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIndex(i)}
                  className={cn(
                    'flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium disabled:pointer-events-none',
                    i === index
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span className="max-w-[10rem] truncate">
                    {qq.header ||
                      translate('components.native-chat.question.step', 'Step {{value0}}', {
                        value0: i + 1
                      })}
                  </span>
                  {answerFor(i).length > 0 ? (
                    <Check className="text-primary size-3" strokeWidth={3} />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          <div className="border-input bg-card overflow-hidden border shadow-xs">
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
              <p
                className="text-foreground min-w-0 truncate text-sm font-semibold"
                title={q.question}
              >
                {q.question}
              </p>
              <button
                type="button"
                onClick={onCancel}
                aria-label={translate('components.native-chat.question.cancel', 'Cancel')}
                className="text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring flex size-6 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Scroll only kicks in on long option lists; the sleek scrollbar rides
              the card's right edge instead of crowding the choices. */}
            <div className="divide-border/60 border-border scrollbar-sleek max-h-[50vh] divide-y overflow-y-auto border-t">
              {q.options.map((opt, i) => (
                <OptionRow
                  key={`${i}:${opt.label}`}
                  badge={String(i + 1)}
                  label={opt.label}
                  description={opt.description}
                  selected={(selections[index] ?? []).includes(i)}
                  disabled={isSubmitting}
                  onSelect={() => pickOption(i)}
                />
              ))}
              <div className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-md">
                  <Pencil className="size-3.5" />
                </span>
                <input
                  ref={answerInputRef}
                  disabled={isSubmitting}
                  value={otherText[index]}
                  onChange={(e) => setOther(index, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      confirm(true)
                    }
                  }}
                  placeholder={translate(
                    'components.native-chat.question.otherPlaceholder',
                    'Type your answer'
                  )}
                  className="text-foreground placeholder:text-muted-foreground/60 min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-default disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => confirm()}
                  className={cn(
                    'w-24 shrink-0 rounded-md px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50',
                    currentAnswered
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {isSubmitting
                    ? translate('components.native-chat.question.sending', 'Sending…')
                    : currentAnswered
                      ? isLast
                        ? translate('components.native-chat.question.send', 'Send answer')
                        : translate('components.native-chat.question.next', 'Next')
                      : translate('components.native-chat.question.skip', 'Skip')}
                </button>
              </div>
            </div>
          </div>

          {total > 1 ? (
            <p className="text-muted-foreground mt-2 text-right text-xs">
              {index + 1}/{total}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function OptionRow({
  badge,
  label,
  description,
  selected,
  disabled,
  onSelect
}: {
  badge: string
  label: string
  description?: string
  selected: boolean
  disabled: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      // Selection is otherwise only the visual check/badge swap; expose it to
      // assistive tech.
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors disabled:pointer-events-none',
        selected ? 'bg-accent' : 'hover:bg-accent'
      )}
    >
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-medium',
          selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        {selected ? <Check className="size-3.5" strokeWidth={3} /> : badge}
      </span>
      <span className="min-w-0">
        <span className="text-foreground block truncate text-sm" title={label}>
          {label}
        </span>
        {description ? (
          <span className="text-muted-foreground block truncate text-xs" title={description}>
            {description}
          </span>
        ) : null}
      </span>
    </button>
  )
}
