import { translate } from '../i18n/translate'

export function writeCliOutput(value: unknown, json: boolean, summary: string): void {
  console.log(json ? JSON.stringify(value) : summary)
}

export function reportCliError(error: unknown): never {
  console.error(
    `${translate('Yiru command failed')}:`,
    error instanceof Error ? error.message : String(error)
  )
  process.exit(1)
}
