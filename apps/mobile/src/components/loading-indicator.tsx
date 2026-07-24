import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import type { MobileLoaderStyle } from '../loading/mobile-loader-style'
import { useMobileLoaderStyle } from '../loading/mobile-loader-style-context'
import { useThemeColors } from '../theme/uniwind-theme-values'

type LoadingIndicatorProps = {
  size?: number
  loaderStyle?: MobileLoaderStyle
}

function useLoaderProgress(duration: number): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion)
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(0.5)
      return undefined
    }
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true
      })
    )
    animation.start()
    return () => animation.stop()
  }, [duration, progress, reduceMotion])

  return progress
}

function DrawingLoader({ size, color }: { size: number; color: string }): React.JSX.Element {
  const progress = useLoaderProgress(1600)
  const opacity = progress.interpolate({
    inputRange: [0, 0.12, 0.7, 1],
    outputRange: [0.35, 1, 1, 0.35]
  })
  const scale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.88, 1, 0.88]
  })

  return (
    <Animated.View style={{ width: size, height: size, opacity, transform: [{ scale }] }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M6.5 8 5 3.5l4 2.2a8.5 8.5 0 0 1 6 0l4-2.2L17.5 8c1 1.2 1.5 2.7 1.5 4.3 0 4-3.1 7.2-7 7.2s-7-3.2-7-7.2C5 10.7 5.5 9.2 6.5 8Z"
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M8.5 11h.1m6.8 0h.1M10 14c1.3 1.2 2.7 1.2 4 0m-2-1v2m-3.5-1.8-4-.8m4 2.2-3.7 1.2m10.7-2.6 4-.8m-4 2.2 3.7 1.2"
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Animated.View>
  )
}

function CodeLoader({ size, color }: { size: number; color: string }): React.JSX.Element {
  const progress = useLoaderProgress(800)
  const openOpacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.35, 1]
  })
  const closeOpacity = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.35, 1, 0.35]
  })
  const textStyle = {
    color,
    fontFamily: 'monospace',
    fontSize: size * 0.78,
    fontWeight: '700' as const,
    lineHeight: size
  }

  return (
    <View style={{ width: size, height: size, flexDirection: 'row', justifyContent: 'center' }}>
      <Animated.View style={{ opacity: openOpacity }}>
        <Text style={textStyle}>{'{'}</Text>
      </Animated.View>
      <Animated.View style={{ opacity: closeOpacity }}>
        <Text style={textStyle}>{'}'}</Text>
      </Animated.View>
    </View>
  )
}

function MacosLoader({ size, color }: { size: number; color: string }): React.JSX.Element {
  const progress = useLoaderProgress(1000)
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const bladeWidth = Math.max(1, size * 0.09)
  const bladeHeight = size * 0.26
  const radius = size * 0.31

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index * Math.PI) / 4
        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              width: bladeWidth,
              height: bladeHeight,
              backgroundColor: color,
              opacity: 0.25 + index * 0.09,
              left: size / 2 - bladeWidth / 2 + Math.sin(angle) * radius,
              top: size / 2 - bladeHeight / 2 - Math.cos(angle) * radius,
              transform: [{ rotate: `${index * 45}deg` }]
            }}
          />
        )
      })}
    </Animated.View>
  )
}

function SquareLoader({ size, color }: { size: number; color: string }): React.JSX.Element {
  const progress = useLoaderProgress(2000)
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const scaleY = progress.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0.02, 0.02, 1, 1, 0.02]
  })
  const inset = size * 0.12

  return (
    <Animated.View
      style={{
        width: size - inset * 2,
        height: size - inset * 2,
        margin: inset,
        borderWidth: Math.max(1, size * 0.08),
        borderColor: color,
        transform: [{ rotate }]
      }}
    >
      <Animated.View
        style={{ flex: 1, backgroundColor: color, transform: [{ scaleY }], opacity: 0.65 }}
      />
    </Animated.View>
  )
}

function FlipbookLoader({ size, color }: { size: number; color: string }): React.JSX.Element {
  const progress = useLoaderProgress(1200)
  const rotateY = progress.interpolate({
    inputRange: [0, 0.65, 1],
    outputRange: ['0deg', '-180deg', '-180deg']
  })

  return (
    <View
      style={{
        width: size,
        height: size * 0.6,
        marginTop: size * 0.2,
        borderWidth: Math.max(1, size * 0.07),
        borderColor: color
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          left: '50%',
          top: -1,
          width: '50%',
          height: size * 0.6,
          borderWidth: Math.max(1, size * 0.07),
          borderLeftWidth: 0,
          borderColor: color,
          backgroundColor: 'transparent',
          transform: [{ perspective: 200 }, { rotateY }]
        }}
      />
    </View>
  )
}

function EscaladeLoader({ size, color }: { size: number; color: string }): React.JSX.Element {
  const progress = useLoaderProgress(1600)
  const translateY = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [-size * 0.25, size * 0.25, -size * 0.25]
  })

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: size * 0.16,
        transform: [{ translateY }]
      }}
    >
      <View style={{ width: size * 0.18, height: size * 0.72, backgroundColor: color }} />
      <View
        style={{
          width: size * 0.18,
          height: size * 0.72,
          backgroundColor: color,
          transform: [{ translateY: size * 0.28 }]
        }}
      />
    </Animated.View>
  )
}

export function LoadingIndicator({
  size = 16,
  loaderStyle
}: LoadingIndicatorProps): React.JSX.Element {
  const configuredStyle = useMobileLoaderStyle().loaderStyle
  const style = loaderStyle ?? configuredStyle
  const color = useThemeColors().textPrimary

  switch (style) {
    case 'drawing':
      return <DrawingLoader size={size} color={color} />
    case 'code':
      return <CodeLoader size={size} color={color} />
    case 'macos':
      return <MacosLoader size={size} color={color} />
    case 'square':
      return <SquareLoader size={size} color={color} />
    case 'flipbook':
      return <FlipbookLoader size={size} color={color} />
    case 'escalade':
      return <EscaladeLoader size={size} color={color} />
  }
}
