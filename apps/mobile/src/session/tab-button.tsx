import type { LayoutChangeEvent } from 'react-native'
import { Text, View } from 'react-native'

import { MobileAgentIcon } from '~/components/agent-icon'
import { MobileGlassPressable } from '~/components/glass/pressable'
import { File, FileText, Globe } from '~/components/uniwind-icons'
import type { MobileSessionTab } from '~/session/screen-state'
import {
  getMobileSessionTabTitle,
  resolveMobileTerminalTabAgentId
} from '~/session/terminal/tab-agent'

type MobileSessionTabButtonProps = {
  tab: MobileSessionTab
  active: boolean
  onLayout: (event: LayoutChangeEvent) => void
  onPress: () => void
  onLongPress: () => void
}

function MobileSessionTabLabel({
  tab,
  active
}: Pick<MobileSessionTabButtonProps, 'tab' | 'active'>) {
  const agentId = tab.type === 'terminal' ? resolveMobileTerminalTabAgentId(tab) : null
  const iconColorClassName = active ? 'accent-foreground' : 'accent-muted-foreground'
  return (
    <View className="max-w-full flex-row items-center gap-1">
      {tab.type === 'browser' ? <Globe size={16} colorClassName={iconColorClassName} /> : null}
      {tab.type === 'markdown' ? <FileText size={16} colorClassName={iconColorClassName} /> : null}
      {tab.type === 'file' ? <File size={16} colorClassName={iconColorClassName} /> : null}
      {agentId ? <MobileAgentIcon agentId={agentId} size={16} /> : null}
      <Text
        className={
          active
            ? 'text-foreground shrink text-sm font-semibold'
            : 'text-muted-foreground shrink text-sm'
        }
        numberOfLines={1}
      >
        {getMobileSessionTabTitle(tab)}
      </Text>
    </View>
  )
}

export function MobileSessionTabButton({
  tab,
  active,
  onLayout,
  onPress,
  onLongPress
}: MobileSessionTabButtonProps): React.JSX.Element {
  return (
    <MobileGlassPressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      delayLongPress={400}
      isSelected={active}
      onLayout={onLayout}
      onLongPress={onLongPress}
      onPress={onPress}
      size="regular"
      variant="tab"
    >
      <MobileSessionTabLabel tab={tab} active={active} />
    </MobileGlassPressable>
  )
}
