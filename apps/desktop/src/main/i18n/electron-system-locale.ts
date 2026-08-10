import { app } from 'electron'

export function getElectronSystemLocale(): string {
  return app.getLocale()
}
