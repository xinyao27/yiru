import { Image as ImageIcon, ImageBroken as ImageOff, X } from '@phosphor-icons/react'
import type { ClipboardEventHandler, KeyboardEventHandler, RefObject } from 'react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { basename } from '@/lib/path'

import type {
  SessionOptionDescriptor,
  SessionOptionsSurface
} from '../../../../shared/native-chat-session-options'
import { NATIVE_FILE_DROP_TARGET } from '../../../../shared/native-file-drop'
import { NativeChatMentionHint, NativeChatPickerMenu } from './native-chat-autocomplete-menus'
import { NativeChatComposerActions } from './native-chat-composer-actions'
import type { ComposerAutocomplete, NativeChatPickerItem } from './native-chat-composer-state'
import { nativeChatComposerPlaceholder } from './native-chat-composer-target'
import { isNativeChatPastedImagePath } from './native-chat-image-paste'
import { NATIVE_CHAT_CONTENT_WIDTH_CLASS } from './native-chat-layout'

export type NativeChatComposerFieldProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  draft: string
  disabled: boolean
  hasPty: boolean
  canSend: boolean
  autocomplete: ComposerAutocomplete
  activeSuggestion: number
  notice: string | null
  imageAttachments: readonly NativeChatComposerImageAttachment[]
  sendButtonDisabled: boolean
  isWorking: boolean
  attachDisabled: boolean
  dictationDisabled: boolean
  isDictating: boolean
  isDictationHoldMode: boolean
  onDraftChange: (value: string, element: HTMLTextAreaElement) => void
  onTextareaSelect: (element: HTMLTextAreaElement) => void
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>
  pickerListboxId: string
  onChoosePickerItem: (item: NativeChatPickerItem) => void
  onRetrySkills: () => void
  onAcceptMention: () => void
  onRemoveImageAttachment: (id: string) => void
  onAttach: () => void
  onDictationToggle: () => void
  onDictationHoldStart: () => void
  onDictationHoldEnd: () => void
  onSend: () => void
  onStop?: () => void
  sessionOptionsSurface: SessionOptionsSurface | null
  sessionOptionsSnapshot: SessionOptionDescriptor[]
}

export type NativeChatComposerImageAttachment = {
  id: string
  path: string
}

export function NativeChatComposerField({
  textareaRef,
  draft,
  disabled,
  hasPty,
  canSend,
  autocomplete,
  activeSuggestion,
  notice,
  imageAttachments,
  sendButtonDisabled,
  isWorking,
  attachDisabled,
  dictationDisabled,
  isDictating,
  isDictationHoldMode,
  onDraftChange,
  onTextareaSelect,
  onKeyDown,
  onPaste,
  pickerListboxId,
  onChoosePickerItem,
  onRetrySkills,
  onAcceptMention,
  onRemoveImageAttachment,
  onAttach,
  onDictationToggle,
  onDictationHoldStart,
  onDictationHoldEnd,
  onSend,
  onStop,
  sessionOptionsSurface,
  sessionOptionsSnapshot
}: NativeChatComposerFieldProps): React.JSX.Element {
  return (
    <div className="shrink-0">
      {/* Extra bottom padding keeps the input box off the window rim. */}
      <div className="px-3 pt-2 pb-4 sm:px-4">
        <div
          className={cn(
            'pointer-events-auto relative mx-auto w-full',
            NATIVE_CHAT_CONTENT_WIDTH_CLASS
          )}
        >
          {autocomplete.mode === 'slash' || autocomplete.mode === 'skill' ? (
            <NativeChatPickerMenu
              autocomplete={autocomplete}
              activeIndex={activeSuggestion}
              listboxId={pickerListboxId}
              onChoose={onChoosePickerItem}
              onRetry={onRetrySkills}
            />
          ) : null}
          {autocomplete.mode === 'mention' ? (
            <NativeChatMentionHint query={autocomplete.query} onAccept={onAcceptMention} />
          ) : null}
          {notice ? (
            <div className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs">
              <ImageOff className="size-3.5 shrink-0" />
              <span>{notice}</span>
            </div>
          ) : null}
          <div
            data-native-file-drop-target={NATIVE_FILE_DROP_TARGET.composer}
            className={cn(
              'border border-input bg-card p-1.5 transition-colors',
              'focus-within:border-ring dark:bg-input/30'
            )}
          >
            {imageAttachments.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5 px-1">
                {imageAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="border-border bg-background text-muted-foreground flex max-w-full items-center gap-1.5 border px-2 py-1 text-xs"
                    title={attachment.path}
                  >
                    <ImageIcon className="size-3.5 shrink-0" />
                    <span className="max-w-56 truncate">
                      {isNativeChatPastedImagePath(attachment.path)
                        ? translate(
                            'components.native-chat.composer.pastedImageLabel',
                            'Pasted image'
                          )
                        : basename(attachment.path)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      type="button"
                      onClick={() => onRemoveImageAttachment(attachment.id)}
                      aria-label={translate(
                        'components.native-chat.composer.removeAttachment',
                        'Remove attachment'
                      )}
                      className="text-muted-foreground flex size-4 transition-colors"
                    >
                      <X weight="regular" className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            {/* Why: keep native so field-sizing, IME composition, and selection
                callbacks share one HTMLTextAreaElement without Input chrome. */}
            <textarea
              ref={textareaRef}
              value={draft}
              disabled={disabled}
              rows={1}
              onChange={(e) => onDraftChange(e.target.value, e.currentTarget)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onSelect={(e) => onTextareaSelect(e.currentTarget)}
              aria-expanded={autocomplete.mode === 'slash' || autocomplete.mode === 'skill'}
              aria-controls={
                autocomplete.mode === 'slash' || autocomplete.mode === 'skill'
                  ? pickerListboxId
                  : undefined
              }
              aria-activedescendant={
                (autocomplete.mode === 'slash' || autocomplete.mode === 'skill') &&
                autocomplete.items.length > 0
                  ? `${pickerListboxId}-option-${Math.min(activeSuggestion, autocomplete.items.length - 1)}`
                  : undefined
              }
              placeholder={nativeChatComposerPlaceholder(hasPty, canSend)}
              // Why: field-sizing grows without a JS reflow loop; max-height
              // then hands long drafts to the scrollbar. Coarse pointers keep
              // the larger touch target.
              className={cn(
                'scrollbar-sleek min-h-9 max-h-[200px] w-full resize-none bg-transparent px-2 py-2 text-sm leading-5 outline-none [field-sizing:content] pointer-coarse:min-h-14',
                'placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50'
              )}
            />
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <NativeChatComposerActions
                attachDisabled={attachDisabled}
                dictationDisabled={dictationDisabled}
                sendDisabled={sendButtonDisabled}
                isWorking={isWorking}
                isDictating={isDictating}
                isDictationHoldMode={isDictationHoldMode}
                onAttach={onAttach}
                onDictationToggle={onDictationToggle}
                onDictationHoldStart={onDictationHoldStart}
                onDictationHoldEnd={onDictationHoldEnd}
                onSend={onSend}
                onStop={onStop}
                sessionOptionsSurface={sessionOptionsSurface}
                sessionOptionsSnapshot={sessionOptionsSnapshot}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
