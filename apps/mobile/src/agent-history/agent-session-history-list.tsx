import { recentSessionConversationTurns } from '@yiru/workbench-model/agent'
import type { AiVaultSession } from '@yiru/workbench-model/agent'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, SectionList, Text, View } from 'react-native'

import { Play } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { MobileAgentIcon } from '../components/agent-icon'
import type { MobileAgentHistorySection } from './sections'
import type { MobileAgentHistoryCard } from './session-card'
import { styles } from './styles'

// Lazy-render at most this many preview turns when a card is tapped — the
// scanner already bounds preview text, but rendering them only on tap keeps the
// list cheap.
const PREVIEW_TURN_LIMIT = 5

type Props = {
  sections: MobileAgentHistorySection[]
  sessionsById: ReadonlyMap<string, AiVaultSession>
  refreshing: boolean
  showCurrentWorktreeBadges: boolean
  resumeActionStateBySessionId?: ReadonlyMap<string, { disabled: boolean; loading: boolean }>
  onResume?: (session: AiVaultSession) => void | Promise<void>
  onRefresh: () => void
}

export function MobileAgentSessionHistoryList({
  sections,
  sessionsById,
  refreshing,
  showCurrentWorktreeBadges,
  resumeActionStateBySessionId,
  onResume,
  onRefresh
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  const renderItem = useCallback(
    ({ item }: { item: MobileAgentHistoryCard }) => (
      <AgentHistoryCardRow
        card={item}
        expanded={expandedId === item.id}
        session={sessionsById.get(item.id) ?? null}
        showCurrentWorktreeBadge={showCurrentWorktreeBadges}
        resumeActionState={resumeActionStateBySessionId?.get(item.id)}
        onResume={onResume}
        onPress={() => toggleExpanded(item.id)}
      />
    ),
    [
      expandedId,
      onResume,
      resumeActionStateBySessionId,
      sessionsById,
      showCurrentWorktreeBadges,
      toggleExpanded
    ]
  )

  return (
    <SectionList
      sections={sections}
      keyExtractor={(card) => card.id}
      stickySectionHeadersEnabled={false}
      contentContainerClassName="px-3 pt-2 pb-6"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColorClassName="accent-muted-foreground"
        />
      }
      renderSectionHeader={({ section }) => (
        <View className="flex-row items-center gap-2 py-2">
          <Text className="text-muted-foreground text-xs font-semibold uppercase" numberOfLines={1}>
            {section.label}
          </Text>
          <Text className="text-muted-foreground/60 text-xs">{section.data.length}</Text>
        </View>
      )}
      renderItem={renderItem}
    />
  )
}

function AgentHistoryCardRow({
  card,
  expanded,
  session,
  showCurrentWorktreeBadge,
  resumeActionState,
  onResume,
  onPress
}: {
  card: MobileAgentHistoryCard
  expanded: boolean
  session: AiVaultSession | null
  showCurrentWorktreeBadge: boolean
  resumeActionState?: { disabled: boolean; loading: boolean }
  onResume?: (session: AiVaultSession) => void | Promise<void>
  onPress: () => void
}) {
  const previewTurns = useMemo(
    () => (expanded && session ? recentSessionConversationTurns(session, PREVIEW_TURN_LIMIT) : []),
    [expanded, session]
  )

  return (
    <Pressable className={cn('bg-card p-3 mb-2', 'active:bg-accent')} onPress={onPress}>
      <View className="flex-row items-center gap-2">
        <MobileAgentIcon agentId={card.agent} size={16} />
        <Text className="text-foreground flex-1 text-sm font-semibold" numberOfLines={1}>
          {card.title}
        </Text>
        {card.timeAgo ? (
          <Text className="text-muted-foreground/60 text-xs">{card.timeAgo}</Text>
        ) : null}
      </View>
      {card.lastMessage ? (
        <Text
          className="text-muted-foreground mt-1 text-xs"
          numberOfLines={expanded ? undefined : 2}
        >
          {card.lastMessage}
        </Text>
      ) : null}
      <View className="mt-1 flex-row flex-wrap items-center gap-2">
        <Text className={styles.cardMetaText}>{card.agentLabel}</Text>
        <Text className={styles.cardMetaText}>
          {card.messageCount} {card.messageCount === 1 ? 'message' : 'messages'}
        </Text>
        {showCurrentWorktreeBadge && card.isCurrentWorktree ? (
          <View className="bg-secondary px-2 py-[2px]">
            <Text className="text-primary text-xs font-semibold">current worktree</Text>
          </View>
        ) : null}
        {session && onResume ? (
          <Pressable
            className={cn(
              'min-h-7 min-w-7 items-center justify-center ml-auto px-1 py-1',
              resumeActionState?.disabled && 'opacity-[0.45]',
              !resumeActionState?.disabled && 'active:bg-accent'
            )}
            onPress={(event) => {
              event.stopPropagation()
              if (!resumeActionState?.disabled) {
                void onResume(session)
              }
            }}
            disabled={resumeActionState?.disabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Resume agent session"
          >
            {resumeActionState?.loading ? (
              <ActivityIndicator size="small" colorClassName="accent-foreground" />
            ) : (
              <Play size={17} colorClassName="accent-foreground" />
            )}
          </Pressable>
        ) : null}
      </View>
      {expanded && previewTurns.length > 0 ? (
        <View className="border-t-border mt-2 gap-2 border-t pt-2">
          {previewTurns.map((turn, index) => (
            <View key={`${card.id}-turn-${index}`} className="gap-[2px]">
              <Text className="text-muted-foreground/60 text-xs font-semibold uppercase">
                {turn.role}
              </Text>
              <Text className="text-muted-foreground text-xs">{turn.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  )
}
