export function translate(message: string, values: Record<string, string | number> = {}): string {
  return message.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (token, name: string) => {
    const value = values[name]
    return value === undefined ? token : String(value)
  })
}
