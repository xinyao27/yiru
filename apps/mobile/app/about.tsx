import {
  YIRU_GITHUB_REPOSITORY_SLUG,
  YIRU_GITHUB_REPOSITORY_URL
} from '@yiru/workbench-model/product'
import Constants from 'expo-constants'
import { View, Text, Pressable, Linking, Platform } from 'react-native'

import { GithubLogo, Globe } from '@/components/uniwind-icons'

import { MobileGlassSection } from '../src/components/glass/section'
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
  return (
    <View className="bg-background flex-1 p-4">
      <View className="mb-4 items-center py-6">
        <YiruLogo size={28} colorClassName="accent-foreground" />
        <Text className="text-foreground mt-2 text-sm font-extrabold">Yiru</Text>
        <Text className="text-muted-foreground mt-1 text-xs">
          Open-source agent IDE for 100x builders
        </Text>
      </View>

      <MobileGlassSection>
        <Pressable
          className="active:bg-accent flex-row items-center gap-2.5 px-3.5 py-3"
          onPress={() => void Linking.openURL('https://yiru.ai')}
        >
          <Globe size={16} colorClassName="accent-muted-foreground" />
          <Text className="text-muted-foreground flex-1 text-right text-sm">yiru.ai</Text>
        </Pressable>
        <View className="h-hairline bg-border mx-3" />
        <Pressable
          className="active:bg-accent flex-row items-center gap-2.5 px-3.5 py-3"
          onPress={() => void Linking.openURL(YIRU_GITHUB_REPOSITORY_URL)}
        >
          <GithubLogo size={16} colorClassName="accent-muted-foreground" />
          <Text className="text-muted-foreground flex-1 text-right text-sm">
            {YIRU_GITHUB_REPOSITORY_SLUG}
          </Text>
        </Pressable>
      </MobileGlassSection>

      <Text className="text-muted-foreground mt-4 text-center text-xs">{getVersionLabel()}</Text>
    </View>
  )
}
