export function splitMobileTerminalInput(text: string, maxBytes: number): string[] {
  if (text.length === 0) {
    return []
  }
  const encoder = new TextEncoder()
  const chunks: string[] = []
  let chunk = ''
  let chunkBytes = 0
  for (const character of text) {
    const characterBytes = encoder.encode(character).byteLength
    if (chunkBytes + characterBytes > maxBytes && chunk.length > 0) {
      chunks.push(chunk)
      chunk = ''
      chunkBytes = 0
    }
    chunk += character
    chunkBytes += characterBytes
  }
  if (chunk.length > 0) {
    chunks.push(chunk)
  }
  return chunks
}
