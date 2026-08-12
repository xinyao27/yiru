enum AppRoute: Hashable {
    case designSystemCatalog
    case hosts
    case workspaces(HostProfile)
    case workspaceSession(HostProfile, WorkspaceSummary)
    case terminal(HostProfile, TerminalSummary)
    case terminalSettings
    case pair
    case pairConfirm(PairingOffer)
    case terminalPrototype
}
