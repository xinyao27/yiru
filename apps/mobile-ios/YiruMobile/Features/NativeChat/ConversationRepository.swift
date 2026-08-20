import Foundation

nonisolated protocol NativeChatRepository: Sendable {
    func nativeChatUpdates(
        for hostID: String,
        agent: String,
        sessionID: String,
        transcriptPath: String?,
        limit: Int
    ) async throws -> AsyncThrowingStream<NativeChatFrame, Error>
    func readNativeChat(
        for hostID: String,
        agent: String,
        sessionID: String,
        transcriptPath: String?,
        beforeOffset: Int?,
        limit: Int
    ) async throws -> NativeChatPage
    func searchNativeChatFiles(
        for hostID: String,
        worktreeID: String,
        query: String,
        limit: Int
    ) async throws -> [String]
    func listNativeChatFiles(for hostID: String, worktreeID: String) async throws -> [String]
    func openNativeChatFile(
        for hostID: String,
        worktreeID: String,
        pathText: String,
        terminalID: String?
    ) async throws
    func uploadNativeChatImage(for hostID: String, data: Data) async throws -> String
}

nonisolated enum NativeChatRepositoryError: LocalizedError {
    case imageTooLarge
    case methodUnavailable
    case rejected(String)

    var errorDescription: String? {
        switch self {
        case .imageTooLarge: "Image too large to attach"
        case .methodUnavailable: "This host does not support the requested operation"
        case .rejected(let message): message
        }
    }
}
