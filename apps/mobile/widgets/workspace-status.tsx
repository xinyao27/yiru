import { Circle, Gauge, HStack, Image, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui'
import {
  accessibilityElement,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  gaugeStyle,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  padding,
  tint,
  widgetURL
} from '@expo/ui/swift-ui/modifiers'
import { createWidget, type WidgetEnvironment } from 'expo-widgets'

export type RunningWorkspaceSnapshot = {
  contextLabel: string
  displayName: string
  status: 'active' | 'permission' | 'working'
  statusLabel: string
}

export type WorkspaceStatusWidgetProps = {
  activeCount: number
  attentionCount: number
  emptyLabel: string
  hasPrimaryWorkspace: boolean
  openUrl: string
  primaryWorkspace: RunningWorkspaceSnapshot
  runningLabel: string
  totalLabel: string
  totalWorkspaces: number
  updatedLabel: string
  waitingLabel: string
}

function WorkspaceStatus(
  props: WorkspaceStatusWidgetProps,
  environment: WidgetEnvironment
): React.JSX.Element {
  'widget'

  const isDark = environment.colorScheme === 'dark'
  const backgroundColor = isDark ? '#1C1C1E' : '#F7F7F5'
  const primaryColor = isDark ? '#FFFFFF' : '#0A0A0A'
  const secondaryColor = isDark ? '#B8B8BD' : '#65656A'
  const progress = props.totalWorkspaces === 0 ? 0 : props.activeCount / props.totalWorkspaces
  const primaryStatusColor =
    props.primaryWorkspace.status === 'permission'
      ? '#F59E0B'
      : props.primaryWorkspace.status === 'working'
        ? '#22C55E'
        : '#1687EC'
  const waitingColor = props.attentionCount > 0 ? '#F59E0B' : secondaryColor

  return (
    <ZStack
      modifiers={[
        containerBackground(backgroundColor, 'widget'),
        clipShape('containerRelativeShape'),
        widgetURL(props.openUrl)
      ]}
    >
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[
          frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
          padding({ all: 14 }),
          accessibilityElement('combine')
        ]}
      >
        <HStack alignment="top" spacing={6}>
          <Gauge
            value={Math.max(0, Math.min(1, progress))}
            modifiers={[
              frame({ width: 46, height: 46 }),
              gaugeStyle('circularCapacity'),
              tint(primaryColor)
            ]}
          />
          <Spacer />
          <VStack alignment="trailing" spacing={2}>
            <Image systemName="terminal.fill" size={12} color={primaryColor} />
            <HStack spacing={4}>
              <Image systemName="arrow.triangle.2.circlepath" size={10} color={secondaryColor} />
              <Text
                modifiers={[font({ size: 9, weight: 'semibold' }), foregroundStyle(secondaryColor)]}
              >
                {props.updatedLabel}
              </Text>
            </HStack>
          </VStack>
        </HStack>

        <Spacer />

        <HStack alignment="bottom" spacing={8}>
          <VStack
            alignment="leading"
            spacing={3}
            modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
          >
            <Text
              modifiers={[
                font({ size: 28, weight: 'bold' }),
                foregroundStyle(primaryColor),
                monospacedDigit(),
                minimumScaleFactor(0.55),
                lineLimit(1)
              ]}
            >
              {props.activeCount}
            </Text>
            <HStack spacing={3}>
              <Circle
                modifiers={[frame({ width: 6, height: 6 }), foregroundStyle(primaryStatusColor)]}
              />
              <Text
                modifiers={[
                  font({ size: 9, weight: 'semibold' }),
                  foregroundStyle(primaryColor),
                  lineLimit(1)
                ]}
              >
                {props.runningLabel}
              </Text>
            </HStack>
            <HStack spacing={3}>
              <Text
                modifiers={[
                  font({ size: 11, weight: 'bold' }),
                  foregroundStyle(primaryColor),
                  monospacedDigit(),
                  lineLimit(1)
                ]}
              >
                {props.totalWorkspaces}
              </Text>
              <Text
                modifiers={[
                  font({ size: 9, weight: 'semibold' }),
                  foregroundStyle(secondaryColor),
                  lineLimit(1)
                ]}
              >
                {props.totalLabel}
              </Text>
            </HStack>
          </VStack>

          <VStack
            alignment="leading"
            spacing={3}
            modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}
          >
            <Text
              modifiers={[
                font({ size: 28, weight: 'bold' }),
                foregroundStyle(waitingColor),
                monospacedDigit(),
                minimumScaleFactor(0.55),
                lineLimit(1)
              ]}
            >
              {props.attentionCount}
            </Text>
            <HStack spacing={3}>
              <Circle modifiers={[frame({ width: 6, height: 6 }), foregroundStyle(waitingColor)]} />
              <Text
                modifiers={[
                  font({ size: 9, weight: 'semibold' }),
                  foregroundStyle(waitingColor),
                  lineLimit(1)
                ]}
              >
                {props.waitingLabel}
              </Text>
            </HStack>
            <Text
              modifiers={[
                font({ size: 11, weight: 'bold' }),
                foregroundStyle(waitingColor),
                minimumScaleFactor(0.65),
                lineLimit(1)
              ]}
            >
              {props.hasPrimaryWorkspace ? props.primaryWorkspace.displayName : props.emptyLabel}
            </Text>
          </VStack>
        </HStack>
      </VStack>
    </ZStack>
  )
}

export default createWidget('WorkspaceStatusWidget', WorkspaceStatus)
