import { useMemo, useRef, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'

import { ArrowUp, Check, Question as CircleHelp } from '../../components/uniwind-icons'
import { cn } from '../../style/class-names'
import { formatQuestionAnswer, type MobileChatQuestion } from './question'

type MobileNativeChatQuestionProps = {
  question: MobileChatQuestion
  onAnswer: (text: string) => Promise<boolean>
}

/** Renders an agent's choice prompt as a tappable card. Single-select answers
 *  on tap; multi-select toggles then Submits; an always-present text entry lets
 *  the user answer freely (the escape hatch) when the heuristic misreads the
 *  options or none apply. */
export function MobileNativeChatQuestion({
  question,
  onAnswer
}: MobileNativeChatQuestionProps): React.JSX.Element {
  const [selected, setSelected] = useState<string[]>([])
  const [freeText, setFreeText] = useState('')
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)

  const hasOptions = question.options.length > 0
  const trimmedFreeText = freeText.trim()

  const toggle = (option: string): void => {
    setSelected((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]
    )
  }

  const sendAnswer = async (text: string): Promise<boolean> => {
    if (sendingRef.current) {
      return false
    }
    sendingRef.current = true
    setSending(true)
    try {
      return await onAnswer(text)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const answerSingle = async (option: string): Promise<void> => {
    await sendAnswer(formatQuestionAnswer(question, [option]))
  }

  const submitMulti = async (): Promise<void> => {
    if (selected.length === 0) {
      return
    }
    await sendAnswer(formatQuestionAnswer(question, selected))
  }

  const submitFreeText = async (): Promise<void> => {
    if (trimmedFreeText.length === 0) {
      return
    }
    // Free text is an unknown entry; formatQuestionAnswer passes it through.
    if (await sendAnswer(formatQuestionAnswer(question, [trimmedFreeText]))) {
      setFreeText('')
    }
  }

  const canSubmitMulti = selected.length > 0 && !sending
  const canSendFreeText = trimmedFreeText.length > 0 && !sending

  // Stable keys for option rows even if an agent repeats a label.
  const optionRows = useMemo(
    () => question.options.map((label, index) => ({ label, key: `${index}:${label}` })),
    [question.options]
  )

  return (
    <View className="bg-card border-hairline border-border mx-4 my-2 gap-2 rounded-2xl p-3">
      <View className="flex-row items-center gap-2">
        <CircleHelp size={15} colorClassName="accent-primary" />
        <Text className="text-foreground flex-1 text-sm leading-[21px] font-semibold">
          {question.question}
        </Text>
      </View>

      {hasOptions ? (
        <View className="gap-1">
          {optionRows.map(({ label, key }) => {
            const isSelected = selected.includes(label)
            return (
              <Pressable
                key={key}
                accessibilityRole={question.multiSelect ? 'checkbox' : 'button'}
                accessibilityState={question.multiSelect ? { checked: isSelected } : undefined}
                className={cn(
                  'flex-row items-center gap-2 min-h-11 rounded-xl px-3 py-2 bg-secondary border-hairline border-border',
                  isSelected && 'border-primary',
                  styles.pressedActive
                )}
                onPress={() => (question.multiSelect ? toggle(label) : answerSingle(label))}
              >
                {question.multiSelect ? (
                  <View
                    className={cn(
                      'w-5 h-5 rounded-md border-[1.5px] border-muted-foreground/60 items-center justify-center',
                      isSelected && 'bg-primary border-primary'
                    )}
                  >
                    {isSelected ? (
                      <Check size={13} colorClassName="accent-primary-foreground" />
                    ) : null}
                  </View>
                ) : null}
                <Text className="text-foreground flex-1 text-sm">{label}</Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {question.multiSelect && hasOptions ? (
        <Pressable
          accessibilityLabel="Submit selected options"
          className={cn(
            'min-h-11 items-center justify-center rounded-xl bg-primary',
            !canSubmitMulti && 'bg-secondary',
            canSubmitMulti && styles.pressedActive
          )}
          onPress={submitMulti}
          disabled={!canSubmitMulti}
        >
          <Text
            className={cn(
              'text-primary-foreground text-sm font-semibold',
              !canSubmitMulti && 'text-muted-foreground/60'
            )}
          >
            Submit{selected.length > 0 ? ` (${selected.length})` : ''}
          </Text>
        </Pressable>
      ) : null}

      <View className="flex-row items-end gap-2">
        <TextInput
          className="text-foreground bg-secondary max-h-[120px] min-h-10 flex-1 rounded-xl px-3 pt-2 pb-2 text-sm"
          value={freeText}
          onChangeText={setFreeText}
          placeholder={hasOptions ? 'Or type a reply…' : 'Type your reply…'}
          placeholderTextColorClassName="accent-muted-foreground"
          selectionColorClassName="accent-primary"
          onSubmitEditing={submitFreeText}
          returnKeyType="send"
          multiline
        />
        <Pressable
          accessibilityLabel="Send reply"
          className={cn(
            'w-10 h-10 items-center justify-center rounded-full bg-primary',
            !canSendFreeText && 'bg-secondary',
            canSendFreeText && styles.pressedActive
          )}
          onPress={submitFreeText}
          disabled={!canSendFreeText}
        >
          <ArrowUp
            size={18}
            colorClassName={
              canSendFreeText ? 'accent-primary-foreground' : 'accent-muted-foreground'
            }
          />
        </Pressable>
      </View>
    </View>
  )
}

const styles = {
  pressedActive: cn('active:bg-accent')
} as const
