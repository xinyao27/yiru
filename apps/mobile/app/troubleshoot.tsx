import { useRouter } from 'expo-router'
import { useState, useCallback, useRef } from 'react'
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native'

import {
  CaretDown as ChevronDown,
  CaretUp as ChevronUp,
  Pulse as Activity,
  CheckCircle as CheckCircle2,
  Scroll as ScrollText,
  XCircle,
  Warning as AlertTriangle
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { MobileContentSection } from '../src/components/content-section'
import { MobileGlassGroup } from '../src/components/glass/group'
import { MobileGlassPressable } from '../src/components/glass/pressable'
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
    <View ref={setTroubleshootRootRef} className="bg-background flex-1 p-4">
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-6"
        showsVerticalScrollIndicator={false}
      >
        <MobileGlassGroup className="mb-4 gap-2" spacing={8}>
          <MobileGlassPressable
            className="rounded-full"
            contentClassName="min-h-11 flex-row items-center justify-center gap-2 rounded-full px-4"
            disabled={diagnosticStatus === 'running'}
            onPress={runDiagnostics}
          >
            {diagnosticStatus === 'running' ? (
              <ActivityIndicator size="small" colorClassName="accent-foreground" />
            ) : (
              <Activity size={18} colorClassName="accent-foreground" />
            )}
            <Text className="text-foreground text-sm">
              {diagnosticStatus === 'running'
                ? 'Running…'
                : diagnosticStatus === 'done'
                  ? 'Run again'
                  : 'Run diagnostics'}
            </Text>
          </MobileGlassPressable>

          <MobileGlassPressable
            className="rounded-full"
            contentClassName="min-h-11 flex-row items-center justify-center gap-2 rounded-full px-4"
            onPress={() => router.push('/connection-log')}
          >
            <ScrollText size={18} colorClassName="accent-foreground" />
            <Text className="text-foreground text-sm">View connection log</Text>
          </MobileGlassPressable>
        </MobileGlassGroup>

        {checks.length > 0 && (
          <MobileContentSection className="mb-4">
            {checks.map((check, i) => (
              <View key={`${check.label}-${check.detail}`}>
                {i > 0 && <View className="bg-border h-hairline mx-3" />}
                <View className="flex-row items-center gap-2 px-3 py-3">
                  <View className="w-5 items-center">
                    <StatusIcon status={check.status} />
                  </View>
                  <Text className="text-foreground text-sm font-medium">{check.label}</Text>
                  <Text
                    className={cn(
                      'flex-1 text-right text-xs text-muted-foreground',
                      check.status === 'fail' && 'text-destructive'
                    )}
                  >
                    {check.detail}
                  </Text>
                </View>
              </View>
            ))}
          </MobileContentSection>
        )}

        <Text className="text-muted-foreground mt-2 mb-2 px-1 text-xs font-semibold tracking-wide uppercase">
          Common issues
        </Text>

        <MobileContentSection className="mb-4">
          {troubleshootCommonIssues.map((section, i) => (
            <View key={section.id}>
              {i > 0 && <View className="bg-border h-hairline mx-3" />}
              <Pressable
                className="active:bg-accent flex-row items-center gap-2 px-3 py-3"
                onPress={() => toggleSection(section.id)}
              >
                <View className="w-5 items-center">{section.icon}</View>
                <Text className="text-foreground flex-1 text-sm font-medium">{section.title}</Text>
                <View className="w-5 items-center">
                  {expandedId === section.id ? (
                    <ChevronUp size={16} colorClassName="accent-muted-foreground" />
                  ) : (
                    <ChevronDown size={16} colorClassName="accent-muted-foreground" />
                  )}
                </View>
              </Pressable>
              {expandedId === section.id && (
                <View className="gap-2 px-3 pb-3">
                  {section.steps.map((step) => (
                    <View key={`${section.id}-${step}`} className="flex-row gap-2">
                      <Text className="text-muted-foreground text-xs leading-5">•</Text>
                      <Text className="text-muted-foreground flex-1 text-xs leading-5">{step}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </MobileContentSection>

        <View className="h-6" />
      </ScrollView>
    </View>
  )
}
