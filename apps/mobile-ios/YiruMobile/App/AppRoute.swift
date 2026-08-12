enum AppRoute: Hashable {
    case designSystemCatalog
    case hosts
    case workspaces(HostProfile)
    case terminals(HostProfile, WorkspaceSummary)
    case terminal(HostProfile, TerminalSummary)
    case pair
    case pairConfirm(PairingOffer)
    case terminalPrototype
}
