import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { CaretRight as ChevronRight, Globe } from '@/components/uniwind-icons'

import { PickerModal, type PickerOption } from '../src/components/picker-modal'
import {
  loadTerminalLinkOpenMode,
  saveTerminalLinkOpenMode,
  type MobileTerminalLinkOpenMode
} from '../src/storage/preferences'

const LINK_MODE_OPTIONS: PickerOption<MobileTerminalLinkOpenMode>[] = [
  {
    value: 'yiru-browser',
    label: 'Yiru browser on desktop',
    subtitle: 'Open in the streamed browser from your paired desktop.'
  },
  {
    value: 'phone-browser',
    label: 'Phone browser',
    subtitle: 'Open in Safari, Chrome, or another browser on this phone.'
  }
]

function linkModeLabel(mode: MobileTerminalLinkOpenMode): string {
  return (
    LINK_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? LINK_MODE_OPTIONS[0]!.label
  )
}

export default function BrowserSettingsScreen(): React.JSX.Element {
  const [linkMode, setLinkMode] = useState<MobileTerminalLinkOpenMode>('yiru-browser')
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    void loadTerminalLinkOpenMode().then(setLinkMode)
  }, [])

  const selectLinkMode = useCallback((mode: MobileTerminalLinkOpenMode) => {
    setLinkMode(mode)
    void saveTerminalLinkOpenMode(mode)
  }, [])

  return (
    <View className="bg-background flex-1 px-4 pt-4">
      <ScrollView contentContainerClassName="pb-6" showsVerticalScrollIndicator={false}>
        <Text className="text-muted-foreground mb-1 px-1 text-xs font-semibold tracking-wide">
          LINKS
        </Text>
        <Text className="text-muted-foreground px-1 text-xs leading-5">
          Choose where HTTP(S) links tapped in terminal output open.
        </Text>
        <View className="bg-card mt-2 overflow-hidden rounded-2xl">
          <Pressable
            className="active:bg-accent flex-row items-center gap-2.5 px-3.5 py-3"
            onPress={() => setPickerOpen(true)}
          >
            <Globe size={16} colorClassName="accent-muted-foreground" />
            <View className="flex-1">
              <Text className="text-foreground text-sm font-medium">Open terminal links</Text>
              <Text className="text-muted-foreground mt-0.5 text-xs">
                {linkModeLabel(linkMode)}
              </Text>
            </View>
            <ChevronRight size={16} colorClassName="accent-muted-foreground" />
          </Pressable>
        </View>
      </ScrollView>

      <PickerModal<MobileTerminalLinkOpenMode>
        visible={pickerOpen}
        title="Open terminal links"
        options={LINK_MODE_OPTIONS}
        selected={linkMode}
        onSelect={selectLinkMode}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  )
}
