import { ipcMain } from 'electron'
import type {
  RateLimitBannerReport,
  RateLimitHit,
  RateLimitResumeSchedule
} from '~shared/rate-limit-resume/types'

import type { RateLimitResumeService } from './service'

export function registerRateLimitResumeHandlers(service: RateLimitResumeService): void {
  ipcMain.handle(
    'rateLimitResume:report',
    (_event, report: RateLimitBannerReport): RateLimitHit => service.reportBanner(report)
  )
  ipcMain.handle('rateLimitResume:list', (): RateLimitResumeSchedule[] => service.list())
  ipcMain.handle(
    'rateLimitResume:schedule',
    (_event, hit: RateLimitHit): RateLimitResumeSchedule => service.schedule(hit)
  )
  ipcMain.handle(
    'rateLimitResume:cancel',
    (_event, args: { id: string }): RateLimitResumeSchedule => service.cancel(args.id)
  )
  ipcMain.handle(
    'rateLimitResume:runNow',
    (_event, args: { id: string }): RateLimitResumeSchedule => service.runNow(args.id)
  )
  ipcMain.handle(
    'rateLimitResume:markFired',
    (_event, args: { id: string }): RateLimitResumeSchedule => service.markFired(args.id)
  )
  ipcMain.handle(
    'rateLimitResume:markFailed',
    (_event, args: { id: string; reason: string }): RateLimitResumeSchedule =>
      service.markFailed(args.id, args.reason)
  )
  ipcMain.handle(
    'rateLimitResume:markStale',
    (_event, args: { id: string }): RateLimitResumeSchedule => service.markStale(args.id)
  )
  ipcMain.handle('rateLimitResume:rendererReady', (): void => {
    service.setRendererReady()
  })
}
