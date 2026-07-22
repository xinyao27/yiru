import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'

import { Check, CaretDown as ChevronDown } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { searchBaseRefs } from '../source-control/mobile-base-ref-search'
import type { RpcClient } from '../transport/rpc-client'

type Props = {
  client: RpcClient | null
  worktreeId: string
  value: string
  onChange: (ref: string) => void
  editable?: boolean
}

// Base-branch field for the create-PR composer: a free-text input that also searches
// repo refs (debounced) and offers matches to tap — the RN analogue of desktop's
// base-ref combobox. Free text stays valid so an SSH-only / unmatched ref can still
// be entered.
export function MobilePrBasePicker({
  client,
  worktreeId,
  value,
  onChange,
  editable = true
}: Props) {
  const [results, setResults] = useState<string[]>([])
  const [focused, setFocused] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guards: drop results after unmount, and ignore an earlier search whose response
  // arrives after a later one (out-of-order network) so stale matches can't clobber.
  const mounted = useRef(true)
  const seq = useRef(0)

  useEffect(() => {
    return () => {
      mounted.current = false
      if (timer.current) {
        clearTimeout(timer.current)
      }
    }
  }, [])

  const queryRefs = useCallback(
    (query: string) => {
      if (timer.current) {
        clearTimeout(timer.current)
      }
      if (!client || query.trim().length === 0) {
        // Advance the generation so an earlier in-flight search can't land and
        // repopulate results after the input was cleared.
        seq.current += 1
        setResults([])
        return
      }
      timer.current = setTimeout(() => {
        const requestSeq = ++seq.current
        void searchBaseRefs(client, worktreeId, query.trim())
          .then((refs) => {
            if (!mounted.current || requestSeq !== seq.current) {
              return
            }
            setResults(refs.filter((r) => r !== query).slice(0, 6))
          })
          // Why: a rejected ref search must not escape as an unhandled rejection;
          // drop to an empty result set (free text stays valid to submit).
          .catch(() => {
            if (mounted.current && requestSeq === seq.current) {
              setResults([])
            }
          })
      }, 200)
    },
    [client, worktreeId]
  )

  return (
    <View>
      <View className={cn(styles.inputShell, !editable && styles.inputShellDisabled)}>
        <TextInput
          className={styles.input}
          value={value}
          onChangeText={(text) => {
            onChange(text)
            queryRefs(text)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="main"
          placeholderTextColorClassName="accent-muted-foreground"
          autoCapitalize="none"
          autoCorrect={false}
          editable={editable}
        />
        <ChevronDown size={14} colorClassName="accent-muted-foreground" />
      </View>
      {focused && results.length > 0 ? (
        <View className={styles.results}>
          {results.map((ref) => (
            <Pressable
              key={ref}
              className={cn(styles.resultRow, styles.resultRowPressedActive)}
              onPress={() => {
                onChange(ref)
                setResults([])
              }}
            >
              <Text className={styles.resultText} numberOfLines={1}>
                {ref}
              </Text>
              {ref === value ? <Check size={14} colorClassName="accent-foreground" /> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = {
  inputShell: cn('min-h-10 flex-row items-center gap-1 bg-secondary rounded-none px-3 py-1'),
  inputShellDisabled: cn('opacity-[0.6]'),
  input: cn('flex-1 min-w-0 p-0 text-foreground text-[14px] font-mono'),
  results: cn('mt-1 border-hairline border-border rounded-none bg-card overflow-hidden'),
  resultRow: cn(
    'min-h-10 flex-row items-center justify-between gap-2 px-3 border-b-hairline border-b-border'
  ),
  resultRowPressedActive: cn('active:bg-secondary'),
  resultText: cn('flex-1 min-w-0 text-foreground text-[14px] font-mono')
} as const
