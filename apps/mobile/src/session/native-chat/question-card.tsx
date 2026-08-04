import { cn } from 'cnfast'
import { useMemo, useRef, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'

import { MobileContentSection } from '~/components/content-section'
import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { MobileGlassSurface } from '~/components/glass/surface'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { Check, Question as CircleHelp } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

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
    <MobileContentSection className="mx-4 my-2 gap-2 p-3">
      <View className="flex-row items-center gap-2">
        <CircleHelp size={15} colorClassName="accent-primary" />
        <Text className="text-foreground flex-1 text-sm leading-5 font-semibold">
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
                accessibilityState={
                  question.multiSelect ? { checked: isSelected } : { selected: isSelected }
                }
                className={cn(
                  'min-h-11 flex-row items-center gap-2 rounded-xl px-3 py-2 active:bg-accent',
                  isSelected && 'bg-accent'
                )}
                onPress={() => (question.multiSelect ? toggle(label) : answerSingle(label))}
              >
                {question.multiSelect ? (
                  <View
                    className={cn(
                      'border-border h-5 w-5 items-center justify-center rounded-md border-2',
                      isSelected && 'border-primary bg-primary'
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
        <MobileGlassTextButton
          accessibilityLabel={translate(
            'mobile.session.chat.question.submitSelectedAccessibility',
            'Submit selected options'
          )}
          disabled={!canSubmitMulti}
          isFullWidth
          isProminent
          label={
            selected.length > 0
              ? translate('mobile.session.chat.question.submitCount', 'Submit ({{count}})', {
                  count: selected.length
                })
              : translate('mobile.session.chat.question.submit', 'Submit')
          }
          onPress={() => void submitMulti()}
          size="large"
        />
      ) : null}

      <MobileGlassGroup className="flex-row items-end gap-2" spacing={8}>
        <MobileGlassSurface
          className="max-h-30 min-h-11 flex-1 overflow-hidden rounded-xl"
          isInteractive
        >
          <TextInput
            className="text-foreground min-h-11 px-3 py-2 text-sm"
            value={freeText}
            onChangeText={setFreeText}
            placeholder={
              hasOptions
                ? translate(
                    'mobile.session.chat.question.otherReplyPlaceholder',
                    'Or type a reply…'
                  )
                : translate('mobile.session.chat.question.replyPlaceholder', 'Type your reply…')
            }
            placeholderTextColorClassName="accent-muted-foreground"
            selectionColorClassName="accent-primary"
            onSubmitEditing={submitFreeText}
            returnKeyType="send"
            multiline
          />
        </MobileGlassSurface>
        <MobileGlassIconButton
          accessibilityLabel={translate('mobile.session.chat.question.sendReply', 'Send reply')}
          disabled={!canSendFreeText}
          icon="send"
          onPress={() => void submitFreeText()}
          size="regular"
        />
      </MobileGlassGroup>
    </MobileContentSection>
  )
}
