import type { PRCheckDetail } from '@yiru/workbench-model/review'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native'

import { CaretDown as ChevronDown, CaretRight as ChevronRight } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { fetchPRCheckDetails, type GitHubPrRepoSlug } from '../../session/github-pr-rpc'
import type { MobilePrActions } from '../../session/pr/use-actions'
import type { RpcClient } from '../../transport/rpc-client'
import { MobileGlassIconButton } from '../glass/icon-button'
import { MobileGlassTextButton } from '../glass/text-button'
import { prAiTriageStyles as triageStyles } from './pr-ai-triage-styles'
import { PRCheckDetailView, type DetailEntry } from './pr-check-detail'
import {
  checkOutcome,
  checkOutcomeToken,
  checkStatusLabel,
  firstFailingCheckKey,
  prCheckKey,
  sortPRChecks,
  summarizePRChecks
} from './pr-checks-presentation'
import { PRSection } from './pr-section'
import { statusColorClasses } from './status-color'
import { mobilePrSidebarStyles as styles } from './styles'

// Launches the "Fix checks with AI" agent. Absent for display-only usages.
export type PrChecksTriage = {
  fixChecks: () => void
  isBusy: boolean
  error: string | null
}

type Props = {
  checks: PRCheckDetail[]
  client: RpcClient | null
  worktreeId: string
  prRepo?: GitHubPrRepoSlug | null
  // Optional so display-only usages (e.g. tests/storybook) can omit mutations.
  actions?: MobilePrActions
  triage?: PrChecksTriage
}

// Checks summary (counts) + sorted per-check rows. Each row expands to lazily
// fetch github.prCheckDetails, cached per check key (U5). Display-only; the
// rerun action is U6.
export function PRChecksSection({ checks, client, worktreeId, prRepo, actions, triage }: Props) {
  const sorted = sortPRChecks(checks)
  const summary = summarizePRChecks(checks)
  const summaryColors = statusColorClasses(checkOutcomeToken(summary.outcome))
  const rerunBusy = actions?.isBusy({ kind: 'rerun' }) ?? false
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [detailCache, setDetailCache] = useState<Record<string, DetailEntry>>({})

  const loadDetail = useCallback(
    async (check: PRCheckDetail, key: string) => {
      if (!client) {
        return
      }
      let entry: DetailEntry
      try {
        const outcome = await fetchPRCheckDetails(client, worktreeId, {
          checkRunId: check.checkRunId,
          workflowRunId: check.workflowRunId,
          checkName: check.name,
          url: check.url,
          prRepo
        })
        entry = outcome.ok
          ? { status: 'loaded', details: outcome.result }
          : { status: 'error', message: outcome.error }
      } catch (err) {
        // Why: a rejection must clear the entry's `loading` state, not leave it
        // spinning forever — fall back to an error detail.
        entry = {
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to load check details'
        }
      }
      setDetailCache((prev) => ({ ...prev, [key]: entry }))
    },
    [client, worktreeId, prRepo]
  )

  // Fetch a check's detail the first time it expands; the loaded entry is the cache.
  const ensureDetail = useCallback(
    (check: PRCheckDetail, key: string) => {
      setDetailCache((prev) => {
        if (prev[key] || !client) {
          return prev
        }
        void loadDetail(check, key)
        return { ...prev, [key]: { status: 'loading' } }
      })
    },
    [client, loadDetail]
  )

  const toggle = useCallback(
    (check: PRCheckDetail) => {
      const key = prCheckKey(check)
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
          return next
        }
        next.add(key)
        return next
      })
      ensureDetail(check, key)
    },
    [ensureDetail]
  )

  // Auto-expand the first failing check once per loaded check set (parity with the
  // desktop ChecksList). Keyed on the sorted check identities so a worktree switch
  // or fresh load re-runs it, but the user's later manual collapses are not fought.
  const autoExpandedSignatureRef = useRef<string | null>(null)
  const sortedSignature = sorted.map(prCheckKey).join('|')
  useEffect(() => {
    if (autoExpandedSignatureRef.current === sortedSignature) {
      return
    }
    autoExpandedSignatureRef.current = sortedSignature
    const key = firstFailingCheckKey(sorted)
    if (!key) {
      return
    }
    const failing = sorted.find((check) => prCheckKey(check) === key)
    if (!failing) {
      return
    }
    setExpanded((prev) => (prev.has(key) ? prev : new Set(prev).add(key)))
    ensureDetail(failing, key)
  }, [ensureDetail, sorted, sortedSignature])

  return (
    <PRSection
      title="Checks"
      trailing={
        <>
          <Text className={cn('text-sm font-bold', summaryColors.text)}>{summary.label}</Text>
          {/* Rerun is offered only when something failed; spinner-in-place while in-flight. */}
          {actions && summary.failed > 0 ? (
            rerunBusy ? (
              <ActivityIndicator colorClassName="accent-muted-foreground" />
            ) : (
              <MobileGlassIconButton
                accessibilityLabel="Rerun failing checks"
                icon="refresh"
                onPress={() => actions.rerunFailingChecks()}
                size="small"
              />
            )
          ) : null}
        </>
      }
    >
      {/* Triage strip at the top of the section (desktop PRTriageStrip): a failing
          summary + a Fix action, so the most actionable state leads the list. */}
      {triage && summary.failed > 0 ? (
        <View className="border-hairline border-destructive bg-diff-removed flex-row items-center gap-2 rounded-xl p-2">
          <View className="min-w-0 flex-1">
            <Text className="text-foreground text-xs font-bold" numberOfLines={1}>
              {summary.failed} failing check{summary.failed === 1 ? '' : 's'}
            </Text>
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              Inspect details or start an AI fix pass.
            </Text>
          </View>
          <MobileGlassTextButton
            disabled={triage.isBusy}
            accessibilityLabel="Fix failing checks with AI"
            isProminent
            label={triage.isBusy ? 'Fixing…' : 'Fix'}
            onPress={triage.fixChecks}
            size="small"
          />
        </View>
      ) : null}
      {triage?.error ? <Text className={triageStyles.triageError}>{triage.error}</Text> : null}
      {sorted.map((check) => {
        const key = prCheckKey(check)
        const isOpen = expanded.has(key)
        const token = checkOutcomeToken(checkOutcome(check))
        const statusColors = statusColorClasses(token)
        const Chevron = isOpen ? ChevronDown : ChevronRight
        const url = check.url
        return (
          <View key={key}>
            <Pressable
              className={styles.row}
              onPress={() => toggle(check)}
              accessibilityRole="button"
              accessibilityLabel={`${check.name} check details`}
            >
              <Chevron size={14} colorClassName="accent-muted-foreground" />
              <View className={cn('h-2 w-2 rounded-full', statusColors.background)} />
              <View className={styles.rowMain}>
                <Text className={styles.rowTitle} numberOfLines={1}>
                  {check.name}
                </Text>
              </View>
              {/* Status word + open-on-host icon (desktop ChecksList row), so the
                  outcome reads without expanding. */}
              <Text className={cn(styles.rowStatus, statusColors.text)} numberOfLines={1}>
                {checkStatusLabel(check)}
              </Text>
              {url ? (
                <MobileGlassIconButton
                  accessibilityLabel={`Open ${check.name} on the web`}
                  icon="external"
                  onPress={(event) => {
                    event.stopPropagation()
                    void Linking.openURL(url).catch(() => {})
                  }}
                  size="small"
                />
              ) : null}
            </Pressable>
            {isOpen ? <PRCheckDetailView entry={detailCache[key]} /> : null}
          </View>
        )
      })}
    </PRSection>
  )
}
