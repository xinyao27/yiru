import type { AiVaultSession } from '../../shared/ai-vault-types'

export type AiVaultSessionInventorySnapshot = {
  scannedAt: string
}

export type AiVaultSessionInventorySlice = {
  sessions: readonly AiVaultSession[]
  nextOffset: number
  complete: boolean
}

export type AiVaultSessionInventoryPage = {
  sessions: readonly AiVaultSession[]
  nextCursor: string | null
  scannedAt: string
}
