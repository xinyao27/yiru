import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { joinPath } from '~renderer/path'
import { importExternalPathsToRuntime } from '~renderer/runtime/file-client'
import type { RuntimeFileOperationArgs } from '~renderer/runtime/file/context'
import { shellClient } from '~renderer/runtime/shell-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'

import { isCurrentComposerDropOwner } from './composer-drop-owner'
import {
  collectComposerDropUploadResult,
  shouldReportComposerDropUploadFailure
} from './composer-drop-upload-result'

const composerDropStack: symbol[] = []

type UseComposerAttachmentsOptions = {
  agentPrompt: string
  initialPaths: string[]
  selectedRepoPath: string | undefined
  selectedRepoSettings: RuntimeFileOperationArgs['settings']
  setAgentPrompt: (value: string) => void
}

export function useComposerAttachments({
  agentPrompt,
  initialPaths,
  selectedRepoPath,
  selectedRepoSettings,
  setAgentPrompt
}: UseComposerAttachmentsOptions) {
  const [attachmentPaths, setAttachmentPaths] = useState<string[]>(initialPaths)
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const promptCaretFrameRef = useRef<number | null>(null)
  const agentPromptRef = useRef(agentPrompt)
  const selectedRepoPathRef = useRef(selectedRepoPath)
  const selectedRepoSettingsRef = useRef(selectedRepoSettings)
  const addAttachmentsRef = useRef<(paths: string[]) => void>(() => {})
  const insertFoldersRef = useRef<(paths: string[]) => void>(() => {})
  const uploadPathsRef = useRef<
    (
      paths: string[],
      settings?: RuntimeFileOperationArgs['settings'],
      repoPath?: string,
      canReportFailure?: () => boolean
    ) => Promise<{ filePaths: string[]; folderPaths: string[] } | null>
  >(async () => null)
  const applyLocalDropRef = useRef<(paths: string[], canApply?: () => boolean) => Promise<void>>(
    async () => {}
  )
  agentPromptRef.current = agentPrompt
  selectedRepoPathRef.current = selectedRepoPath
  selectedRepoSettingsRef.current = selectedRepoSettings

  const cancelCaretFrame = (): void => {
    if (promptCaretFrameRef.current !== null) {
      cancelAnimationFrame(promptCaretFrameRef.current)
      promptCaretFrameRef.current = null
    }
  }

  const addAttachments = (paths: string[]): void => {
    setAttachmentPaths((current) => [
      ...current,
      ...paths.filter((pathValue) => !current.includes(pathValue))
    ])
  }

  const insertFolders = (folderPaths: string[]): void => {
    if (folderPaths.length === 0) {
      return
    }
    const formatPath = (pathValue: string): string =>
      /[\s"'$`\\()[\]{}*?!;&|<>#~]/.test(pathValue)
        ? `"${pathValue.replace(/(["\\$`])/g, '\\$1')}"`
        : pathValue
    const insertion = Array.from(new Set(folderPaths)).map(formatPath).join(' ')
    const textarea = promptTextareaRef.current
    const current = agentPromptRef.current
    const selectionStart = textarea?.selectionStart ?? current.length
    const selectionEnd = textarea?.selectionEnd ?? current.length
    const before = current.slice(0, selectionStart)
    const after = current.slice(selectionEnd)
    const padded = `${before.length > 0 && !/\s$/.test(before) ? ' ' : ''}${insertion}${
      after.length > 0 && !/^\s/.test(after) ? ' ' : ''
    }`
    const caret = before.length + padded.length
    if (textarea) {
      cancelCaretFrame()
      promptCaretFrameRef.current = requestAnimationFrame(() => {
        promptCaretFrameRef.current = null
        if (promptTextareaRef.current === textarea && textarea.isConnected) {
          textarea.focus()
          textarea.setSelectionRange(caret, caret)
        }
      })
    }
    setAgentPrompt(before + padded + after)
  }

  const uploadPaths = async (
    sourcePaths: string[],
    settings = selectedRepoSettings,
    repoPath = selectedRepoPath,
    canReportFailure: () => boolean = () => true
  ): Promise<{ filePaths: string[]; folderPaths: string[] } | null> => {
    if (!settings?.activeRuntimeEnvironmentId?.trim()) {
      return null
    }
    if (!repoPath) {
      if (canReportFailure()) {
        toast.error(
          translate(
            'auto.hooks.useComposerState.3db83fc58a',
            'No project path is available on this host for attachments.'
          )
        )
      }
      return { filePaths: [], folderPaths: [] }
    }
    const { results } = await importExternalPathsToRuntime(
      { settings, worktreeId: repoPath, worktreePath: repoPath },
      sourcePaths,
      joinPath(repoPath, '.yiru/drops'),
      { ensureDestinationDir: true }
    )
    const result = collectComposerDropUploadResult(results)
    if (shouldReportComposerDropUploadFailure(result, canReportFailure)) {
      toast.error(
        translate(
          'auto.hooks.useComposerState.a9ff236145',
          'Some attachments could not be uploaded.'
        )
      )
    }
    return { filePaths: result.filePaths, folderPaths: result.folderPaths }
  }

  const applyLocalDrop = async (
    paths: string[],
    canApply: () => boolean = () => true
  ): Promise<void> => {
    const filePaths: string[] = []
    const folderPaths: string[] = []
    for (const filePath of paths) {
      try {
        await workspaceHostClient.fileHost.authorizeExternalPath({ targetPath: filePath })
        const stat = await workspaceHostClient.fileHost.stat({ filePath })
        ;(stat.isDirectory ? folderPaths : filePaths).push(filePath)
      } catch {
        // Why: OS drops can include paths Chrome can no longer authorize; usable siblings survive.
      }
    }
    if (canApply()) {
      addAttachments(filePaths)
      insertFolders(folderPaths)
    }
  }

  addAttachmentsRef.current = addAttachments
  insertFoldersRef.current = insertFolders
  uploadPathsRef.current = uploadPaths
  applyLocalDropRef.current = applyLocalDrop

  useEffect(() => {
    const instanceId = Symbol('composer')
    composerDropStack.push(instanceId)
    const unsubscribe = shellClient.ui.onFileDrop((data) => {
      if (
        data.target !== 'composer' ||
        !isCurrentComposerDropOwner(composerDropStack, instanceId)
      ) {
        return
      }
      void (async () => {
        const isOwner = (): boolean => isCurrentComposerDropOwner(composerDropStack, instanceId)
        const uploaded = await uploadPathsRef.current(
          data.paths,
          selectedRepoSettingsRef.current,
          selectedRepoPathRef.current,
          isOwner
        )
        if (!isOwner()) {
          return
        }
        if (uploaded) {
          addAttachmentsRef.current(uploaded.filePaths)
          insertFoldersRef.current(uploaded.folderPaths)
        } else {
          await applyLocalDropRef.current(data.paths, isOwner)
        }
      })()
    })
    return () => {
      unsubscribe()
      const index = composerDropStack.lastIndexOf(instanceId)
      if (index !== -1) {
        composerDropStack.splice(index, 1)
      }
    }
  }, [])

  const handleAddAttachment = async (): Promise<void> => {
    try {
      const selectedPath = await shellClient.shell.pickAttachment()
      if (!selectedPath) {
        return
      }
      const uploaded = await uploadPaths([selectedPath])
      if (uploaded) {
        addAttachments(uploaded.filePaths)
        insertFolders(uploaded.folderPaths)
      } else {
        addAttachments([selectedPath])
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.hooks.useComposerState.addAttachmentFailed',
              'Failed to add attachment.'
            )
      )
    }
  }

  return {
    attachmentPaths,
    handleAddAttachment,
    onComposerNodeChange: (node: HTMLDivElement | null): void => {
      if (!node) {
        cancelCaretFrame()
      }
    },
    promptTextareaRef,
    setAttachmentPaths
  }
}
