import { existsSync, readFileSync } from 'node:fs'
import { connect, type Socket } from 'node:net'

import { encodeNdjson } from './ndjson'
import {
  PROTOCOL_VERSION,
  type HelloMessage,
  type HelloResponse,
  type SystemResolverHealth,
  type SystemResolverHealthResult
} from './types'

const HEALTH_CHECK_TIMEOUT_MS = 3_000
const RESOLVER_HEALTH_CHECK_TIMEOUT_MS = 3_000

export type DaemonHealth = 'healthy' | 'unreachable' | 'rejected' | 'pty-spawn-unhealthy'

export function canConnectDaemonSocket(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32' && !existsSync(socketPath)) {
      resolve(false)
      return
    }
    const socket = connect({ path: socketPath })
    let settled = false
    const cleanup = (): void => {
      clearTimeout(timer)
      socket.off('connect', onConnect)
      socket.off('error', onError)
    }
    const settle = (result: boolean): void => {
      if (!settled) {
        settled = true
        cleanup()
        resolve(result)
      }
    }
    const onConnect = (): void => {
      settle(true)
      socket.destroy()
    }
    const onError = (): void => settle(false)
    const timer = setTimeout(() => {
      settle(false)
      socket.destroy()
    }, 500)
    socket.on('connect', onConnect)
    socket.on('error', onError)
  })
}

export function checkDaemonHealth(socketPath: string, tokenPath: string): Promise<DaemonHealth> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32' && !existsSync(socketPath)) {
      resolve('unreachable')
      return
    }
    let token: string
    try {
      token = readFileSync(tokenPath, 'utf8').trim()
    } catch {
      resolve('unreachable')
      return
    }
    let settled = false
    let socket: Socket | null = null
    let buffer = ''
    const settle = (result: DaemonHealth): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      removeListeners()
      socket?.destroy()
      resolve(result)
    }
    const removeListeners = (): void => {
      socket?.off('error', onError)
      socket?.off('connect', onConnect)
      socket?.off('data', onData)
    }
    const onError = (): void => settle('unreachable')
    const onConnect = (): void => {
      const hello: HelloMessage = {
        type: 'hello',
        version: PROTOCOL_VERSION,
        token,
        clientId: 'health-check',
        role: 'control'
      }
      socket?.write(encodeNdjson(hello))
    }
    const onData = (chunk: Buffer): void => {
      if (settled) {
        return
      }
      buffer += chunk.toString()
      for (;;) {
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex === -1) {
          break
        }
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        if (!line) {
          continue
        }
        let message: Record<string, unknown>
        try {
          message = JSON.parse(line) as Record<string, unknown>
        } catch {
          settle('rejected')
          return
        }
        if (message.type === 'hello') {
          if (!(message as HelloResponse).ok) {
            settle('rejected')
            return
          }
          // Why: protocol liveness alone cannot detect a stale node-pty helper.
          socket?.write(encodeNdjson({ id: 'health-1', type: 'ptySpawnHealth' }))
        } else if (message.id === 'health-1') {
          settle(message.ok === true ? 'healthy' : 'pty-spawn-unhealthy')
          return
        }
      }
    }
    const timer = setTimeout(() => settle('unreachable'), HEALTH_CHECK_TIMEOUT_MS)
    socket = connect({ path: socketPath })
    socket.on('error', onError)
    socket.on('connect', onConnect)
    socket.on('data', onData)
  })
}

function isSystemResolverHealth(value: unknown): value is SystemResolverHealth {
  return value === 'healthy' || value === 'unhealthy' || value === 'unknown'
}

export function getMacDaemonSystemResolverHealth(
  socketPath: string,
  tokenPath: string,
  protocolVersion = PROTOCOL_VERSION
): Promise<SystemResolverHealth> {
  if (process.platform !== 'darwin') {
    return Promise.resolve('unknown')
  }
  return new Promise((resolve) => {
    if (!existsSync(socketPath)) {
      resolve('unknown')
      return
    }
    let token: string
    try {
      token = readFileSync(tokenPath, 'utf8').trim()
    } catch {
      resolve('unknown')
      return
    }
    let settled = false
    let socket: Socket | null = null
    let buffer = ''
    const settle = (result: SystemResolverHealth): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      removeListeners()
      socket?.destroy()
      resolve(result)
    }
    const removeListeners = (): void => {
      socket?.off('error', onError)
      socket?.off('connect', onConnect)
      socket?.off('data', onData)
    }
    const onError = (): void => settle('unknown')
    const onConnect = (): void => {
      const hello: HelloMessage = {
        type: 'hello',
        version: protocolVersion,
        token,
        clientId: 'resolver-health-check',
        role: 'control'
      }
      socket?.write(encodeNdjson(hello))
    }
    const onData = (chunk: Buffer): void => {
      if (settled) {
        return
      }
      buffer += chunk.toString()
      for (;;) {
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex === -1) {
          break
        }
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        if (!line) {
          continue
        }
        let message: Record<string, unknown>
        try {
          message = JSON.parse(line) as Record<string, unknown>
        } catch {
          settle('unknown')
          return
        }
        if (message.type === 'hello') {
          if (!(message as HelloResponse).ok) {
            settle('unknown')
            return
          }
          socket?.write(encodeNdjson({ id: 'resolver-health-1', type: 'systemResolverHealth' }))
        } else if (message.id === 'resolver-health-1') {
          if (!message.ok || typeof message.payload !== 'object' || message.payload === null) {
            settle('unknown')
            return
          }
          const payload = message.payload as Partial<SystemResolverHealthResult>
          settle(isSystemResolverHealth(payload.health) ? payload.health : 'unknown')
          return
        }
      }
    }
    const timer = setTimeout(() => settle('unknown'), RESOLVER_HEALTH_CHECK_TIMEOUT_MS)
    socket = connect({ path: socketPath })
    socket.on('error', onError)
    socket.on('connect', onConnect)
    socket.on('data', onData)
  })
}
