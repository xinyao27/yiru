import { recentSessionConversationTurns } from '@yiru/workbench-model/agent'
import type { AiVaultSession } from '@yiru/workbench-model/agent'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, SectionList, Text, View } from 'react-native'

import { MobileGlassIconButton } from '@/components/glass/icon-button'

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
          <Text className="text-muted-foreground text-xs uppercase" numberOfLines={1}>
            {section.label}
          </Text>
          <Text className="text-muted-foreground text-xs">{section.data.length}</Text>
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
    <Pressable className="active:bg-accent border-border border-b-hairline py-3" onPress={onPress}>
      <View className="flex-row items-center gap-2">
        <MobileAgentIcon agentId={card.agent} size={16} />
        <Text className="text-foreground flex-1 text-sm" numberOfLines={1}>
          {card.title}
        </Text>
        {card.timeAgo ? (
          <Text className="text-muted-foreground text-xs">{card.timeAgo}</Text>
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
          <View className="bg-secondary rounded-full px-2 py-0.5">
            <Text className="text-primary text-xs">current worktree</Text>
          </View>
        ) : null}
        {session && onResume ? (
          <View className="ml-auto h-8 w-8 items-center justify-center">
            {resumeActionState?.loading ? (
              <ActivityIndicator size="small" colorClassName="accent-foreground" />
            ) : (
              <MobileGlassIconButton
                accessibilityLabel="Resume agent session"
                disabled={resumeActionState?.disabled}
                icon="play"
                onPress={(event) => {
                  event.stopPropagation()
                  if (!resumeActionState?.disabled) {
                    void onResume(session)
                  }
                }}
                size="small"
              />
            )}
          </View>
        ) : null}
      </View>
      {expanded && previewTurns.length > 0 ? (
        <View className="border-t-border mt-2 gap-2 border-t pt-2">
          {previewTurns.map((turn, index) => (
            <View key={`${card.id}-turn-${index}`} className="gap-0.5">
              <Text className="text-muted-foreground text-xs uppercase">{turn.role}</Text>
              <Text className="text-muted-foreground text-xs">{turn.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  )
}
