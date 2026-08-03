import {
  YIRU_GITHUB_REPOSITORY_SLUG,
  YIRU_GITHUB_REPOSITORY_URL
} from '@yiru/workbench-model/product'
import Constants from 'expo-constants'
import { Link } from 'expo-router'
import { View, Text, Pressable, Platform } from 'react-native'

import { MobileContentSection } from '~/components/content-section'
import { GithubLogo, Globe } from '~/components/uniwind-icons'
import { YiruLogo } from '~/components/yiru-logo'
import { translate } from '~/i18n/translate'

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
        <Text className="text-foreground mt-2 text-sm font-extrabold">
          {translate('mobile.product.name', 'Yiru')}
        </Text>
        <Text className="text-muted-foreground mt-1 text-xs">
          {translate('mobile.about.tagline', 'Open-source agent IDE for 100x builders')}
        </Text>
      </View>

      <MobileContentSection>
        <Link href="https://yiru.ai" asChild>
          <Pressable className="active:bg-accent min-h-11 flex-row items-center gap-2 px-3 py-3">
            <View className="w-5 items-center">
              <Globe size={16} colorClassName="accent-muted-foreground" />
            </View>
            <Text className="text-muted-foreground flex-1 text-right text-sm">
              {translate('mobile.about.website', 'yiru.ai')}
            </Text>
          </Pressable>
        </Link>
        <View className="h-hairline bg-border mx-3" />
        <Link href={YIRU_GITHUB_REPOSITORY_URL} asChild>
          <Pressable className="active:bg-accent min-h-11 flex-row items-center gap-2 px-3 py-3">
            <View className="w-5 items-center">
              <GithubLogo size={16} colorClassName="accent-muted-foreground" />
            </View>
            <Text className="text-muted-foreground flex-1 text-right text-sm">
              {YIRU_GITHUB_REPOSITORY_SLUG}
            </Text>
          </Pressable>
        </Link>
      </MobileContentSection>

      <Text className="text-muted-foreground mt-4 text-center text-xs">{getVersionLabel()}</Text>
    </View>
  )
}
