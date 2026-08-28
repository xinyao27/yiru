import {
  encodeServeSimTouchFrame,
  type ServeSimTouchFrame
} from '@yiru/runtime-protocol/workbench/emulator-touch-frame'

export type EmulatorGesturePoint = ServeSimTouchFrame

export async function sendEmulatorGestureSequence(
  wsUrl: string,
  points: EmulatorGesturePoint[]
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let index = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }
    const sendNext = (): void => {
      if (index >= points.length) {
        cleanup()
        timer = setTimeout(() => {
          ws.close()
          resolve()
        }, 50)
        return
      }
      const point = points[index++]
      ws.send(Buffer.from(encodeServeSimTouchFrame(point)))
      timer = setTimeout(sendNext, 16)
    }
    ws.addEventListener('open', sendNext)
    ws.addEventListener('error', () => {
      cleanup()
      reject(new Error('Could not connect to the emulator gesture stream'))
    })
    ws.addEventListener('close', () => {
      cleanup()
      if (index < points.length) {
        reject(new Error('Emulator gesture stream closed before all points were sent'))
      }
    })
  })
}
