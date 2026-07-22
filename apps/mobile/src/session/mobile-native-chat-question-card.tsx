import { useMemo, useRef, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'

import { ArrowUp, Check, Question as CircleHelp } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { formatQuestionAnswer, type MobileChatQuestion } from './mobile-native-chat-question'

type Props = {
  question: MobileChatQuestion
  onAnswer: (text: string) => Promise<boolean>
}

/** Renders an agent's choice prompt as a tappable card. Single-select answers
 *  on tap; multi-select toggles then Submits; an always-present text entry lets
 *  the user answer freely (the escape hatch) when the heuristic misreads the
 *  options or none apply. */
export function MobileNativeChatQuestion({ question, onAnswer }: Props): React.JSX.Element {
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
    <View className={styles.card}>
      <View className={styles.header}>
        <CircleHelp size={15} colorClassName="accent-primary" />
        <Text className={styles.question}>{question.question}</Text>
      </View>

      {hasOptions ? (
        <View className={styles.options}>
          {optionRows.map(({ label, key }) => {
            const isSelected = selected.includes(label)
            return (
              <Pressable
                key={key}
                accessibilityRole={question.multiSelect ? 'checkbox' : 'button'}
                accessibilityState={question.multiSelect ? { checked: isSelected } : undefined}
                className={cn(
                  styles.option,
                  isSelected && styles.optionSelected,
                  styles.pressedActive
                )}
                onPress={() => (question.multiSelect ? toggle(label) : answerSingle(label))}
              >
                {question.multiSelect ? (
                  <View className={cn(styles.checkbox, isSelected && styles.checkboxOn)}>
                    {isSelected ? (
                      <Check size={13} colorClassName="accent-primary-foreground" />
                    ) : null}
                  </View>
                ) : null}
                <Text className={styles.optionText}>{label}</Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {question.multiSelect && hasOptions ? (
        <Pressable
          accessibilityLabel="Submit selected options"
          className={cn(
            styles.submit,
            !canSubmitMulti && styles.submitDisabled,
            canSubmitMulti && styles.pressedActive
          )}
          onPress={submitMulti}
          disabled={!canSubmitMulti}
        >
          <Text className={cn(styles.submitText, !canSubmitMulti && styles.submitTextDisabled)}>
            Submit{selected.length > 0 ? ` (${selected.length})` : ''}
          </Text>
        </Pressable>
      ) : null}

      <View className={styles.freeTextRow}>
        <TextInput
          className={styles.freeInput}
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
            styles.freeSend,
            !canSendFreeText && styles.freeSendDisabled,
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
  card: cn('mx-4 my-2 p-3 gap-2 bg-card rounded-none border-hairline border-border'),
  header: cn('flex-row items-center gap-2'),
  question: cn('flex-1 text-foreground text-[15px] font-semibold leading-[21px]'),
  options: cn('gap-1'),
  option: cn(
    'flex-row items-center gap-2 min-h-11 px-3 py-2 bg-secondary rounded-none border-hairline border-border'
  ),
  optionSelected: cn('border-primary'),
  optionText: cn('flex-1 text-foreground text-[15px]'),
  checkbox: cn(
    'w-5 h-5 rounded-none border-[1.5px] border-muted-foreground/60 items-center justify-center'
  ),
  checkboxOn: cn('bg-primary border-primary'),
  submit: cn('min-h-11 items-center justify-center rounded-none bg-primary'),
  submitDisabled: cn('bg-secondary'),
  submitText: cn('text-primary-foreground text-[15px] font-semibold'),
  submitTextDisabled: cn('text-muted-foreground/60'),
  freeTextRow: cn('flex-row items-end gap-2'),
  freeInput: cn(
    'flex-1 min-h-10 max-h-[120px] text-foreground text-[15px] bg-secondary rounded-none px-3 pt-2 pb-2'
  ),
  freeSend: cn('w-10 h-10 rounded-none items-center justify-center bg-foreground'),
  freeSendDisabled: cn('bg-secondary'),
  pressed: cn('opacity-[0.7]'),
  pressedActive: cn('active:opacity-[0.7]')
} as const
