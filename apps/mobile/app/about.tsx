import {
  YIRU_GITHUB_REPOSITORY_SLUG,
  YIRU_GITHUB_REPOSITORY_URL
} from '@yiru/workbench-model/product'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { View, Text, Pressable, Linking, Platform } from 'react-native'

import { CaretLeft as ChevronLeft, GithubLogo, Globe } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { YiruLogo } from '../src/components/yiru-logo'

// Why: read version + native build identifier from expo-constants at
// runtime so the About screen never drifts out of sync with app.json.
// nativeBuildVersion is iOS buildNumber on iOS and versionCode on
// Android — different concepts, same role (monotonic native build id).
function getVersionLabel(): string {
  const version = Constants.expoConfig?.version ?? '?.?.?'
  const build =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : String(Constants.expoConfig?.android?.versionCode ?? '')
  return build ? `v${version} (${build})` : `v${version}`
}

export default function AboutScreen() {
  const router = useRouter()
  return (
    <View className="bg-background pt-safe-offset-2 flex-1 p-4">
      <View className="mb-6 flex-row items-center">
        <Pressable
          className="mr-2 h-9 w-9 items-center justify-center"
          onPress={() => router.back()}
        >
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
        <Text className="text-foreground text-sm font-bold">About</Text>
      </View>

      <View className="mb-4 items-center py-6">
        <YiruLogo size={28} />
        <Text className="text-foreground mt-2 text-sm font-extrabold">Yiru</Text>
        <Text className="text-muted-foreground/60 mt-1 text-xs">
          Open-source agent IDE for 100x builders
        </Text>
      </View>

      <View className="bg-card overflow-hidden">
        <Pressable
          className={cn(styles.row, styles.rowPressedActive)}
          onPress={() => void Linking.openURL('https://yiru.ai')}
        >
          <Globe size={16} colorClassName="accent-muted-foreground" />
          <Text className={styles.rowValue}>yiru.ai</Text>
        </Pressable>
        <View className="h-hairline bg-border mx-3" />
        <Pressable
          className={cn(styles.row, styles.rowPressedActive)}
          onPress={() => void Linking.openURL(YIRU_GITHUB_REPOSITORY_URL)}
        >
          <GithubLogo size={16} colorClassName="accent-muted-foreground" />
          <Text className={styles.rowValue}>{YIRU_GITHUB_REPOSITORY_SLUG}</Text>
        </Pressable>
      </View>

      <Text className="text-muted-foreground/60 mt-4 text-center text-xs">{getVersionLabel()}</Text>
    </View>
  )
}

const styles = {
  row: cn('flex-row items-center gap-2.5 py-3 px-3.5'),
  rowPressedActive: cn('active:bg-accent'),
  rowValue: cn('flex-1 text-right text-sm text-muted-foreground')
} as const
