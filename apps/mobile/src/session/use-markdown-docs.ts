import * as Clipboard from 'expo-clipboard'
import { useCallback, useRef, useState } from 'react'
import { Keyboard } from 'react-native'

import { triggerError, triggerSuccess } from '~/platform/haptics'
import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

import {
  buildMarkdownDiskFallbackDoc,
  shouldReadMarkdownFromDiskAfterReadTabFailure
} from './markdown-disk-fallback'
import type { DirtyMarkdownDraft, MarkdownDocState, MobileSessionTab } from './screen-state'

type MarkdownTab = Extract<MobileSessionTab, { type: 'markdown' }>

export type MobileMarkdownDocsDeps = {
  client: RpcClient | null
  worktreeId: string
  sessionTabs: MobileSessionTab[]
  showToast: (message: string, durationMs?: number) => void
}

export type MobileMarkdownDocs = {
  markdownDocs: Map<string, MarkdownDocState>
  setMarkdownDocs: React.Dispatch<React.SetStateAction<Map<string, MarkdownDocState>>>
  markdownDocsRef: React.RefObject<Map<string, MarkdownDocState>>
  discardMarkdownTarget: MarkdownTab | null
  setDiscardMarkdownTarget: React.Dispatch<React.SetStateAction<MarkdownTab | null>>
  readMarkdownTab: (tab: MarkdownTab) => Promise<void>
  saveMarkdownTab: (tab: MarkdownTab) => Promise<void>
  updateMarkdownLocalContent: (tabId: string, content: string) => void
  copyMarkdownLocalContent: (tabId: string) => Promise<void>
  discardMarkdownLocalContent: (tab: MarkdownTab) => void
  confirmDiscardMarkdown: () => void
  markMarkdownTabStale: (tabId: string) => void
  getDirtyMarkdownDrafts: () => DirtyMarkdownDraft[]
}

// Owns the phone-local markdown editor documents for one session route: the
// per-tab draft/version state, the save generation guards, and the discard flow.
export function useMobileMarkdownDocs(deps: MobileMarkdownDocsDeps): MobileMarkdownDocs {
  const { client, worktreeId, sessionTabs, showToast } = deps
  const [markdownDocs, setMarkdownDocs] = useState<Map<string, MarkdownDocState>>(new Map())
  const markdownDocsRef = useRef<Map<string, MarkdownDocState>>(new Map())
  const [discardMarkdownTarget, setDiscardMarkdownTarget] = useState<MarkdownTab | null>(null)
  const markdownSaveSeqRef = useRef<Map<string, number>>(new Map())
  const markdownSaveInFlightRef = useRef<Set<string>>(new Set())

  // Why: the snapshot reconciler reads the live drafts from an imperative
  // callback, so mirror before commit instead of one effect later.
  markdownDocsRef.current = markdownDocs

  const readMarkdownTab = useCallback(
    async (tab: MarkdownTab) => {
      if (!client) {
        return
      }
      setMarkdownDocs((prev) => new Map(prev).set(tab.id, { status: 'loading' }))
      try {
        try {
          const result = await callRuntimeOrpc(client, (runtime) => runtime.markdown.readTab, {
            worktree: `id:${worktreeId}`,
            tabId: tab.id
          })
          setMarkdownDocs((prev) =>
            new Map(prev).set(tab.id, {
              status: 'ready',
              content: result.content,
              localContent: result.content,
              baseVersion: result.version,
              isDirty: false,
              editable: result.editable,
              stale: result.isDirty,
              readOnlyReason: result.readOnlyReason
            })
          )
          return
        } catch (error) {
          if (!shouldReadMarkdownFromDiskAfterReadTabFailure(error)) {
            throw error
          }
        }
        // Why: a headless host (no desktop renderer) can't serve the live editor
        // document and fails markdown.readTab with renderer_unavailable. Fall back
        // to the on-disk file so markdown still renders read-only, matching how
        // other file types load via files.read.
        const fileResult = await callRuntimeOrpc(client, (runtime) => runtime.files.read, {
          worktree: `id:${worktreeId}`,
          relativePath: tab.relativePath
        })
        setMarkdownDocs((prev) =>
          new Map(prev).set(
            tab.id,
            buildMarkdownDiskFallbackDoc({
              content: fileResult.content,
              truncated: fileResult.truncated,
              tabIsDirty: tab.isDirty
            })
          )
        )
      } catch {
        setMarkdownDocs((prev) =>
          new Map(prev).set(tab.id, {
            status: 'error',
            message: "Couldn't load markdown"
          })
        )
      }
    },
    [client, worktreeId]
  )

  const updateMarkdownLocalContent = useCallback((tabId: string, content: string) => {
    setMarkdownDocs((prev) => {
      const current = prev.get(tabId)
      if (current?.status !== 'ready') {
        return prev
      }
      const next = new Map(prev)
      next.set(tabId, {
        ...current,
        localContent: content,
        isDirty: content !== current.content,
        saveError: undefined
      })
      return next
    })
  }, [])

  const copyMarkdownLocalContent = useCallback(
    async (tabId: string) => {
      const current = markdownDocs.get(tabId)
      if (current?.status !== 'ready') {
        return
      }
      await Clipboard.setStringAsync(current.localContent)
      triggerSuccess()
      showToast('Copied')
    },
    [markdownDocs, showToast]
  )

  const getDirtyMarkdownDrafts = useCallback(() => {
    const drafts: DirtyMarkdownDraft[] = []
    for (const [tabId, doc] of markdownDocs) {
      if (doc.status === 'ready' && doc.isDirty) {
        const tab = sessionTabs.find((candidate) => candidate.id === tabId)
        drafts.push({ tabId, title: tab?.title || 'Markdown', content: doc.localContent })
      }
    }
    return drafts
  }, [markdownDocs, sessionTabs])

  const discardMarkdownLocalContent = useCallback(
    (tab: MarkdownTab) => {
      const current = markdownDocs.get(tab.id)
      if (current?.status !== 'ready') {
        return
      }
      if (!current.isDirty) {
        void readMarkdownTab(tab)
        return
      }
      Keyboard.dismiss()
      setDiscardMarkdownTarget(tab)
    },
    [markdownDocs, readMarkdownTab]
  )

  const confirmDiscardMarkdown = useCallback(() => {
    const target = discardMarkdownTarget
    setDiscardMarkdownTarget(null)
    if (target) {
      void readMarkdownTab(target)
    }
  }, [discardMarkdownTarget, readMarkdownTab])

  const saveMarkdownTab = useCallback(
    async (tab: MarkdownTab) => {
      if (!client) {
        return
      }
      const current = markdownDocs.get(tab.id)
      if (current?.status !== 'ready' || current.saving || !current.editable) {
        return
      }
      if (markdownSaveInFlightRef.current.has(tab.id)) {
        return
      }
      markdownSaveInFlightRef.current.add(tab.id)
      const saveSeq = (markdownSaveSeqRef.current.get(tab.id) ?? 0) + 1
      markdownSaveSeqRef.current.set(tab.id, saveSeq)
      setMarkdownDocs((prev) => {
        const existing = prev.get(tab.id)
        if (existing?.status !== 'ready') {
          return prev
        }
        return new Map(prev).set(tab.id, { ...existing, saving: true, saveError: undefined })
      })
      try {
        const result = await callRuntimeOrpc(client, (runtime) => runtime.markdown.saveTab, {
          worktree: `id:${worktreeId}`,
          tabId: tab.id,
          baseVersion: current.baseVersion,
          content: current.localContent
        })
        if (markdownSaveSeqRef.current.get(tab.id) !== saveSeq) {
          return
        }
        setMarkdownDocs((prev) =>
          new Map(prev).set(tab.id, {
            status: 'ready',
            content: result.content,
            localContent: result.content,
            baseVersion: result.version,
            isDirty: false,
            editable: true
          })
        )
        markdownSaveSeqRef.current.delete(tab.id)
        triggerSuccess()
        showToast('Saved')
      } catch (error) {
        triggerError()
        const message = error instanceof Error ? error.message : 'Save failed'
        if (markdownSaveSeqRef.current.get(tab.id) !== saveSeq) {
          return
        }
        setMarkdownDocs((prev) => {
          const existing = prev.get(tab.id)
          if (existing?.status !== 'ready') {
            return prev
          }
          return new Map(prev).set(tab.id, {
            ...existing,
            saving: false,
            saveError: message || 'Save failed'
          })
        })
      } finally {
        markdownSaveInFlightRef.current.delete(tab.id)
      }
    },
    [client, markdownDocs, showToast, worktreeId]
  )

  // Why: the desktop reports its own dirty flag on the tab snapshot. Flag the
  // phone copy as stale only while the phone itself has no pending draft.
  const markMarkdownTabStale = useCallback((tabId: string) => {
    setMarkdownDocs((prev) => {
      const current = prev.get(tabId)
      if (current?.status === 'ready' && !current.isDirty) {
        const next = new Map(prev)
        next.set(tabId, { ...current, stale: true })
        return next
      }
      return prev
    })
  }, [])

  return {
    markdownDocs,
    setMarkdownDocs,
    markdownDocsRef,
    discardMarkdownTarget,
    setDiscardMarkdownTarget,
    readMarkdownTab,
    saveMarkdownTab,
    updateMarkdownLocalContent,
    copyMarkdownLocalContent,
    discardMarkdownLocalContent,
    confirmDiscardMarkdown,
    markMarkdownTabStale,
    getDirtyMarkdownDrafts
  }
}
