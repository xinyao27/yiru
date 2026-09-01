import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { Input } from '~renderer/ui/input'

type RepoTextDraft = {
  lastPersisted: string
  pendingStoreEchoes: string[]
  repoId: string
  text: string
}

function resolveRepoTextDraft(
  draft: RepoTextDraft,
  repoId: string,
  storeValue: string
): RepoTextDraft {
  if (draft.repoId !== repoId) {
    return { repoId, text: storeValue, pendingStoreEchoes: [], lastPersisted: storeValue }
  }
  if (storeValue === draft.text) {
    if (draft.pendingStoreEchoes.length === 0 && draft.lastPersisted === storeValue) {
      return draft
    }
    return { ...draft, pendingStoreEchoes: [], lastPersisted: storeValue }
  }
  const pendingEchoIndex = draft.pendingStoreEchoes.indexOf(storeValue)
  if (pendingEchoIndex !== -1) {
    return { ...draft, pendingStoreEchoes: draft.pendingStoreEchoes.slice(pendingEchoIndex + 1) }
  }
  return { repoId, text: storeValue, pendingStoreEchoes: [], lastPersisted: storeValue }
}

// Why: updateRepo persists via async IPC before the store value updates, so a
// store-controlled input resets mid-IME-composition (Hangul decomposes into
// jamo). Keep keystrokes in local draft state; persist per-keystroke except
// while an IME composition is active (see composingRef below).
export function RepoSettingsDraftInput({
  repoId,
  storeValue,
  onTextChange,
  onBlur,
  onCompositionStart,
  onCompositionEnd,
  ...inputProps
}: {
  repoId: string
  storeValue: string
  onTextChange: (text: string) => void
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>): React.JSX.Element {
  const [draft, setDraft] = useState<RepoTextDraft>({
    repoId,
    text: storeValue,
    pendingStoreEchoes: [],
    lastPersisted: storeValue
  })
  // Why: IME composition (e.g. Japanese kana→kanji conversion) fires input
  // events for unconfirmed text. Persisting those mid-composition writes the
  // pre-confirmation value to the store and its async echo can cancel the
  // composition. Hold persistence until compositionend so only confirmed text
  // reaches updateRepo.
  const composingRef = useRef(false)
  // Why: some IMEs emit a trailing change event after compositionend that
  // repeats the already-persisted confirmed value; consume that one change so
  // the value is not persisted twice.
  const skipNextChangeRef = useRef<string | null>(null)
  const resolvedDraft = resolveRepoTextDraft(draft, repoId, storeValue)
  if (resolvedDraft !== draft) {
    setDraft(resolvedDraft)
  }

  useEffect(() => {
    composingRef.current = false
    skipNextChangeRef.current = null
  }, [repoId])

  const persist = (text: string): void => {
    setDraft({
      ...resolvedDraft,
      repoId,
      text,
      pendingStoreEchoes: [...resolvedDraft.pendingStoreEchoes, text],
      lastPersisted: text
    })
    onTextChange(text)
  }
  const flush = useEventCallback((): void => {
    if (resolvedDraft.repoId !== repoId || resolvedDraft.text === resolvedDraft.lastPersisted) {
      return
    }
    composingRef.current = false
    skipNextChangeRef.current = resolvedDraft.text
    persist(resolvedDraft.text)
  })
  const flushOnUnmount = useEventCallback((): void => {
    if (resolvedDraft.repoId === repoId && resolvedDraft.text !== resolvedDraft.lastPersisted) {
      onTextChange(resolvedDraft.text)
    }
  })
  useEffect(() => () => flushOnUnmount(), [flushOnUnmount])

  return (
    <Input
      {...inputProps}
      value={resolvedDraft.text}
      onChange={(e) => {
        const nextText = e.target.value
        setDraft({ ...resolvedDraft, repoId, text: nextText })
        // Why: during composition the input stays live via draft, but the
        // unconfirmed text is not persisted until compositionend.
        if (composingRef.current) {
          return
        }
        if (skipNextChangeRef.current === nextText) {
          skipNextChangeRef.current = null
          return
        }
        skipNextChangeRef.current = null
        persist(nextText)
      }}
      onCompositionStart={(e) => {
        composingRef.current = true
        skipNextChangeRef.current = null
        onCompositionStart?.(e)
      }}
      onBlur={(e) => {
        flush()
        onBlur?.(e)
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false
        const nextText = e.currentTarget.value
        persist(nextText)
        // Why: cover IMEs that fire the final change after compositionend.
        skipNextChangeRef.current = nextText
        onCompositionEnd?.(e)
      }}
    />
  )
}
