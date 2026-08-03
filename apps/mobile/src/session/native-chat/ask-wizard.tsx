import { useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassPressable } from '~/components/glass/pressable'
import { MobileGlassSurface } from '~/components/glass/surface'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { Check } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'
import { cn } from '~/style/class-names'

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
  const currentAnswered = isAnswered(index)
  const allAnswered = prompt.questions.every((_, questionIndex) => isAnswered(questionIndex))
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
    <MobileGlassSurface className="max-h-96 overflow-hidden rounded-t-3xl" isFunctional>
      {total > 1 ? (
        <MobileGlassGroup spacing={8}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="border-b-hairline border-b-border grow-0 pt-2"
            contentContainerClassName="px-2 gap-2 items-center"
            keyboardShouldPersistTaps="always"
          >
            {prompt.questions.map((qq, questionIndex) => (
              <MobileGlassPressable
                key={`${qq.header}:${qq.question}`}
                className="rounded-full"
                contentClassName="min-h-8 flex-row items-center gap-1 rounded-full px-3 py-1"
                isSelected={questionIndex === index}
                onPress={() => setIndex(questionIndex)}
              >
                <Text
                  className={cn(
                    'text-muted-foreground text-xs',
                    questionIndex === index && 'text-foreground'
                  )}
                  numberOfLines={1}
                >
                  {qq.header ||
                    translate('mobile.nativeChat.ask.step', 'Step {{number}}', {
                      number: questionIndex + 1
                    })}
                </Text>
                {isAnswered(questionIndex) ? (
                  <Check size={11} colorClassName="accent-green-500" />
                ) : null}
              </MobileGlassPressable>
            ))}
          </ScrollView>
        </MobileGlassGroup>
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
          label={translate('mobile.nativeChat.ask.other', 'Other…')}
          selected={otherSelected}
          multi={q.multiSelect}
          onPress={() => toggle(index, OTHER, q.multiSelect)}
        />
        {otherSelected ? (
          <MobileGlassSurface className="mb-1 min-h-11 overflow-hidden rounded-xl" isInteractive>
            <TextInput
              className="text-foreground min-h-11 p-2 text-sm"
              value={otherText[index]}
              onChangeText={(value) => setOther(index, value)}
              placeholder={translate('mobile.nativeChat.ask.answerPlaceholder', 'Type your answer')}
              placeholderTextColorClassName="accent-muted-foreground"
              multiline
              autoFocus
            />
          </MobileGlassSurface>
        ) : null}
      </ScrollView>

      <MobileGlassGroup
        className="border-t-hairline border-t-border flex-row items-center justify-between gap-2 p-3"
        spacing={8}
      >
        <MobileGlassTextButton
          disabled={submitting}
          label={translate('mobile.common.cancel', 'Cancel')}
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
          size="small"
        />
        {total > 1 ? (
          <Text className="text-muted-foreground text-xs">
            {index + 1}/{total}
          </Text>
        ) : null}
        <MobileGlassTextButton
          disabled={!canAdvance}
          isProminent
          label={
            isLast
              ? translate('mobile.nativeChat.ask.sendAnswer', 'Send answer')
              : translate('mobile.common.next', 'Next')
          }
          onPress={() => void advance()}
          size="small"
        />
      </MobileGlassGroup>
    </MobileGlassSurface>
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
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={multi ? { checked: selected } : { selected }}
      className={cn(
        'mb-1 min-h-11 flex-row items-center gap-2 rounded-xl p-2 active:bg-accent',
        selected && 'bg-accent'
      )}
      onPress={onPress}
    >
      <View
        className={cn(
          'border-border mt-1 h-5 w-5 items-center justify-center border-2',
          multi ? 'rounded-md' : 'rounded-full',
          selected && 'border-green-500 bg-green-500'
        )}
      >
        {selected ? <Check size={12} colorClassName="accent-primary-foreground" /> : null}
      </View>
      <View className="flex-1 gap-1">
        <Text className="text-foreground text-sm">{label}</Text>
        {description ? (
          <Text className="text-muted-foreground text-xs" numberOfLines={3}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}
