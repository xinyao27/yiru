import { describe, expect, it } from 'vite-plus/test'
import { formatBase64PayloadByteCount } from './base64-payload-byte-count'

describe('formatBase64PayloadByteCount', () => {
  it('reports decoded binary size for base64 payloads', () => {
    const payload = Buffer.from('png-data').toString('base64')
    expect(formatBase64PayloadByteCount(payload)).toBe('8 bytes')
  })
})
