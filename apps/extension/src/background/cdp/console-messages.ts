import {
  drainConsoleSensor,
  isConsoleSensorActive,
  startConsoleSensor,
  stopConsoleSensor
} from './console-sensor'

type Respond = (response: unknown) => void

export function handleConsoleSensorMessage(message: object, respond: Respond): boolean | null {
  const type = Reflect.get(message, 'type')
  if (
    type !== 'console-sensor-status' &&
    type !== 'console-sensor-start' &&
    type !== 'console-sensor-stop' &&
    type !== 'console-sensor-drain'
  ) {
    return null
  }
  const tabId = Reflect.get(message, 'tabId')
  if (typeof tabId !== 'number' || !Number.isInteger(tabId)) {
    respond({ error: 'invalid_tab_id', ok: false })
    return false
  }
  if (type === 'console-sensor-status') {
    respond({ isActive: isConsoleSensorActive(tabId), ok: true })
    return false
  }
  if (type === 'console-sensor-drain') {
    respond({ entries: drainConsoleSensor(tabId), ok: true })
    return false
  }
  const task =
    type === 'console-sensor-start' ? startConsoleSensor(tabId) : stopConsoleSensor(tabId)
  void task.then(
    () => respond({ ok: true }),
    (error: unknown) =>
      respond({ error: error instanceof Error ? error.message : String(error), ok: false })
  )
  return true
}
