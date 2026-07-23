import { describe, expect, it, vi } from 'vite-plus/test'

import { BrowserRemoteScreencastAuthority } from './browser-remote-screencast-authority'

describe('BrowserRemoteScreencastAuthority', () => {
  it('preserves desktop ownership when take-back stops a mobile screencast', async () => {
    let finishSession: () => void = () => undefined
    const sessionDone = new Promise<void>((resolve) => {
      finishSession = resolve
    })
    const emitted: string[] = []
    const driverChanges: string[] = []
    const cleanups = new Map<string, () => void | Promise<void>>()
    const sessions = new BrowserRemoteScreencastAuthority<{
      format: 'jpeg' | 'png'
      page?: string
    }>({
      startScreencast: async () => ({
        subscriptionId: 'cast-one',
        ready: {
          type: 'ready',
          subscriptionId: 'cast-one',
          browserPageId: 'page-one',
          format: 'jpeg',
          tab: {
            browserPageId: 'page-one',
            index: 0,
            url: 'https://example.com',
            title: 'Example',
            active: true
          }
        },
        session: {
          done: sessionDone,
          stop: finishSession
        }
      }),
      registerSubscriptionCleanup: (subscriptionId, cleanup) => {
        cleanups.set(subscriptionId, cleanup)
      },
      cleanupSubscription: (subscriptionId) => {
        cleanups.delete(subscriptionId)
      },
      notifyDriverChanged: (_browserPageId, driver) => {
        driverChanges.push(driver.kind)
      }
    })

    const streaming = sessions.screencast(
      { format: 'jpeg', page: 'page-one' },
      {
        connectionId: 'phone-one',
        sendBinary: () => true,
        emit: (event) => emitted.push(event.type)
      }
    )
    await vi.waitFor(() => expect(emitted).toEqual(['ready']))

    expect(sessions.getDrivers().get('page-one')).toEqual({
      kind: 'mobile',
      clientId: 'phone-one'
    })
    expect(sessions.reclaimForDesktop('page-one')).toBe(true)
    await streaming

    expect(emitted).toEqual(['ready', 'end'])
    expect(driverChanges).toEqual(['mobile', 'desktop'])
    expect(sessions.getDrivers().get('page-one')).toEqual({ kind: 'desktop' })
    expect(cleanups.size).toBe(0)
  })

  it('keeps desktop ownership when take-back happens while screencast startup is pending', async () => {
    let finishStart: () => void = () => undefined
    const startGate = new Promise<void>((resolve) => {
      finishStart = resolve
    })
    let finishSession: () => void = () => undefined
    const sessionDone = new Promise<void>((resolve) => {
      finishSession = resolve
    })
    const emitted: string[] = []
    const driverChanges: string[] = []
    const sessions = new BrowserRemoteScreencastAuthority<{
      format: 'jpeg' | 'png'
      page?: string
    }>({
      startScreencast: async () => {
        await startGate
        return {
          subscriptionId: 'cast-pending',
          ready: {
            type: 'ready',
            subscriptionId: 'cast-pending',
            browserPageId: 'page-pending',
            format: 'jpeg',
            tab: {
              browserPageId: 'page-pending',
              index: 0,
              url: 'https://example.com',
              title: 'Example',
              active: true
            }
          },
          session: { done: sessionDone, stop: finishSession }
        }
      },
      registerSubscriptionCleanup: () => undefined,
      cleanupSubscription: () => undefined,
      notifyDriverChanged: (_browserPageId, driver) => {
        driverChanges.push(driver.kind)
      }
    })

    const streaming = sessions.screencast(
      { format: 'jpeg', page: 'page-pending' },
      {
        connectionId: 'phone-pending',
        sendBinary: () => true,
        emit: (event) => emitted.push(event.type)
      }
    )
    expect(sessions.reclaimForDesktop('page-pending')).toBe(true)
    finishStart()
    await Promise.resolve()
    await Promise.resolve()
    finishSession()
    await streaming

    expect(emitted).toEqual([])
    expect(driverChanges).toEqual(['desktop'])
    expect(sessions.getDrivers().get('page-pending')).toEqual({ kind: 'desktop' })
  })

  it('honors take-back during an implicit active-page screencast start', async () => {
    let finishStart: () => void = () => undefined
    const startGate = new Promise<void>((resolve) => {
      finishStart = resolve
    })
    let finishSession: () => void = () => undefined
    const sessionDone = new Promise<void>((resolve) => {
      finishSession = resolve
    })
    const emitted: string[] = []
    const sessions = new BrowserRemoteScreencastAuthority<{
      format: 'jpeg' | 'png'
      page?: string
    }>({
      startScreencast: async () => {
        await startGate
        return {
          subscriptionId: 'cast-implicit',
          ready: {
            type: 'ready',
            subscriptionId: 'cast-implicit',
            browserPageId: 'page-implicit',
            format: 'jpeg',
            tab: {
              browserPageId: 'page-implicit',
              index: 0,
              url: 'https://example.com',
              title: 'Example',
              active: true
            }
          },
          session: { done: sessionDone, stop: finishSession }
        }
      },
      registerSubscriptionCleanup: () => undefined,
      cleanupSubscription: () => undefined,
      notifyDriverChanged: () => undefined
    })

    const streaming = sessions.screencast(
      { format: 'jpeg' },
      {
        connectionId: 'phone-implicit',
        sendBinary: () => true,
        emit: (event) => emitted.push(event.type)
      }
    )
    sessions.reclaimForDesktop('page-implicit')
    finishStart()
    await Promise.resolve()
    await Promise.resolve()
    finishSession()
    await streaming

    expect(emitted).toEqual([])
    expect(sessions.getDrivers().get('page-implicit')).toEqual({ kind: 'desktop' })
  })
})
