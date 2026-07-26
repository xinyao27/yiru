import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native'

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
    <View className="bg-background flex-1 items-center justify-center p-4">
      {missingCode ? (
        <>
          <Text className="text-destructive mb-6 text-center text-sm leading-[20px]">
            Missing pairing code
          </Text>
          <Pressable className="bg-primary items-center px-6 py-2.5" onPress={goHome}>
            <Text className="text-primary-foreground text-sm font-semibold">Back to home</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator size="large" colorClassName="accent-muted-foreground" />
      )}
    </View>
  )
}
