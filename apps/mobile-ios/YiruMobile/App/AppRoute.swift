enum AppRoute: Hashable {
    case designSystemCatalog
    case hosts
    case workspaces(HostProfile)
    case terminals(HostProfile, WorkspaceSummary)
    case pair
    case pairConfirm(PairingOffer)
    case terminalPrototype
}
