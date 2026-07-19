import { getRuntimePathBasename } from '../../../shared/cross-platform-path'
import type { LspServerCapabilities } from './language-server-protocol'

export function validateSynchronizationCapability(capabilities: LspServerCapabilities): void {
  const sync = capabilities.textDocumentSync
  const syncKind = typeof sync === 'number' ? sync : sync?.change
  const supportsOpenClose = typeof sync === 'number' || sync?.openClose === true
  if (!supportsOpenClose || (syncKind !== 1 && syncKind !== 2)) {
    throw new Error('Language server does not support synchronized open documents.')
  }
}

export function getLanguageServerWorkspaceName(workspacePath: string): string {
  return getRuntimePathBasename(workspacePath) || workspacePath
}

export function stageTwoClientCapabilities(): Record<string, unknown> {
  return {
    workspace: { applyEdit: false, configuration: false, workspaceFolders: true },
    textDocument: {
      synchronization: { dynamicRegistration: false, didSave: false, willSave: false },
      hover: { dynamicRegistration: false, contentFormat: ['markdown', 'plaintext'] },
      definition: { dynamicRegistration: false, linkSupport: true },
      completion: {
        dynamicRegistration: false,
        contextSupport: true,
        completionItem: {
          snippetSupport: true,
          commitCharactersSupport: true,
          documentationFormat: ['markdown', 'plaintext'],
          deprecatedSupport: true,
          preselectSupport: true,
          insertReplaceSupport: true,
          tagSupport: { valueSet: [1] }
        }
      },
      signatureHelp: {
        dynamicRegistration: false,
        contextSupport: true,
        signatureInformation: {
          documentationFormat: ['markdown', 'plaintext'],
          activeParameterSupport: true,
          parameterInformation: { labelOffsetSupport: true }
        }
      },
      references: { dynamicRegistration: false },
      documentSymbol: {
        dynamicRegistration: false,
        hierarchicalDocumentSymbolSupport: true,
        tagSupport: { valueSet: [1] }
      },
      publishDiagnostics: {
        relatedInformation: false,
        versionSupport: true,
        codeDescriptionSupport: true,
        tagSupport: { valueSet: [1, 2] }
      }
    },
    window: { workDoneProgress: false }
  }
}
