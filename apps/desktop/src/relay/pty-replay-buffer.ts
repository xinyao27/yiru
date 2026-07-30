const DROPPED_HEAD_COMPACT_THRESHOLD = 1024

export class PtyReplayBuffer {
  private chunks: string[] = []
  private headIndex = 0
  private headOffset = 0
  private totalLength = 0
  private readonly limit: number

  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error(`PTY replay buffer limit must be a positive integer, got ${limit}`)
    }
    this.limit = limit
  }

  append(data: string): void {
    if (data.length === 0) {
      return
    }
    if (data.length >= this.limit) {
      this.chunks = [data.slice(-this.limit)]
      this.headIndex = 0
      this.headOffset = 0
      this.totalLength = this.limit
      return
    }

    this.chunks.push(data)
    this.totalLength += data.length
    while (this.totalLength > this.limit) {
      const headRemaining = this.chunks[this.headIndex].length - this.headOffset
      const excess = this.totalLength - this.limit
      if (headRemaining <= excess) {
        this.chunks[this.headIndex] = ''
        this.headIndex += 1
        this.headOffset = 0
        this.totalLength -= headRemaining
      } else {
        this.headOffset += excess
        this.totalLength -= excess
      }
    }
    if (this.headIndex >= DROPPED_HEAD_COMPACT_THRESHOLD) {
      this.chunks = this.chunks.slice(this.headIndex)
      this.headIndex = 0
    }
  }

  read(): string {
    if (this.chunks.length - this.headIndex > 1) {
      const retained = this.chunks.slice(this.headIndex)
      if (this.headOffset > 0) {
        retained[0] = retained[0].slice(this.headOffset)
      }
      this.chunks = [retained.join('')]
      this.headIndex = 0
      this.headOffset = 0
    } else if (this.headOffset > 0) {
      this.chunks[this.headIndex] = this.chunks[this.headIndex].slice(this.headOffset)
      this.headOffset = 0
    }
    return this.chunks[this.headIndex] ?? ''
  }
}
