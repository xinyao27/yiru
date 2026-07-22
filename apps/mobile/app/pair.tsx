import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native'

import { cn } from '@/style/class-names'

import { extractPairingCodeFromUrl } from '../src/transport/pairing'

export default function PairRedirectScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ code?: string }>()
  const [missingCode, setMissingCode] = useState(false)

  const goHome = useCallback(() => {
    router.replace('/')
  }, [router])

  useEffect(() => {
    let disposed = false

    async function redirectToConfirm() {
      const codeParam = Array.isArray(params.code) ? params.code[0] : params.code
      if (codeParam) {
        router.replace({ pathname: '/pair-confirm', params: { code: codeParam } })
        return
      }

      const initialUrl = await Linking.getInitialURL().catch(() => null)
      const code = initialUrl ? extractPairingCodeFromUrl(initialUrl) : null
      if (disposed) {
        return
      }
      if (code) {
        router.replace({ pathname: '/pair-confirm', params: { code } })
        return
      }
      setMissingCode(true)
    }

    void redirectToConfirm()
    return () => {
      disposed = true
    }
  }, [params.code, router])

  return (
    <View className={styles.container}>
      {missingCode ? (
        <>
          <Text className={styles.errorText}>Missing pairing code</Text>
          <Pressable className={styles.primaryButton} onPress={goHome}>
            <Text className={styles.primaryButtonText}>Back to home</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator size="large" colorClassName="accent-muted-foreground" />
      )}
    </View>
  )
}

const styles = {
  container: cn('flex-1 items-center justify-center bg-background p-4'),
  errorText: cn('text-destructive text-[14px] leading-[20px] mb-6 text-center'),
  primaryButton: cn('items-center bg-foreground rounded-none px-6 py-2.5'),
  primaryButtonText: cn('text-background text-[14px] font-semibold')
} as const
