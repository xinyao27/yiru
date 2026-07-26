import { useRouter } from 'expo-router'
import { useState, useCallback, useRef } from 'react'
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native'

import {
  CaretLeft as ChevronLeft,
  CaretDown as ChevronDown,
  CaretUp as ChevronUp,
  Pulse as Activity,
  CheckCircle as CheckCircle2,
  Scroll as ScrollText,
  XCircle,
  Warning as AlertTriangle
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import {
  startDiagnosticFetchTimeout,
  type DiagnosticFetchTimeout
} from '../src/diagnostics/diagnostic-fetch-timeout'
import {
  formatEndpoint,
  testHostReachability,
  unreachableHostDetail
} from '../src/diagnostics/host-reachability'
import { troubleshootCommonIssues } from '../src/diagnostics/troubleshoot-common-issues'
import { loadHosts } from '../src/transport/host-store'

type DiagnosticStatus = 'idle' | 'running' | 'done'

type CheckResult = {
  label: string
  status: 'pass' | 'fail' | 'warn'
  detail: string
}

function StatusIcon({ status }: { status: CheckResult['status'] }) {
  switch (status) {
    case 'pass':
      return <CheckCircle2 size={14} colorClassName="accent-green-500" />
    case 'fail':
      return <XCircle size={14} colorClassName="accent-destructive" />
    case 'warn':
      return <AlertTriangle size={14} colorClassName="accent-muted-foreground" />
  }
}

export default function TroubleshootScreen() {
  const router = useRouter()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [diagnosticStatus, setDiagnosticStatus] = useState<DiagnosticStatus>('idle')
  const [checks, setChecks] = useState<CheckResult[]>([])
  const abortRef = useRef(false)
  const diagnosticRunRef = useRef(0)
  const activeInternetCheckRef = useRef<DiagnosticFetchTimeout | null>(null)

  const setTroubleshootRootRef = useCallback((node: View | null): void => {
    if (node !== null) {
      return
    }
    // Why: diagnostics can outlive the screen; cancel the active run when the
    // route detaches without a passive cleanup-only Effect.
    abortRef.current = true
    diagnosticRunRef.current += 1
    activeInternetCheckRef.current?.dispose()
    activeInternetCheckRef.current = null
  }, [])

  const toggleSection = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  const runDiagnostics = useCallback(async () => {
    const runId = diagnosticRunRef.current + 1
    diagnosticRunRef.current = runId
    abortRef.current = false
    activeInternetCheckRef.current?.dispose()
    activeInternetCheckRef.current = null
    setDiagnosticStatus('running')
    setChecks([])

    const results: CheckResult[] = []
    const isCurrentRun = () => !abortRef.current && diagnosticRunRef.current === runId

    try {
      const hosts = await loadHosts()
      results.push(
        hosts.length > 0
          ? { label: 'Paired hosts', status: 'pass', detail: `${hosts.length} paired` }
          : { label: 'Paired hosts', status: 'fail', detail: 'None — scan a QR to pair' }
      )
    } catch {
      results.push({ label: 'Paired hosts', status: 'warn', detail: 'Could not read host data' })
    }

    if (!isCurrentRun()) {
      return
    }
    setChecks([...results])

    const internetCheck = startDiagnosticFetchTimeout(5000)
    activeInternetCheckRef.current = internetCheck
    try {
      const resp = await fetch('https://dns.google/resolve?name=example.com&type=A', {
        signal: internetCheck.signal
      })
      if (!isCurrentRun()) {
        return
      }
      results.push(
        resp.ok
          ? { label: 'Internet', status: 'pass', detail: 'Connected' }
          : { label: 'Internet', status: 'warn', detail: 'Unexpected response' }
      )
    } catch {
      if (!isCurrentRun()) {
        return
      }
      results.push({ label: 'Internet', status: 'fail', detail: 'No connection' })
    } finally {
      internetCheck.dispose()
      if (activeInternetCheckRef.current === internetCheck) {
        activeInternetCheckRef.current = null
      }
    }

    if (!isCurrentRun()) {
      return
    }
    setChecks([...results])

    try {
      const hosts = await loadHosts()
      for (const host of hosts) {
        if (!isCurrentRun()) {
          return
        }
        const reachable = await testHostReachability(host.endpoint)
        if (!isCurrentRun()) {
          return
        }
        results.push({
          label: host.name,
          status: reachable ? 'pass' : 'fail',
          detail: reachable
            ? `Reachable at ${formatEndpoint(host.endpoint)}`
            : unreachableHostDetail(host.endpoint)
        })
        setChecks([...results])
      }
    } catch {
      results.push({ label: 'Hosts', status: 'warn', detail: 'Could not test' })
    }

    if (!isCurrentRun()) {
      return
    }

    results.push({
      label: 'Platform',
      status: 'pass',
      detail: `${Platform.OS} ${Platform.Version ?? ''}`
    })

    setChecks([...results])
    setDiagnosticStatus('done')
  }, [])

  return (
    <View ref={setTroubleshootRootRef} className="bg-background pt-safe-offset-2 flex-1 p-4">
      <View className="mb-4 flex-row items-center">
        <Pressable
          className="mr-2 h-9 w-9 items-center justify-center"
          onPress={() => router.back()}
        >
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
        <Text className="text-foreground text-sm font-bold">Troubleshooting</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-6"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          className={cn(
            styles.diagnosticButton,
            styles.diagnosticButtonPressedActive,
            diagnosticStatus === 'running' && 'opacity-[0.5]'
          )}
          onPress={runDiagnostics}
          disabled={diagnosticStatus === 'running'}
        >
          {diagnosticStatus === 'running' ? (
            <ActivityIndicator size="small" colorClassName="accent-foreground" />
          ) : (
            <Activity size={16} colorClassName="accent-foreground" />
          )}
          <Text className={styles.diagnosticButtonLabel}>
            {diagnosticStatus === 'running'
              ? 'Running…'
              : diagnosticStatus === 'done'
                ? 'Run again'
                : 'Run diagnostics'}
          </Text>
        </Pressable>

        <Pressable
          className={cn(styles.diagnosticButton, styles.diagnosticButtonPressedActive)}
          onPress={() => router.push('/connection-log')}
        >
          <ScrollText size={16} colorClassName="accent-foreground" />
          <Text className={styles.diagnosticButtonLabel}>View connection log</Text>
        </Pressable>

        {checks.length > 0 && (
          <View className={styles.section}>
            {checks.map((check, i) => (
              <View key={i}>
                {i > 0 && <View className={styles.separator} />}
                <View className="flex-row items-center gap-2 px-3.5 py-2.5">
                  <StatusIcon status={check.status} />
                  <Text className="text-foreground text-sm font-medium">{check.label}</Text>
                  <Text
                    className={cn(
                      'flex-1 text-right text-xs text-muted-foreground/60',
                      check.status === 'fail' && 'text-destructive'
                    )}
                  >
                    {check.detail}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Text className="text-muted-foreground/60 mt-2 mb-2 px-1 text-xs font-semibold tracking-[0.5px] uppercase">
          Common issues
        </Text>

        <View className={styles.section}>
          {troubleshootCommonIssues.map((section, i) => (
            <View key={section.id}>
              {i > 0 && <View className={styles.separator} />}
              <Pressable
                className="active:bg-accent flex-row items-center gap-2.5 px-3.5 py-3"
                onPress={() => toggleSection(section.id)}
              >
                {section.icon}
                <Text className="text-foreground flex-1 text-sm font-medium">{section.title}</Text>
                {expandedId === section.id ? (
                  <ChevronUp size={16} colorClassName="accent-muted-foreground" />
                ) : (
                  <ChevronDown size={16} colorClassName="accent-muted-foreground" />
                )}
              </Pressable>
              {expandedId === section.id && (
                <View className="gap-1.5 px-3.5 pb-3">
                  {section.steps.map((step, j) => (
                    <View key={j} className="flex-row gap-2">
                      <Text className="text-muted-foreground/60 text-xs leading-[18px]">•</Text>
                      <Text className="text-muted-foreground/60 flex-1 text-xs leading-[18px]">
                        {step}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

        <View className="h-6" />
      </ScrollView>
    </View>
  )
}

const styles = {
  diagnosticButton: cn('flex-row items-center justify-center gap-2 bg-secondary py-3 px-4 mb-4'),
  diagnosticButtonPressedActive: cn('active:bg-accent'),
  diagnosticButtonLabel: cn('text-sm font-semibold text-foreground'),
  section: cn('bg-card overflow-hidden mb-4'),
  separator: cn('h-hairline bg-border mx-3')
} as const
