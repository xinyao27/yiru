import { describe, expect, it } from 'vite-plus/test'

import { MobileNotificationChannel } from './mobile-notification-channel'

describe('MobileNotificationChannel', () => {
  it('uses one monotonic sequence for live delivery and reconnect replay', () => {
    const channel = new MobileNotificationChannel()
    const live: { type: string; notificationSeq?: number }[] = []
    const unsubscribe = channel.subscribe((event) => live.push(event))

    channel.dispatch({
      type: 'notification',
      source: 'test',
      title: 'Complete',
      body: 'Task finished'
    })
    channel.dismiss('notification-one')

    expect(live.map((event) => event.notificationSeq)).toEqual([1, 2])
    expect(channel.getMissedSince(1)).toEqual([live[1]])

    unsubscribe()
    channel.dispatch({
      type: 'notification',
      source: 'test',
      title: 'Detached',
      body: 'No live subscriber'
    })
    expect(live).toHaveLength(2)
    expect(channel.getMissedSince(2)).toMatchObject([{ notificationSeq: 3 }])
  })
})
