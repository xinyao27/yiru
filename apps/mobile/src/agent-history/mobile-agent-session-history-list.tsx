import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, SectionList, Text, View } from 'react-native'

import { Play } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { recentSessionConversationTurns } from '../../../desktop/src/shared/ai-vault-session-display'
import type { AiVaultSession } from '../../../desktop/src/shared/ai-vault-types'
import { MobileAgentIcon } from '../components/mobile-agent-icon'
import type { MobileAgentHistorySection } from './agent-history-sections'
import type { MobileAgentHistoryCard } from './agent-history-session-card'
import { styles } from './agent-history-styles'

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
      contentContainerClassName={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColorClassName="accent-muted-foreground"
        />
      }
      renderSectionHeader={({ section }) => (
        <View className={styles.groupHeader}>
          <Text className={styles.groupHeaderText} numberOfLines={1}>
            {section.label}
          </Text>
          <Text className={styles.groupHeaderCount}>{section.data.length}</Text>
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
    <Pressable className={cn(styles.card, styles.cardPressedActive)} onPress={onPress}>
      <View className={styles.cardTopRow}>
        <MobileAgentIcon agentId={card.agent} size={16} />
        <Text className={styles.cardTitle} numberOfLines={1}>
          {card.title}
        </Text>
        {card.timeAgo ? <Text className={styles.cardTimeAgo}>{card.timeAgo}</Text> : null}
      </View>
      {card.lastMessage ? (
        <Text className={styles.cardLastMessage} numberOfLines={expanded ? undefined : 2}>
          {card.lastMessage}
        </Text>
      ) : null}
      <View className={styles.cardMetaRow}>
        <Text className={styles.cardMetaText}>{card.agentLabel}</Text>
        <Text className={styles.cardMetaText}>
          {card.messageCount} {card.messageCount === 1 ? 'message' : 'messages'}
        </Text>
        {showCurrentWorktreeBadge && card.isCurrentWorktree ? (
          <View className={styles.currentBadge}>
            <Text className={styles.currentBadgeText}>current worktree</Text>
          </View>
        ) : null}
        {session && onResume ? (
          <Pressable
            className={cn(
              styles.resumeButton,
              resumeActionState?.disabled && styles.resumeButtonDisabled,
              !resumeActionState?.disabled && styles.resumeButtonPressedActive
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
        <View className={styles.preview}>
          {previewTurns.map((turn, index) => (
            <View key={`${card.id}-turn-${index}`} className={styles.previewTurn}>
              <Text className={styles.previewRole}>{turn.role}</Text>
              <Text className={styles.previewText}>{turn.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  )
}
