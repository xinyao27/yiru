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

export type TokenUsageWidgetProps = {
  openUrl: string
  thisWeekLabel: string
  todayLabel: string
  todayTokens: number
  todayTokensLabel: string
  todayValueLabel: string
  updatedLabel: string
  weekTokens: number
  weekTokensLabel: string
  weekValueLabel: string
}

function TokenUsage(
  props: TokenUsageWidgetProps,
  environment: WidgetEnvironment
): React.JSX.Element {
  'widget'

  const isDark = environment.colorScheme === 'dark'
  const backgroundColor = isDark ? '#8F432B' : '#C96843'
  const primaryColor = '#FFFFFF'
  const secondaryColor = '#FFD8A8'
  const todayShare = props.weekTokens === 0 ? 0 : props.todayTokens / props.weekTokens

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
        spacing={7}
        modifiers={[
          frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
          padding({ all: 14 }),
          accessibilityElement('combine')
        ]}
      >
        <HStack alignment="top" spacing={6}>
          <Gauge
            value={Math.max(0, Math.min(1, todayShare))}
            modifiers={[
              frame({ width: 46, height: 46 }),
              gaugeStyle('circularCapacity'),
              tint(primaryColor)
            ]}
          />
          <Spacer />
          <HStack spacing={5}>
            <Image systemName="arrow.triangle.2.circlepath" size={11} color={primaryColor} />
            <Text
              modifiers={[
                font({ size: 9, weight: 'semibold' }),
                foregroundStyle(primaryColor),
                minimumScaleFactor(0.65),
                lineLimit(1)
              ]}
            >
              {props.updatedLabel}
            </Text>
          </HStack>
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
              {props.todayTokensLabel}
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
                {props.todayLabel}
              </Text>
            </HStack>
            <Text
              modifiers={[
                font({ size: 11, weight: 'bold' }),
                foregroundStyle(primaryColor),
                monospacedDigit(),
                lineLimit(1)
              ]}
            >
              {props.todayValueLabel}
            </Text>
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
              {props.weekTokensLabel}
            </Text>
            <HStack spacing={3}>
              <Circle
                modifiers={[frame({ width: 6, height: 6 }), foregroundStyle(secondaryColor)]}
              />
              <Text
                modifiers={[
                  font({ size: 9, weight: 'semibold' }),
                  foregroundStyle(secondaryColor),
                  minimumScaleFactor(0.8),
                  lineLimit(1)
                ]}
              >
                {props.thisWeekLabel}
              </Text>
            </HStack>
            <Text
              modifiers={[
                font({ size: 11, weight: 'bold' }),
                foregroundStyle(secondaryColor),
                monospacedDigit(),
                lineLimit(1)
              ]}
            >
              {props.weekValueLabel}
            </Text>
          </VStack>
        </HStack>
      </VStack>
    </ZStack>
  )
}

export default createWidget('TokenUsageWidget', TokenUsage)
