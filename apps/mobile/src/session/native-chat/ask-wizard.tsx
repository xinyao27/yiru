import { useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'

import { Check } from '../../components/uniwind-icons'
import { cn } from '../../style/class-names'
import type { AskAnswerSelection, AskPrompt } from './ask'

type Props = {
  prompt: AskPrompt
  /** Deliver the chosen answer (per-question option indices + free text) —
   *  index-based so Claude's arrow-navigate selector can be driven by the
   *  option's stable number instead of pasted label text (STA-1860). */
  onAnswer: (selections: AskAnswerSelection[]) => Promise<boolean>
  onCancel?: () => Promise<boolean>
}

// Sentinel index for the free-text "Other…" row (never a real option index).
const OTHER = -1

/** Native renderer for an agent's AskUserQuestion prompt as a wizard: one
 *  question per step with tabs across the top, a Next button that advances (Send
 *  on the last step), and a Cancel that dismisses the prompt. Neutral styling
 *  with a subtle green accent on the active choice to match the rest of the app. */
export function MobileNativeChatAsk({ prompt, onAnswer, onCancel }: Props): React.JSX.Element {
  const [index, setIndex] = useState(0)
  const [selections, setSelections] = useState<number[][]>(() => prompt.questions.map(() => []))
  const [otherText, setOtherText] = useState<string[]>(() => prompt.questions.map(() => ''))
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const toggle = (qi: number, optIndex: number, multi: boolean): void => {
    setSelections((prev) => {
      const next = prev.map((s) => [...s])
      const cur = next[qi] ?? []
      if (multi) {
        next[qi] = cur.includes(optIndex) ? cur.filter((i) => i !== optIndex) : [...cur, optIndex]
      } else {
        next[qi] = cur.includes(optIndex) ? [] : [optIndex]
      }
      return next
    })
  }

  const setOther = (qi: number, value: string): void => {
    setOtherText((prev) => {
      const next = [...prev]
      next[qi] = value
      return next
    })
  }

  const selectionFor = (qi: number): AskAnswerSelection => {
    const picked = (selections[qi] ?? []).filter((i) => i !== OTHER)
    const other = (selections[qi] ?? []).includes(OTHER) ? (otherText[qi] ?? '').trim() : ''
    return other ? { indices: picked, other } : { indices: picked }
  }

  const isAnswered = (qi: number): boolean => {
    const sel = selectionFor(qi)
    return sel.indices.length > 0 || (sel.other ?? '').length > 0
  }

  const total = prompt.questions.length
  const isLast = index === total - 1
  const currentAnswered = useMemo(
    () => isAnswered(index),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selections, otherText, index]
  )
  const allAnswered = useMemo(
    () => prompt.questions.every((_, i) => isAnswered(i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [otherText, prompt.questions, selections]
  )
  const canAdvance = !submitting && (isLast ? allAnswered : currentAnswered)

  const submit = async (): Promise<void> => {
    if (!allAnswered || submittingRef.current) {
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    try {
      await onAnswer(prompt.questions.map((_, i) => selectionFor(i)))
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const advance = async (): Promise<void> => {
    if (isLast) {
      await submit()
    } else {
      setIndex((i) => Math.min(i + 1, total - 1))
    }
  }

  const q = prompt.questions[index]!
  const otherSelected = (selections[index] ?? []).includes(OTHER)

  return (
    <View className="bg-card border-t-hairline border-t-border max-h-[380px]">
      {total > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="border-b-hairline border-b-border grow-0 pt-2"
          contentContainerClassName="px-2 gap-1 items-center"
          keyboardShouldPersistTaps="always"
        >
          {prompt.questions.map((qq, i) => (
            <Pressable
              key={i}
              className={cn(
                'flex-row items-center gap-1 min-h-9 px-2 py-1 border-b-2 border-b-transparent',
                i === index && 'border-b-green-500'
              )}
              onPress={() => setIndex(i)}
            >
              <Text
                className={cn(
                  'text-muted-foreground text-xs font-semibold',
                  i === index && 'text-foreground'
                )}
                numberOfLines={1}
              >
                {qq.header || `Step ${i + 1}`}
              </Text>
              {isAnswered(i) ? <Check size={11} colorClassName="accent-green-500" /> : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView className="px-3" keyboardShouldPersistTaps="always">
        <Text className="text-foreground my-2 text-sm font-semibold">{q.question}</Text>
        {q.options.map((opt, optIndex) => (
          <OptionRow
            key={`${optIndex}:${opt.label}`}
            label={opt.label}
            description={opt.description}
            selected={(selections[index] ?? []).includes(optIndex)}
            multi={q.multiSelect}
            onPress={() => toggle(index, optIndex, q.multiSelect)}
          />
        ))}
        <OptionRow
          label="Other…"
          selected={otherSelected}
          multi={q.multiSelect}
          onPress={() => toggle(index, OTHER, q.multiSelect)}
        />
        {otherSelected ? (
          <TextInput
            className="bg-secondary border-border text-foreground mb-1 min-h-11 border p-2 text-sm"
            value={otherText[index]}
            onChangeText={(v) => setOther(index, v)}
            placeholder="Type your answer"
            placeholderTextColorClassName="accent-muted-foreground"
            multiline
            autoFocus
          />
        ) : null}
      </ScrollView>

      <View className="border-t-hairline border-t-border flex-row items-center justify-between gap-2 p-3">
        <Pressable
          className="px-2 py-2"
          onPress={async () => {
            if (!submittingRef.current && onCancel) {
              submittingRef.current = true
              setSubmitting(true)
              try {
                await onCancel()
              } finally {
                submittingRef.current = false
                setSubmitting(false)
              }
            }
          }}
          disabled={submitting}
          hitSlop={8}
        >
          <Text className="text-muted-foreground text-sm font-semibold">Cancel</Text>
        </Pressable>
        {total > 1 ? (
          <Text className="text-muted-foreground/60 text-xs">
            {index + 1}/{total}
          </Text>
        ) : null}
        <Pressable
          className={cn('py-2 px-4 bg-primary', !canAdvance && 'bg-secondary')}
          onPress={advance}
          disabled={!canAdvance}
        >
          <Text
            className={cn(
              'text-primary-foreground text-sm font-bold',
              !canAdvance && 'text-muted-foreground/60'
            )}
          >
            {isLast ? 'Send answer' : 'Next'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function OptionRow({
  label,
  description,
  selected,
  multi,
  onPress
}: {
  label: string
  description?: string
  selected: boolean
  multi?: boolean
  onPress: () => void
}): React.JSX.Element {
  return (
    <Pressable
      className={cn(
        'flex-row gap-2 p-2 bg-secondary border border-border mb-1',
        selected && 'border-green-500'
      )}
      onPress={onPress}
    >
      {/* Multi-select reads as a checkbox (square); single-select as a radio (circle). */}
      <View
        className={cn(
          'w-[18px] h-[18px] border-[1.5px] border-muted-foreground/60 items-center justify-center mt-[1px]',
          multi ? '' : '',
          selected && 'bg-green-500 border-green-500'
        )}
      >
        {selected ? <Check size={12} colorClassName="accent-primary-foreground" /> : null}
      </View>
      <View className="flex-1 gap-[2px]">
        <Text className="text-foreground text-sm font-semibold">{label}</Text>
        {description ? (
          <Text className="text-muted-foreground text-xs" numberOfLines={3}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}
