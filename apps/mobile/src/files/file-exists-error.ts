export function isFileExistsErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('eexist') || normalized.includes('already exists')
}
