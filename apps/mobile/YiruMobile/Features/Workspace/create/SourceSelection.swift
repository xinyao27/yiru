import Foundation

nonisolated struct WorkspaceSourceRef: Identifiable, Hashable, Sendable {
    let refName: String
    let localBranchName: String

    var id: String { "\(refName):\(localBranchName)" }
}

nonisolated enum WorkspaceSourceSelection: Hashable, Sendable {
    case branch(refName: String, localBranchName: String, isReused: Bool)
    case newBranch(String)
    case hosted(item: WorkspaceHostedSource, base: WorkspaceHostedBase)

    var label: String {
        switch self {
        case .branch(let refName, _, _): refName
        case .newBranch(let name): name
        case .hosted(let item, _): "#\(item.number) \(item.title)"
        }
    }
}

nonisolated enum WorkspaceSourceMode: String, CaseIterable, Identifiable, Sendable {
    case smart
    case github
    case gitlab
    case branch
    case text

    var id: String { rawValue }
}

nonisolated enum WorkspaceHostedSourceProvider: String, Sendable {
    case github
    case gitlab
}

nonisolated enum WorkspaceGitLabMRState: String, CaseIterable, Identifiable, Sendable {
    case opened
    case merged
    case closed
    case all

    var id: String { rawValue }
}

nonisolated struct WorkspaceHostedSource: Identifiable, Hashable, Sendable {
    let id: String
    let provider: WorkspaceHostedSourceProvider
    let number: Int
    let title: String
    let state: String
    let url: String
    let branchName: String?
    let baseRefName: String?
    let isCrossRepository: Bool?

    init(wire: MobileWorkspaceSourceItemWire, provider: WorkspaceHostedSourceProvider) {
        id = "\(provider.rawValue):\(wire.id)"
        self.provider = provider
        number = wire.number
        title = wire.title
        state = wire.state
        url = wire.url
        branchName = wire.branchName
        baseRefName = wire.baseRefName
        isCrossRepository = wire.isCrossRepository
    }
}

nonisolated struct WorkspaceHostedBase: Hashable, Sendable {
    let baseBranch: String
    let compareBaseRef: String?
    let pushTarget: WorkspacePushTarget?
    let branchNameOverride: String?
}

nonisolated struct WorkspacePushTarget: Hashable, Sendable {
    let remoteName: String
    let branchName: String
    let remoteURL: String?
    let wasRemoteCreated: Bool?

    init(wire: MobileGitPushTargetWire) {
        remoteName = wire.remoteName
        branchName = wire.branchName
        remoteURL = wire.remoteUrl
        wasRemoteCreated = wire.remoteCreated
    }

    var wire: MobileGitPushTargetWire {
        MobileGitPushTargetWire(
            remoteName: remoteName,
            branchName: branchName,
            remoteUrl: remoteURL,
            remoteCreated: wasRemoteCreated
        )
    }
}

nonisolated enum WorkspaceHostedSourceError: Error {
    case rejected(String)
    case githubRemoteRequired
}
