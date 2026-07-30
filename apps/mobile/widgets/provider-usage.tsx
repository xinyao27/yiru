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

export type ProviderUsageSnapshot = {
  name: string
  openUrl: string
  sessionUsedPercent: number
  updatedLabel: string
  weeklyResetLabel: string
  weeklyUsedPercent: number
}

export type ProviderUsageWidgetProps = {
  claude: ProviderUsageSnapshot
  codex: ProviderUsageSnapshot
  sessionLabel: string
  unavailableLabel: string
  usedLabel: string
  weeklyLabel: string
}

type ProviderUsageConfiguration = {
  provider?: 'claude' | 'codex'
}

function ProviderUsage(
  props: ProviderUsageWidgetProps,
  environment: WidgetEnvironment<ProviderUsageConfiguration>
): React.JSX.Element {
  'widget'

  const providerKey = environment.configuration?.provider ?? 'codex'
  const provider = providerKey === 'claude' ? props.claude : props.codex
  const isClaude = providerKey === 'claude'
  const isDark = environment.colorScheme === 'dark'
  const backgroundColor = isClaude
    ? isDark
      ? '#8F432B'
      : '#C96843'
    : isDark
      ? '#1C1C1E'
      : '#F7F7F5'
  const primaryColor = isClaude || isDark ? '#FFFFFF' : '#0A0A0A'
  const secondaryColor = isClaude ? '#FFD8A8' : isDark ? '#B8B8BD' : '#65656A'
  const weeklyUsed =
    provider.weeklyUsedPercent < 0
      ? null
      : Math.max(0, Math.min(100, Math.round(provider.weeklyUsedPercent)))
  const weeklyRemaining = weeklyUsed === null ? null : 100 - weeklyUsed
  const sessionUsed =
    provider.sessionUsedPercent < 0
      ? null
      : Math.max(0, Math.min(100, Math.round(provider.sessionUsedPercent)))
  const sessionRemaining = sessionUsed === null ? null : 100 - sessionUsed

  return (
    <ZStack
      modifiers={[
        containerBackground(backgroundColor, 'widget'),
        clipShape('containerRelativeShape'),
        widgetURL(provider.openUrl)
      ]}
    >
      <VStack
        alignment="leading"
        spacing={7}
        modifiers={[
          frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
          padding({ all: 14 }),
          accessibilityElement('combine')
        ]}
      >
        <HStack alignment="top" spacing={6}>
          <Gauge
            value={(weeklyUsed ?? 0) / 100}
            modifiers={[
              frame({ width: 46, height: 46 }),
              gaugeStyle('circularCapacity'),
              tint(primaryColor)
            ]}
          />
          <Spacer />
          <VStack alignment="trailing" spacing={2}>
            <Text
              modifiers={[
                font({ size: 11, weight: 'bold' }),
                foregroundStyle(primaryColor),
                lineLimit(1)
              ]}
            >
              {provider.name}
            </Text>
            <HStack spacing={4}>
              <Image systemName="arrow.triangle.2.circlepath" size={10} color={secondaryColor} />
              <Text
                modifiers={[font({ size: 9, weight: 'semibold' }), foregroundStyle(secondaryColor)]}
              >
                {provider.updatedLabel}
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
              {weeklyRemaining === null ? props.unavailableLabel : `${weeklyRemaining}%`}
            </Text>
            <HStack spacing={3}>
              <Circle modifiers={[frame({ width: 6, height: 6 }), foregroundStyle(primaryColor)]} />
              <Text
                modifiers={[
                  font({ size: 9, weight: 'semibold' }),
                  foregroundStyle(primaryColor),
                  lineLimit(1)
                ]}
              >
                {props.weeklyLabel}
              </Text>
            </HStack>
            <HStack spacing={4}>
              <Image systemName="clock.arrow.circlepath" size={10} color={primaryColor} />
              <Text
                modifiers={[
                  font({ size: 11, weight: 'bold' }),
                  foregroundStyle(primaryColor),
                  monospacedDigit(),
                  lineLimit(1)
                ]}
              >
                {provider.weeklyResetLabel}
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
                foregroundStyle(secondaryColor),
                monospacedDigit(),
                minimumScaleFactor(0.55),
                lineLimit(1)
              ]}
            >
              {sessionRemaining === null ? ' ' : `${sessionRemaining}%`}
            </Text>
            <HStack spacing={3}>
              <Circle
                modifiers={[frame({ width: 6, height: 6 }), foregroundStyle(secondaryColor)]}
              />
              <Text
                modifiers={[
                  font({ size: 9, weight: 'semibold' }),
                  foregroundStyle(secondaryColor),
                  lineLimit(1)
                ]}
              >
                {props.sessionLabel}
              </Text>
            </HStack>
            {sessionUsed === null ? (
              <Text modifiers={[font({ size: 11, weight: 'bold' })]}> </Text>
            ) : (
              <HStack spacing={3}>
                <Text
                  modifiers={[
                    font({ size: 11, weight: 'bold' }),
                    foregroundStyle(secondaryColor),
                    monospacedDigit(),
                    lineLimit(1)
                  ]}
                >
                  {`${sessionUsed}%`}
                </Text>
                <Text
                  modifiers={[
                    font({ size: 9, weight: 'semibold' }),
                    foregroundStyle(secondaryColor),
                    lineLimit(1)
                  ]}
                >
                  {props.usedLabel}
                </Text>
              </HStack>
            )}
          </VStack>
        </HStack>
      </VStack>
    </ZStack>
  )
}

export const claudeUsageWidget = createWidget('ClaudeUsageWidget', ProviderUsage)

export default createWidget('ProviderUsageWidget', ProviderUsage)
