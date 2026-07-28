import { Stack, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, BackHandler, Platform, Text, View, useWindowDimensions } from 'react-native'
import { useCSSVariable } from 'uniwind'

import { MobileGlassIconButton } from '@/components/glass/icon-button'
import { resolveCssNumber } from '@/style/resolve-css-variable'

import { getWorktreeLabel } from '../session/worktree-label'
import { useForceReconnect, useHostClient } from '../transport/client-context'
import { MobileFilePreviewBody } from './file-preview-body'
import {
  hasUnsavedMobileTerminalArtifactDraft,
  isEditableMobileTerminalArtifactPreview,
  shouldKeepDirtyDraftOnPreviewLoadResult
} from './file-preview-editability'
import { normalizeMobileFilePreviewLineColumn } from './file-preview-line-column'
import {
  loadMobileFilePreview,
  previewError,
  saveMobileTerminalArtifactPreview,
  type MobileFilePreviewSource,
  type MobileFilePreviewResult
} from './file-preview-request'
import { displayNameFromPreviewPath, type MobileFilePreviewRouteState } from './file-preview-route'
import { previewSourceFromRoute, sourceKeyForPreview } from './file-preview-source'

type Props = {
  route: MobileFilePreviewRouteState
}

export function MobileFilePreviewScreen({ route }: Props) {
  const spacing3 = resolveCssNumber(useCSSVariable('--spacing-3'))
  const router = useRouter()
  const previewParams = route.ok ? route.params : null
  const { client, state: connState } = useHostClient(previewParams?.hostId)
  const forceReconnect = useForceReconnect()
  const [preview, setPreview] = useState<MobileFilePreviewResult>(() =>
    route.ok ? { status: 'loading', message: 'Loading preview...' } : previewError(route.message)
  )
  const [draftContent, setDraftContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const draftContentRef = useRef(draftContent)
  const savedContentRef = useRef(savedContent)
  const draftSourceKeyRef = useRef<string | null>(null)
  const { width, height } = useWindowDimensions()
  const routePreviewSource = useMemo(
    () => (previewParams ? previewSourceFromRoute(previewParams) : null),
    [previewParams]
  )
  const [previewSource, setPreviewSource] = useState<MobileFilePreviewSource | null>(
    routePreviewSource
  )
  const previewSourceKey = useMemo(() => sourceKeyForPreview(previewSource), [previewSource])
  const routePreviewSourceKey = useMemo(
    () => sourceKeyForPreview(routePreviewSource),
    [routePreviewSource]
  )
  const previewSourceKeyRef = useRef(previewSourceKey)
  const lineColumn = useMemo(
    () =>
      previewParams
        ? normalizeMobileFilePreviewLineColumn(previewParams.line, previewParams.column)
        : null,
    [previewParams]
  )

  useEffect(() => {
    setPreviewSource(routePreviewSource)
    draftSourceKeyRef.current = null
  }, [routePreviewSource])

  useEffect(() => {
    previewSourceKeyRef.current = previewSourceKey
  }, [previewSourceKey])

  useEffect(() => {
    draftContentRef.current = draftContent
  }, [draftContent])

  useEffect(() => {
    savedContentRef.current = savedContent
  }, [savedContent])

  const loadPreview = useCallback(async () => {
    const loadSourceKey = previewSourceKey
    if (!previewParams || !previewSource || loadSourceKey !== routePreviewSourceKey) {
      setPreview(previewError(route.ok ? 'Unable to load preview' : route.message))
      return
    }
    const preserveDirtyDraft =
      draftSourceKeyRef.current === previewSourceKey &&
      draftContentRef.current !== savedContentRef.current
    if (!client || connState !== 'connected') {
      if (preserveDirtyDraft) {
        setSaveError('Waiting for desktop...')
        return
      }
      setPreview({ status: 'waiting', message: 'Waiting for desktop...', reconnect: true })
      return
    }
    if (!preserveDirtyDraft) {
      setPreview({ status: 'loading', message: 'Loading preview...' })
    }
    setSaveError('')
    try {
      const result = await loadMobileFilePreview(client, previewSource, undefined, {
        onTerminalArtifactSourceRefreshed: setPreviewSource,
        refreshGrant: true
      })
      if (previewSourceKeyRef.current !== loadSourceKey) {
        return
      }
      if (shouldKeepDirtyDraftOnPreviewLoadResult(preserveDirtyDraft, result)) {
        setSaveError(result.message)
        return
      }
      const loadedContent =
        result.status === 'ready' && result.kind !== 'image'
          ? result.content
          : result.status === 'empty'
            ? ''
            : null
      if (loadedContent !== null) {
        if (!preserveDirtyDraft) {
          setDraftContent(loadedContent)
          setSavedContent(loadedContent)
        }
        draftSourceKeyRef.current = previewSourceKey
      }
      setPreview(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load preview'
      if (preserveDirtyDraft) {
        setSaveError(message)
        return
      }
      setPreview(previewError(message))
    }
  }, [
    client,
    connState,
    previewParams,
    previewSource,
    previewSourceKey,
    route,
    routePreviewSourceKey
  ])

  useEffect(() => {
    void loadPreview()
  }, [loadPreview])

  const retry = useCallback(async () => {
    if (!previewParams) {
      void loadPreview()
      return
    }
    if (
      preview.status === 'waiting' ||
      (preview.status === 'error' && preview.reconnect) ||
      connState !== 'connected'
    ) {
      await forceReconnect(previewParams.hostId)
      return
    }
    void loadPreview()
  }, [connState, forceReconnect, loadPreview, preview, previewParams])

  const displayPath =
    previewParams?.source === 'terminalArtifact'
      ? (previewParams.absolutePath ?? '')
      : (previewParams?.relativePath ?? '')
  const title = previewParams?.name ?? displayNameFromPreviewPath(displayPath)
  const worktreeLabel = getWorktreeLabel(
    previewParams?.worktreeName,
    previewParams?.worktreeId ?? ''
  )
  const meta = previewParams ? `${worktreeLabel} - ${displayPath}` : 'Preview'
  const isEditableTerminalArtifact =
    previewSource?.source === 'terminalArtifact' && isEditableMobileTerminalArtifactPreview(preview)
  const canSaveArtifact =
    isEditableTerminalArtifact &&
    draftSourceKeyRef.current === previewSourceKey &&
    draftContent !== savedContent
  const hasUnsavedTerminalArtifactDraft = hasUnsavedMobileTerminalArtifactDraft({
    source: previewSource?.source,
    draftSourceKey: draftSourceKeyRef.current,
    previewSourceKey,
    draftContent,
    savedContent
  })

  const saveArtifact = useCallback(async () => {
    if (!client || previewSource?.source !== 'terminalArtifact' || !canSaveArtifact || saving) {
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const result = await saveMobileTerminalArtifactPreview(client, previewSource, draftContent, {
        baseContent: savedContent,
        onTerminalArtifactSourceRefreshed: setPreviewSource
      })
      if (result.status === 'saved') {
        setSavedContent(draftContent)
      } else {
        setSaveError(saveErrorMessageFromPreviewResult(result))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save file'
      setSaveError(message)
    } finally {
      setSaving(false)
    }
  }, [canSaveArtifact, client, draftContent, previewSource, savedContent, saving])

  const requestBack = useCallback(() => {
    if (!hasUnsavedTerminalArtifactDraft) {
      router.back()
      return true
    }
    Alert.alert('Discard changes?', 'Unsaved edits will be lost.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() }
    ])
    return true
  }, [hasUnsavedTerminalArtifactDraft, router])

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', requestBack)
    return () => subscription.remove()
  }, [requestBack])

  return (
    <View className="bg-background flex-1">
      <Stack.Screen
        options={{
          gestureEnabled: !hasUnsavedTerminalArtifactDraft,
          title: title || 'Preview',
          headerLeft:
            Platform.OS === 'ios'
              ? undefined
              : () => (
                  <MobileGlassIconButton
                    accessibilityLabel="Back"
                    icon="back"
                    onPress={requestBack}
                  />
                ),
          headerRight:
            Platform.OS === 'ios' || !isEditableTerminalArtifact
              ? undefined
              : () => (
                  <MobileGlassIconButton
                    accessibilityLabel="Save terminal artifact"
                    disabled={!canSaveArtifact || saving}
                    icon="save"
                    onPress={() => void saveArtifact()}
                  />
                )
        }}
      />
      {Platform.OS === 'ios' ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            accessibilityLabel="Back"
            icon="chevron.left"
            onPress={requestBack}
          />
        </Stack.Toolbar>
      ) : null}
      {Platform.OS === 'ios' && isEditableTerminalArtifact ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            accessibilityLabel="Save terminal artifact"
            disabled={!canSaveArtifact || saving}
            icon="square.and.arrow.down"
            onPress={() => void saveArtifact()}
            variant="prominent"
          />
        </Stack.Toolbar>
      ) : null}
      <Text className="text-muted-foreground px-4 py-1 text-xs" numberOfLines={1}>
        {meta}
      </Text>
      <MobileFilePreviewBody
        preview={preview}
        relativePath={displayPath}
        title={title || 'File'}
        editable={isEditableTerminalArtifact}
        draftContent={draftContent}
        saveError={saveError}
        lineColumn={lineColumn}
        imageWidth={Math.max(1, width - spacing3 * 2)}
        imageHeight={Math.max(240, height - 160)}
        onDraftChange={setDraftContent}
        onImageError={() =>
          setPreview({ status: 'error', message: 'Unable to load preview', reconnect: false })
        }
        onRetry={retry}
      />
    </View>
  )
}

function saveErrorMessageFromPreviewResult(result: MobileFilePreviewResult): string {
  return result.status === 'error' || result.status === 'waiting'
    ? result.message
    : 'Unable to save file'
}
