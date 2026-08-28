import { useRef, useState } from 'react'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'

import type { EmulatorDeviceVisualOrientation } from './emulator-device-frame-layout'
import type { EmulatorGesturePoint } from './emulator-screen-gesture'

export function useEmulatorPaneControls(worktreeId: string, onRotateSettled?: () => void) {
  const nextRotateOrientationRef = useRef<'landscape_left' | 'portrait'>('landscape_left')
  const visualOrientationEpochRef = useRef(0)
  const [visualOrientation, setVisualOrientation] =
    useState<EmulatorDeviceVisualOrientation>('portrait')

  const sendTap = async (x: number, y: number) => {
    await callRuntimeOrpc({ kind: 'local' }, (client) => client.emulator.tap, {
      x,
      y,
      worktree: worktreeId
    })
  }

  const sendButton = async (name: string) => {
    await callRuntimeOrpc({ kind: 'local' }, (client) => client.emulator.button, {
      name,
      worktree: worktreeId
    })
  }

  const sendGesture = async (points: EmulatorGesturePoint[]) => {
    await callRuntimeOrpc({ kind: 'local' }, (client) => client.emulator.gesture, {
      points,
      worktree: worktreeId
    })
  }

  const sendRotate = async () => {
    const orientation = nextRotateOrientationRef.current
    const epoch = visualOrientationEpochRef.current
    await callRuntimeOrpc({ kind: 'local' }, (client) => client.emulator.rotate, {
      orientation,
      worktree: worktreeId
    })
    if (visualOrientationEpochRef.current !== epoch) {
      return null
    }
    const nextVisualOrientation = orientation === 'landscape_left' ? 'landscape' : 'portrait'
    setVisualOrientation(nextVisualOrientation)
    nextRotateOrientationRef.current =
      orientation === 'landscape_left' ? 'portrait' : 'landscape_left'
    onRotateSettled?.()
    return nextVisualOrientation
  }

  const resetVisualOrientation = () => {
    visualOrientationEpochRef.current += 1
    nextRotateOrientationRef.current = 'landscape_left'
    setVisualOrientation('portrait')
  }

  return { sendTap, sendButton, sendGesture, sendRotate, visualOrientation, resetVisualOrientation }
}
