export const LOCAL_LOG_TAIL_CHUNK_BYTES = 256 * 1024

// Why: structurally identical to the runtime contract's FileLogTailReadInput/
// RuntimeLogTailReadResult (packages/runtime-protocol/src/contract/file-
// input.ts, file-result.ts) — files.readLogTail/watchLogTail are the only
// callers left (main/runtime/rpc/methods/log-tail-methods.ts), so this stays
// the shared shape between the reader and the editor's decoder without
// importing the contract package into main/ai-vault.
export type LocalLogTailReadResult = {
  contentBase64: string
  nextByteOffset: number
  fileSize: number
  fileIdentity: string
  hasMore: boolean
  reset: boolean
}
