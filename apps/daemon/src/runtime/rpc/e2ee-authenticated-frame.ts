type E2EEAuthenticatedFrameArgs = {
  capabilities: readonly string[]
  runtimeId?: string
  transcriptHashB64?: string
}

export function createE2EEAuthenticatedFrame(args: E2EEAuthenticatedFrameArgs):
  | {
      type: 'e2ee_authenticated'
      runtimeId?: string
      capabilities?: readonly string[]
    }
  | {
      type: 'e2ee_authenticated'
      v: 2
      transcriptHashB64: string
      runtimeId?: string
      capabilities?: readonly string[]
    } {
  const metadata = {
    ...(args.runtimeId ? { runtimeId: args.runtimeId } : {}),
    ...(args.capabilities.length > 0 ? { capabilities: args.capabilities } : {})
  }
  return args.transcriptHashB64
    ? {
        type: 'e2ee_authenticated',
        v: 2,
        transcriptHashB64: args.transcriptHashB64,
        ...metadata
      }
    : { type: 'e2ee_authenticated', ...metadata }
}
