import type { GitHubAssignableUser } from '@yiru/workbench-model/review'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'

import { BottomDrawer } from '~/components/bottom-drawer'
import { MobileGlassSurface } from '~/components/glass/surface'
import { Check } from '~/components/uniwind-icons'
import { fetchAssignableUsers } from '~/session/pr/github-rpc'
import type { RpcClient } from '~/transport/rpc-client'

import { mobilePrSidebarStyles as styles } from './styles'

type Props = {
  visible: boolean
  onClose: () => void
  client: RpcClient | null
  worktreeId: string
  // Logins already requested/reviewing (+ author) — surfaced at the top of the list.
  seededLogins: string[]
  // Resolves the optimistic requested-state for a login (so a just-toggled row reflects it).
  isRequested: (login: string) => boolean
  onToggle: (login: string) => void
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; users: GitHubAssignableUser[] }

// Searchable assignable-user list in a BottomDrawer. Mapped rows (not FlatList):
// this drawer is opened from the PR ScrollView, and a VirtualizedList nested in
// that ScrollView throws and can leave the Reviewers section blank.
// Seeded reviewers + author sort first for quick un-request.
export function ReviewerPickerDrawer({
  visible,
  onClose,
  client,
  worktreeId,
  seededLogins,
  isRequested,
  onToggle
}: Props) {
  const [load, setLoad] = useState<LoadState>({ status: 'idle' })
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!visible || !client) {
      return
    }
    let cancelled = false
    setLoad({ status: 'loading' })
    void fetchAssignableUsers(client, worktreeId)
      .then((outcome) => {
        if (cancelled) {
          return
        }
        setLoad(
          outcome.ok
            ? { status: 'loaded', users: outcome.result }
            : { status: 'error', message: outcome.error }
        )
      })
      .catch(() => {
        if (!cancelled) {
          setLoad({ status: 'error', message: 'Failed to load people' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [visible, client, worktreeId])

  const ordered = useMemo(() => {
    if (load.status !== 'loaded') {
      return []
    }
    const seed = new Set(seededLogins.map((l) => l.toLowerCase()))
    // Seeded reviewers sort first so the user can quickly un-request them.
    const sorted = [...load.users].sort((a, b) => {
      const aSeed = seed.has(a.login.toLowerCase()) ? 0 : 1
      const bSeed = seed.has(b.login.toLowerCase()) ? 0 : 1
      return aSeed - bSeed || a.login.localeCompare(b.login)
    })
    const q = query.trim().toLowerCase()
    if (!q) {
      return sorted
    }
    return sorted.filter(
      (u) => u.login.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q)
    )
  }, [load, seededLogins, query])

  return (
    <BottomDrawer visible={visible} onClose={onClose} dragContentToDismiss={false}>
      <Text className="text-foreground mb-2 text-sm font-bold">Reviewers</Text>
      <MobileGlassSurface className="mb-2 min-h-10 overflow-hidden rounded-xl" isInteractive>
        <TextInput
          className="text-foreground min-h-10 px-3 text-sm"
          value={query}
          onChangeText={setQuery}
          placeholder="Search people"
          placeholderTextColorClassName="accent-muted-foreground"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </MobileGlassSurface>
      {load.status === 'loading' ? (
        <View className={styles.pickerStateArea}>
          <ActivityIndicator colorClassName="accent-muted-foreground" />
        </View>
      ) : load.status === 'error' ? (
        <View className={styles.pickerStateArea}>
          <Text className={styles.emptyText}>{load.message}</Text>
        </View>
      ) : ordered.length === 0 ? (
        <View className={styles.pickerStateArea}>
          <Text className={styles.emptyText}>No matching people</Text>
        </View>
      ) : (
        <View className="gap-0">
          {ordered.map((item) => {
            const requested = isRequested(item.login)
            return (
              <Pressable
                key={item.login}
                className="min-h-11 flex-row items-center gap-2 py-1"
                onPress={() => onToggle(item.login)}
                accessibilityRole="button"
                accessibilityState={{ selected: requested }}
                accessibilityLabel={`${requested ? 'Remove' : 'Request'} ${item.login}`}
              >
                <View className={styles.rowTrailing}>
                  {requested ? <Check size={16} colorClassName="accent-foreground" /> : null}
                </View>
                <View className="min-w-0 flex-1">
                  <Text className={styles.rowTitle} numberOfLines={1}>
                    {item.name ? `${item.name} (${item.login})` : item.login}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      )}
    </BottomDrawer>
  )
}
