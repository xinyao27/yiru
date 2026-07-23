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
    <View className={cn(styles.container, 'pt-safe-offset-2')}>
      <View className={styles.topRow}>
        <Pressable className={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        </Pressable>
        <Text className={styles.heading}>About</Text>
      </View>

      <View className={styles.brand}>
        <YiruLogo size={28} />
        <Text className={styles.brandName}>Yiru</Text>
        <Text className={styles.brandSub}>Open-source agent IDE for 100x builders</Text>
      </View>

      <View className={styles.section}>
        <Pressable
          className={cn(styles.row, styles.rowPressedActive)}
          onPress={() => void Linking.openURL('https://yiru.ai')}
        >
          <Globe size={16} colorClassName="accent-muted-foreground" />
          <Text className={styles.rowValue}>yiru.ai</Text>
        </Pressable>
        <View className={styles.separator} />
        <Pressable
          className={cn(styles.row, styles.rowPressedActive)}
          onPress={() => void Linking.openURL(YIRU_GITHUB_REPOSITORY_URL)}
        >
          <GithubLogo size={16} colorClassName="accent-muted-foreground" />
          <Text className={styles.rowValue}>{YIRU_GITHUB_REPOSITORY_SLUG}</Text>
        </Pressable>
      </View>

      <Text className={styles.versionText}>{getVersionLabel()}</Text>
    </View>
  )
}

const styles = {
  container: cn('flex-1 bg-background p-4'),
  topRow: cn('flex-row items-center mb-6'),
  backButton: cn('w-9 h-9 rounded-none items-center justify-center mr-2'),
  heading: cn('text-[20px] font-bold text-foreground'),
  brand: cn('items-center py-6 mb-4'),
  brandName: cn('text-[22px] font-extrabold text-foreground mt-2'),
  brandSub: cn('text-[13px] text-muted-foreground/60 mt-1'),
  section: cn('bg-card rounded-none overflow-hidden'),
  row: cn('flex-row items-center gap-2.5 py-3 px-3.5'),
  rowPressedActive: cn('active:bg-secondary'),
  rowLabel: cn('flex-1 text-[14px] font-medium text-foreground'),
  rowValue: cn('flex-1 text-right text-[14px] text-muted-foreground'),
  separator: cn('h-hairline bg-border mx-3'),
  versionText: cn('mt-4 text-center text-[12px] text-muted-foreground/60')
} as const
