import React from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import {
  TEXT_CONTROL_PASTE_DIRECT_MAX_BYTES,
  measureTextControlPasteByteLength,
  pasteTextIntoTextControl,
  shouldHandleTextControlPaste
} from '~renderer/keyboard-input/paste/write'
import { Textarea } from '~renderer/ui/textarea'

type NoteFieldProps = {
  note: string
  onNoteChange: (value: string) => void
}

export function NoteField({ note, onNoteChange }: NoteFieldProps): React.JSX.Element {
  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = event.clipboardData.getData('text/plain')
    const byteLengthMeasurement = measureTextControlPasteByteLength(text, {
      stopAfterBytes: TEXT_CONTROL_PASTE_DIRECT_MAX_BYTES
    })
    if (
      !byteLengthMeasurement.exceededLimit &&
      !shouldHandleTextControlPaste(text, { measuredByteLength: byteLengthMeasurement.byteLength })
    ) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const textarea = event.currentTarget
    // Why: large note pastes need one controlled owner so React receives a
    // single final input event after chunked DOM insertion.
    void pasteTextIntoTextControl(textarea, text, {
      source: 'clipboard',
      canContinue: (target) => target.ownerDocument.activeElement === target
    })
      .then((result) => {
        if (result.status === 'rejected' && result.reason === 'too-large') {
          toast.error(
            translate(
              'auto.components.NewWorkspaceComposerCard.notePasteTooLarge',
              'Paste is too large for the note field.'
            )
          )
        }
      })
      .catch(() => {})
  }

  return (
    <div className="space-y-1">
      <label className="text-muted-foreground text-xs font-medium">
        {translate('auto.components.NewWorkspaceComposerCard.f8728aa4f9', 'Note')}
      </label>
      <Textarea
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        onPaste={handlePaste}
        placeholder={translate(
          'auto.components.NewWorkspaceComposerCard.090cfedeb4',
          'Write a note'
        )}
        rows={1}
        className="border-input placeholder:text-muted-foreground focus-visible:border-ring [field-sizing:content] max-h-40 w-full min-w-0 resize-none overflow-y-auto border bg-transparent px-3 py-1.5 text-sm transition-[color] outline-none"
      />
    </div>
  )
}
